"""Turning the books into something the GST portal will accept.

Three jobs, in the order a business does them:

1. **Validate.** Catch what the portal will reject, plus what it will silently
   accept and the department will query later. A rejected upload costs an
   afternoon; an accepted-but-wrong return costs interest and a notice, so both
   classes of problem are reported and the second is not treated as cosmetic.
2. **Generate.** Build GSTR-1 from sales invoices and pre-fill GSTR-3B from the
   matched position, in the portal's own JSON shape.
3. **Export.** JSON for the offline utility, CSV for a human to read or a CA to
   check before anything is filed.

The portal's schema is the contract and it changes on the government's
timetable, so the shapes here are built explicitly rather than derived from the
ORM: when the schema moves, the diff should land in this file and nowhere else.

Two conventions the portal uses and nothing else does:

* ``fp`` / ``ret_period`` is ``MMYYYY``. Not ``YYYY-MM``, which is what the
  rest of this codebase stores.
* Invoice dates are ``dd-mm-yyyy``.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.sanitize import csv_safe
from app.models.business import Business
from app.models.gstr_return import GSTRReturn, ReturnStatus, ReturnType
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import gst_calendar, invoice_parser, invoice_service
from app.services import gstin as gstin_service
from app.services import itc as itc_service

ZERO = Decimal("0.00")

# The rates GST actually levies. A rate outside this set is a data-entry error
# every time — there is no 15% or 20% slab — and the portal rejects it.
#
# Imported rather than restated. This file and the parser each held a list, and
# they had drifted apart: the parser's was short five slabs, so it dropped the
# rate off any invoice on one of them, and the check below then had no rate to
# verify the tax against. Two lists of what GST charges is one of them being
# wrong, and neither module is the obvious loser when they disagree.
VALID_RATES = invoice_parser.VALID_TAX_RATES

# Tolerance when checking that tax equals rate x taxable value, or that the
# total equals value plus tax. Both sides round independently at the line and
# at the invoice, and a rupee of arithmetic is not a filing error.
ARITHMETIC_TOLERANCE = Decimal("1.00")

# Above this invoice value an inter-state B2C supply must be reported
# invoice-by-invoice (B2CL) rather than in the rate-wise B2CS summary.
B2CL_THRESHOLD = Decimal("250000.00")

# The portal's schema version at the time of writing. Sent verbatim in the
# envelope; the offline utility checks it.
GSTR1_VERSION = "GST3.0.4"


class Severity(str, Enum):
    """Whether a finding stops a filing or merely ought to be looked at."""

    ERROR = "error"  # The portal will reject this, or the figure is wrong.
    WARNING = "warning"  # Filing will succeed; the department may still ask.


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_portal_period(period: str) -> str:
    """``2026-04`` -> ``042026``, the portal's ``fp``/``ret_period`` form."""
    year, month = period.split("-")
    return f"{month}{year}"


def to_portal_date(value: date | None) -> str | None:
    """``date(2026, 4, 15)`` -> ``15-04-2026``."""
    return value.strftime("%d-%m-%Y") if value else None


def _tax_total(invoice: Invoice) -> Decimal:
    return (
        (invoice.igst or ZERO)
        + (invoice.cgst or ZERO)
        + (invoice.sgst or ZERO)
        + (invoice.cess or ZERO)
    )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@dataclass
class ValidationIssue:
    """One problem found on one invoice, before anything is filed."""

    invoice_id: int | None
    invoice_number: str | None
    field: str
    severity: Severity
    message: str

    def as_dict(self) -> dict:
        return {
            "invoice_id": self.invoice_id,
            "invoice_number": self.invoice_number,
            "field": self.field,
            "severity": self.severity.value,
            "message": self.message,
        }


@dataclass
class ValidationReport:
    """Everything wrong with a period, and whether it can be filed."""

    period: str
    issues: list[ValidationIssue] = field(default_factory=list)
    invoice_count: int = 0

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity is Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity is Severity.WARNING]

    @property
    def ok(self) -> bool:
        """True when nothing blocks a filing. Warnings do not block."""
        return not self.errors

    def as_dict(self) -> dict:
        return {
            "period": self.period,
            "ok": self.ok,
            "invoice_count": self.invoice_count,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "issues": [issue.as_dict() for issue in self.issues],
        }


def validate_invoice(
    invoice: Invoice, *, business_state: str | None, period: str
) -> list[ValidationIssue]:
    """Everything wrong with one invoice, from the portal's point of view."""
    issues: list[ValidationIssue] = []

    def add(field_name: str, severity: Severity, message: str) -> None:
        issues.append(
            ValidationIssue(
                invoice_id=invoice.id,
                invoice_number=invoice.invoice_number,
                field=field_name,
                severity=severity,
                message=message,
            )
        )

    is_sales = invoice.invoice_type == InvoiceType.SALES

    # ---- Identity ----
    if not invoice.invoice_number:
        add("invoice_number", Severity.ERROR, "Invoice number is missing")
    elif len(invoice.invoice_number) > 16:
        # The portal caps invoice numbers at 16 characters.
        add(
            "invoice_number",
            Severity.ERROR,
            f"Invoice number is {len(invoice.invoice_number)} characters; the portal allows 16",
        )

    if invoice.invoice_date is None:
        add("invoice_date", Severity.ERROR, "Invoice date is missing")
    elif invoice.period and invoice.period != period:
        add(
            "invoice_date",
            Severity.WARNING,
            f"Dated {invoice.period}, being filed under {period}",
        )

    # ---- Counterparty ----
    if invoice.counterparty_gstin:
        if not gstin_service.is_valid(invoice.counterparty_gstin):
            add(
                "counterparty_gstin",
                Severity.ERROR,
                f"{invoice.counterparty_gstin} is not a valid GSTIN",
            )
    elif is_sales:
        # A sale without a counterparty GSTIN is B2C, which is legitimate — it
        # just files in a different block, so this is worth saying rather than
        # failing on.
        add(
            "counterparty_gstin",
            Severity.WARNING,
            "No GSTIN — will be filed as a B2C supply",
        )
    else:
        # A purchase without a supplier GSTIN can never be matched in GSTR-2B,
        # so the credit on it is unclaimable until someone fills it in.
        add(
            "counterparty_gstin",
            Severity.ERROR,
            "Supplier GSTIN is missing; ITC cannot be claimed without it",
        )

    # ---- HSN ----
    if not invoice.hsn_code:
        add("hsn_code", Severity.WARNING, "HSN code is missing")
    elif not invoice.hsn_code.isdigit() or len(invoice.hsn_code) not in (4, 6, 8):
        add(
            "hsn_code",
            Severity.ERROR,
            f"HSN '{invoice.hsn_code}' must be 4, 6 or 8 digits",
        )

    # ---- Money ----
    tax = _tax_total(invoice)
    taxable = invoice.taxable_value or ZERO

    if taxable <= ZERO and tax <= ZERO:
        add("taxable_value", Severity.ERROR, "Invoice has no taxable value and no tax")
    elif taxable <= ZERO:
        # Tax on nothing. GST is a percentage of a value, so there is no rate
        # and no supply that produces this — it is an extraction that read the
        # tax boxes off the document and missed the one they were computed
        # from, which is a common enough way for a photographed invoice to come
        # back.
        #
        # Caught here or not at all. The rate cross-check below is skipped when
        # there is no taxable value to apply a rate to, and the check above only
        # fires when *both* are empty, so an invoice carrying ₹18,000 of IGST
        # against a taxable value of zero validated completely clean. It then
        # filed as a rate-zero line carrying tax — ``_rate_of`` derives the rate
        # from the figures and gets 0% — which the portal rejects on upload.
        # That is the afternoon this module exists to save.
        add(
            "taxable_value",
            Severity.ERROR,
            f"Tax of {_q(tax)} on a taxable value of zero. Tax is a percentage "
            "of a value, so the value is missing rather than nil.",
        )

    if invoice.tax_rate is not None and invoice.tax_rate not in VALID_RATES:
        add(
            "tax_rate",
            Severity.ERROR,
            f"{invoice.tax_rate}% is not a GST rate",
        )

    # Tax should be the rate applied to the taxable value. Checked only when a
    # single rate is recorded: a multi-rate invoice has no one rate to apply,
    # and its breakdown lives in line_items.
    if invoice.tax_rate is not None and taxable > ZERO:
        expected = _q(taxable * invoice.tax_rate / Decimal("100"))
        charged = tax - (invoice.cess or ZERO)  # Cess is levied on its own base.
        if abs(charged - expected) > ARITHMETIC_TOLERANCE:
            add(
                "tax_rate",
                Severity.ERROR,
                f"Tax of {charged} does not match {invoice.tax_rate}% of {taxable} ({expected})",
            )

    if invoice.total_value and abs(invoice.total_value - (taxable + tax)) > (
        ARITHMETIC_TOLERANCE
    ):
        add(
            "total_value",
            Severity.ERROR,
            f"Total {invoice.total_value} does not equal taxable {taxable} plus tax {tax}",
        )

    # ---- The IGST / CGST+SGST split ----
    # Which applies is decided by where the supply goes, not by preference, and
    # getting it wrong means tax paid to the wrong government — recoverable
    # only by amending the return.
    #
    # s.7 and s.8 of the IGST Act put it as: the supply is inter-state when the
    # *supplier's* location and the place of supply are in different states. So
    # which end of the invoice is the supplier decides what to compare against,
    # and it is not the same end in both directions. On a sale we are the
    # supplier; on a purchase the counterparty is, and the place of supply is
    # our own state — which is exactly what a vendor prints on the invoice, and
    # what the parser reads off it.
    #
    # Comparing the place of supply with our own state either way made the
    # answer depend on whether the parser found the field. An inter-state
    # purchase with the place of supply read off it came out as "intra-state
    # supply in 27 carrying IGST" — a blocking error on a correct invoice —
    # while the same purchase with the field missing passed. The genuinely
    # wrong one went the other way: a Karnataka supplier charging CGST and SGST
    # to a Maharashtra buyer is tax paid to a government that is not owed it,
    # and it validated clean.
    counterparty_state = (
        gstin_service.state_code_of(invoice.counterparty_gstin or "")
        if invoice.counterparty_gstin
        else None
    )
    if is_sales:
        supplier_state = business_state
        place_of_supply = invoice.place_of_supply or counterparty_state
    else:
        supplier_state = counterparty_state
        place_of_supply = invoice.place_of_supply or business_state
    if supplier_state and place_of_supply:
        interstate = place_of_supply != supplier_state
        has_igst = (invoice.igst or ZERO) > ZERO
        has_local = (invoice.cgst or ZERO) > ZERO or (invoice.sgst or ZERO) > ZERO

        if interstate and has_local:
            add(
                "igst",
                Severity.ERROR,
                f"Inter-state supply from {supplier_state} to {place_of_supply} carries "
                "CGST/SGST; it should be IGST",
            )
        if not interstate and has_igst:
            add(
                "igst",
                Severity.ERROR,
                f"Intra-state supply in {place_of_supply} carries IGST; it should be CGST + SGST",
            )
        if not interstate and has_local and invoice.cgst != invoice.sgst:
            add(
                "cgst",
                Severity.ERROR,
                f"CGST {invoice.cgst} and SGST {invoice.sgst} must be equal on an "
                "intra-state supply",
            )

    if is_sales and not invoice.place_of_supply and not counterparty_state:
        add(
            "place_of_supply",
            Severity.ERROR,
            "Place of supply is missing and cannot be derived from a GSTIN",
        )

    return issues


def validate_period(
    db: Session,
    business: Business,
    period: str,
    *,
    invoice_type: InvoiceType = InvoiceType.SALES,
) -> ValidationReport:
    """Validate every invoice of one direction in a period."""
    invoices = _invoices(db, business.id, period, invoice_type)
    report = ValidationReport(period=period, invoice_count=len(invoices))
    for invoice in invoices:
        report.issues.extend(
            validate_invoice(invoice, business_state=business.state_code, period=period)
        )
    return report


# ---------------------------------------------------------------------------
# Recording that a return was filed
# ---------------------------------------------------------------------------

# The portal issues a 15-character ARN, but this is not pinned to 15. The two
# ways to be wrong here are not symmetric: too loose stores a typo, while too
# strict locks a business out of recording a filing that genuinely happened —
# and the deadline alert for that period then never clears, so the product
# nags them about a return they have already filed. The check is therefore
# only tight enough to reject something that is plainly not an ARN.
ARN_PATTERN = re.compile(r"^[0-9A-Z]{10,32}$")


class FilingNotRecordable(ValueError):
    """The filing being recorded could not have happened as described."""


def normalise_arn(arn: str | None) -> str | None:
    """Upper-case and strip an ARN, or raise if it is not one.

    The portal prints it with spaces in some acknowledgements, so whitespace is
    removed rather than rejected.
    """
    if arn is None:
        return None
    cleaned = "".join(arn.split()).upper()
    if not cleaned:
        return None
    if not ARN_PATTERN.match(cleaned):
        raise FilingNotRecordable(
            f"'{arn}' is not an ARN. The portal's acknowledgement shows a 15-character "
            "reference made up of letters and digits."
        )
    return cleaned


def record_filing(
    db: Session,
    business: Business,
    period: str,
    return_type: ReturnType,
    *,
    arn: str | None = None,
    filed_on: date | None = None,
) -> GSTRReturn:
    """Record that *return_type* for *period* was filed on the portal.

    This product prepares and exports a return; the portal is where it is
    actually submitted. Nothing here can observe that submission, so the
    business tells us — and until they do, the return is indistinguishable from
    one that was never filed. That matters beyond bookkeeping: the deadline
    alerting reads exactly this, so a filing that is never recorded is a
    business that keeps being told it is late.

    Idempotent per period and return type. Re-recording corrects the ARN or the
    date rather than filing a second time, which matches the partial unique
    index on the table — and matches what the caller means, since there is only
    ever one live GSTR-1 for a period. An omitted ARN is "not to hand" and
    leaves a stored one intact; only a supplied one replaces it.

    ``data`` is the return as *this application builds it now*. Immediately
    after an export — which is the flow this exists for — that is exactly what
    went to the portal. Recorded months later, against books that have since
    been corrected, it is not, and it is stored as the best available record
    rather than as proof of what was submitted. The ARN is the proof.
    """
    if return_type not in gst_calendar.DUE_DAY:
        raise FilingNotRecordable(
            f"{return_type.value} is not a return a business files. Only "
            + " and ".join(sorted(rt.value for rt in gst_calendar.DUE_DAY))
            + " can be recorded as filed."
        )

    today = gst_calendar.today_ist()
    filed_on = filed_on or today
    if filed_on > today:
        raise FilingNotRecordable(
            f"A filing date of {filed_on.isoformat()} is in the future."
        )

    # A period cannot be filed before it has finished — there is nothing to
    # summarise yet, and the portal does not open the return until the month is
    # over. A date inside the period is a mistyped year far more often than it
    # is anything else.
    opens_year, opens_month = gst_calendar.next_period(period).split("-")
    opens_on = date(int(opens_year), int(opens_month), 1)
    if filed_on < opens_on:
        raise FilingNotRecordable(
            f"{period} could not have been filed on {filed_on.isoformat()}: the period "
            f"had not ended. The return opens on {opens_on.isoformat()}."
        )

    # Before anything is mutated: a rejected ARN should leave the record it was
    # offered against exactly as it was, not half-updated in the session.
    supplied_arn = normalise_arn(arn)

    existing = db.scalar(
        select(GSTRReturn).where(
            GSTRReturn.business_id == business.id,
            GSTRReturn.period == period,
            GSTRReturn.return_type == return_type,
            GSTRReturn.deleted_at.is_(None),
        )
    )
    record = existing or GSTRReturn(
        business_id=business.id, period=period, return_type=return_type
    )

    record.status = ReturnStatus.FILED
    # Omitting the ARN means "not to hand", not "erase the one I gave you". The
    # asymmetry is the whole point of this endpoint being idempotent: recording
    # again is how a date gets corrected, and clearing the acknowledgement as a
    # side effect of that would drop the only proof the filing happened — which
    # nothing here can re-derive, because it was issued by the portal. A wrong
    # ARN is still corrected by supplying the right one.
    if supplied_arn is not None:
        record.arn = supplied_arn
    record.filed_at = datetime.combine(filed_on, time(), tzinfo=gst_calendar.IST)
    record.due_date = datetime.combine(
        gst_calendar.due_date(period, return_type), time(), tzinfo=gst_calendar.IST
    )
    record.data = (
        build_gstr1(db, business, period)
        if return_type is ReturnType.GSTR1
        else build_gstr3b(db, business, period)
    )

    # Both returns summarise outward supplies, so both take their totals from
    # sales. The purchase side reaches GSTR-3B as input credit, which is a
    # different figure and is inside ``data``.
    totals = invoice_service.tax_summary(db, business.id, period)["sales"]
    record.invoice_count = int(totals["count"])
    record.total_taxable_value = _q(Decimal(totals["taxable_value"]))
    record.total_cgst = _q(Decimal(totals["cgst"]))
    record.total_sgst = _q(Decimal(totals["sgst"]))
    record.total_igst = _q(Decimal(totals["igst"]))
    record.total_cess = _q(Decimal(totals["cess"]))

    if existing is None:
        db.add(record)
    db.commit()
    db.refresh(record)
    return record


def filed_returns(
    db: Session, business_id: int, periods: list[str] | None = None
) -> dict[tuple[str, ReturnType], GSTRReturn]:
    """Filed returns for this tenant, keyed by period and type.

    A mapping rather than a list because both callers — the alerting and the
    status endpoint — are asking "has *this* been filed", and a keyed lookup is
    what stops that becoming a query per period.
    """
    conditions = [
        GSTRReturn.business_id == business_id,
        GSTRReturn.deleted_at.is_(None),
        GSTRReturn.status == ReturnStatus.FILED,
    ]
    if periods is not None:
        if not periods:
            return {}
        conditions.append(GSTRReturn.period.in_(periods))

    return {
        (row.period, row.return_type): row
        for row in db.scalars(select(GSTRReturn).where(*conditions)).all()
    }


@dataclass(frozen=True)
class ReturnStanding:
    """Where one return, for one period, stands as of one date.

    Shared by the status endpoint and the deadline alerting so that both answer
    "is this late" the same way. They disagreed once in an earlier design, and
    an alert that contradicts the screen it links to is worse than no alert.
    """

    period: str
    return_type: ReturnType
    due_date: date
    as_of: date
    filed_on: date | None = None
    arn: str | None = None

    @property
    def filed(self) -> bool:
        return self.filed_on is not None

    @property
    def filed_late(self) -> bool:
        return self.filed_on is not None and self.filed_on > self.due_date

    @property
    def days_until_due(self) -> int:
        """Negative once the due date has passed."""
        return (self.due_date - self.as_of).days

    @property
    def overdue(self) -> bool:
        """Unfiled and past the due date. Filing late stops the clock."""
        return not self.filed and self.days_until_due < 0


def standings(
    db: Session, business_id: int, *, periods: list[str], as_of: date
) -> list[ReturnStanding]:
    """Every filable return over *periods*, oldest period first.

    One query for the lot: the caller is asking about a handful of periods
    across two return types, and a lookup per cell is six round trips to answer
    a question the dashboard asks on every load.
    """
    filed = filed_returns(db, business_id, periods)
    lines: list[ReturnStanding] = []
    for period in sorted(periods):
        for return_type in gst_calendar.DUE_DAY:
            record = filed.get((period, return_type))
            lines.append(
                ReturnStanding(
                    period=period,
                    return_type=return_type,
                    due_date=gst_calendar.due_date(period, return_type),
                    as_of=as_of,
                    filed_on=(
                        gst_calendar.ist_date(record.filed_at)
                        if record and record.filed_at
                        else None
                    ),
                    arn=record.arn if record else None,
                )
            )
    return lines


def _invoices(
    db: Session, business_id: int, period: str, invoice_type: InvoiceType
) -> list[Invoice]:
    """Filable invoices of one direction for a period, oldest first.

    Excludes failed extractions: an invoice whose fields were never read has
    nothing to file, and putting a row of zeros in a return is worse than
    leaving it out and reporting it as unfiled.
    """
    return list(
        db.scalars(
            select(Invoice)
            .where(
                Invoice.business_id == business_id,
                Invoice.deleted_at.is_(None),
                Invoice.invoice_type == invoice_type,
                Invoice.period == period,
                Invoice.status != InvoiceStatus.FAILED,
            )
            .order_by(Invoice.invoice_date.asc(), Invoice.id.asc())
        ).all()
    )


# ---------------------------------------------------------------------------
# GSTR-1 — outward supplies
# ---------------------------------------------------------------------------

def _rate_of(invoice: Invoice) -> Decimal:
    """The invoice's rate, falling back to one derived from the figures.

    A parsed invoice often carries the tax amounts but no explicit rate, and
    the portal wants a rate on every line.
    """
    if invoice.tax_rate is not None:
        return invoice.tax_rate
    taxable = invoice.taxable_value or ZERO
    if taxable <= ZERO:
        return ZERO
    tax = _tax_total(invoice) - (invoice.cess or ZERO)
    derived = (tax / taxable) * Decimal("100")
    # Snap to the nearest real slab: the arithmetic gives 17.999% where the
    # invoice plainly means 18%.
    return min(VALID_RATES, key=lambda rate: abs(rate - derived))


def _invoice_value(invoice: Invoice) -> Decimal:
    """The invoice's value including tax — what the portal calls ``val``.

    ``total_value`` is not null and not reliable: it defaults to zero and is
    only filled when the parser found a grand-total label on the document, so a
    perfectly good invoice whose total was printed as "Amount Payable" carries
    a stored total of zero. Every place that reads the invoice's *value* has to
    fall back to the figures that are always there, or it reads a real supply
    as one worth nothing.
    """
    return invoice.total_value or _q((invoice.taxable_value or ZERO) + _tax_total(invoice))


def _item_block(invoice: Invoice) -> dict:
    """The portal's ``itms`` entry for a single-rate invoice."""
    return {
        "num": 1,
        "itm_det": {
            "rt": float(_rate_of(invoice)),
            "txval": float(_q(invoice.taxable_value or ZERO)),
            "iamt": float(_q(invoice.igst or ZERO)),
            "camt": float(_q(invoice.cgst or ZERO)),
            "samt": float(_q(invoice.sgst or ZERO)),
            "csamt": float(_q(invoice.cess or ZERO)),
        },
    }


def build_gstr1(db: Session, business: Business, period: str) -> dict:
    """GSTR-1 for *period* in the portal's JSON shape.

    Sales are sorted into the blocks the portal keeps separate:

    * ``b2b`` — supplies to a registered person, grouped by their GSTIN. These
      are what become the buyer's GSTR-2B, which is why the counterparty GSTIN
      has to be right: a typo here is a credit the customer cannot claim.
    * ``b2cl`` — inter-state supplies to unregistered persons above ₹2.5 lakh,
      reported invoice by invoice.
    * ``b2cs`` — everything else to unregistered persons, summarised by place
      of supply and rate rather than listed.
    * ``hsn`` — the rate-wise summary by HSN, which the portal requires
      alongside the invoice data.
    """
    invoices = _invoices(db, business.id, period, InvoiceType.SALES)

    b2b: dict[str, list[dict]] = {}
    b2cl: dict[str, list[dict]] = {}
    b2cs: dict[tuple[str, Decimal], dict] = {}
    hsn: dict[tuple[str, Decimal], dict] = {}

    for invoice in invoices:
        counterparty_state = gstin_service.state_code_of(invoice.counterparty_gstin or "")
        place_of_supply = invoice.place_of_supply or counterparty_state or business.state_code
        rate = _rate_of(invoice)
        taxable = _q(invoice.taxable_value or ZERO)
        interstate = place_of_supply != business.state_code
        # Derived rather than read straight off the row: which block a B2C
        # supply belongs in turns on this number, and a stored zero would put a
        # ₹3 lakh invoice in the summary that exists for small ones.
        value = _invoice_value(invoice)

        if invoice.counterparty_gstin and gstin_service.is_valid(invoice.counterparty_gstin):
            b2b.setdefault(invoice.counterparty_gstin, []).append(
                {
                    "inum": invoice.invoice_number or "",
                    "idt": to_portal_date(invoice.invoice_date),
                    "val": float(value),
                    "pos": place_of_supply,
                    "rchrg": "Y" if invoice.reverse_charge else "N",
                    "inv_typ": "R",  # Regular. SEZ and deemed export are not modelled yet.
                    "itms": [_item_block(invoice)],
                }
            )
        elif interstate and value > B2CL_THRESHOLD:
            b2cl.setdefault(place_of_supply, []).append(
                {
                    "inum": invoice.invoice_number or "",
                    "idt": to_portal_date(invoice.invoice_date),
                    "val": float(value),
                    "itms": [_item_block(invoice)],
                }
            )
        else:
            key = (place_of_supply, rate)
            bucket = b2cs.setdefault(
                key,
                {
                    "sply_ty": "INTER" if interstate else "INTRA",
                    "typ": "OE",  # Other than e-commerce.
                    "pos": place_of_supply,
                    "rt": float(rate),
                    "txval": ZERO,
                    "iamt": ZERO,
                    "camt": ZERO,
                    "samt": ZERO,
                    "csamt": ZERO,
                },
            )
            bucket["txval"] += taxable
            bucket["iamt"] += invoice.igst or ZERO
            bucket["camt"] += invoice.cgst or ZERO
            bucket["samt"] += invoice.sgst or ZERO
            bucket["csamt"] += invoice.cess or ZERO

        if invoice.hsn_code:
            hsn_key = (invoice.hsn_code, rate)
            entry = hsn.setdefault(
                hsn_key,
                {
                    "hsn_sc": invoice.hsn_code,
                    "uqc": "NOS",  # Not extracted yet; NOS is the portal's catch-all.
                    "qty": 0,
                    "rt": float(rate),
                    "txval": ZERO,
                    "iamt": ZERO,
                    "camt": ZERO,
                    "samt": ZERO,
                    "csamt": ZERO,
                },
            )
            entry["txval"] += taxable
            entry["iamt"] += invoice.igst or ZERO
            entry["camt"] += invoice.cgst or ZERO
            entry["samt"] += invoice.sgst or ZERO
            entry["csamt"] += invoice.cess or ZERO

    def _floats(bucket: dict) -> dict:
        return {
            key: float(_q(value)) if isinstance(value, Decimal) else value
            for key, value in bucket.items()
        }

    document: dict = {
        "gstin": business.gstin,
        "fp": to_portal_period(period),
        "version": GSTR1_VERSION,
        "hash": "hash",  # The offline utility computes the real one on upload.
    }
    if b2b:
        document["b2b"] = [
            {"ctin": ctin, "inv": invs} for ctin, invs in sorted(b2b.items())
        ]
    if b2cl:
        document["b2cl"] = [
            {"pos": pos, "inv": invs} for pos, invs in sorted(b2cl.items())
        ]
    if b2cs:
        document["b2cs"] = [_floats(bucket) for _, bucket in sorted(b2cs.items())]
    if hsn:
        document["hsn"] = {
            "data": [
                {"num": index, **_floats(entry)}
                for index, (_, entry) in enumerate(sorted(hsn.items()), start=1)
            ]
        }
    return document


# ---------------------------------------------------------------------------
# GSTR-3B — the monthly summary and payment
# ---------------------------------------------------------------------------

def build_gstr3b(
    db: Session, business: Business, period: str, *, as_of: date | None = None
) -> dict:
    """Pre-fill GSTR-3B for *period* from sales, purchases and the last run.

    Table 4 is filled from the reconciled ITC position rather than from the
    purchase register, because 4(A) is credit *available* and only GSTR-2B
    establishes that. The reversals computed under Rules 37, 42 and 43 land in
    4(B), and 4(C) is the net — which is the figure that actually reduces the
    cash payable.

    Rule 37 is a clock — credit reverses 180 days after an invoice date — and a
    clock has to be told which day the return is a statement about. Reading it
    off *today* made a closed period's return move: a business that generated
    its January 3B in February and again in March got two different documents,
    the second one reversing credit on invoices that had not yet crossed 180
    days when January ended, and on invoices dated months *after* January that
    could not belong to its return at all. Anchored to the close of the period,
    so re-generating an old return reproduces it.

    *as_of* overrides that anchor, for a caller reconstructing what the return
    would have said on some other day. The default is capped at today, so
    previewing a month still in progress does not reverse credit early.

    Anchoring the clock is only half of it: the reversal in 4(B) is what
    lapsed *during* this period, not everything standing at its close. Rule 37
    is paid once, in the return for the month the 180 days ran out, and
    re-availed when the supplier is paid. Taking the whole standing exposure
    reversed the same invoice again in every return that followed it — April,
    then May, then June — so a business filing four months gave back four
    times what the rule asks for, and each of those returns still reproduced
    itself exactly, which is what made it invisible.
    """
    if as_of is None:
        as_of = min(gst_calendar.period_end(period), gst_calendar.today_ist())
    summary = itc_service.summarise(db, business.id, period, as_of=as_of)
    sales = _invoices(db, business.id, period, InvoiceType.SALES)

    outward_taxable = ZERO
    outward_exempt = ZERO
    interstate_unregistered: dict[str, dict] = {}
    for invoice in sales:
        taxable = _q(invoice.taxable_value or ZERO)
        if _tax_total(invoice) == ZERO:
            outward_exempt += taxable
            continue
        outward_taxable += taxable

        # Table 3.2: inter-state supplies to unregistered persons, by state.
        counterparty_state = gstin_service.state_code_of(invoice.counterparty_gstin or "")
        place_of_supply = invoice.place_of_supply or counterparty_state or business.state_code
        if not invoice.counterparty_gstin and place_of_supply != business.state_code:
            bucket = interstate_unregistered.setdefault(
                place_of_supply, {"pos": place_of_supply, "txval": ZERO, "iamt": ZERO}
            )
            bucket["txval"] += taxable
            bucket["iamt"] += invoice.igst or ZERO

    output = summary.output_tax
    available = summary.available + summary.proportionate.capital_credit_this_month
    reversal = summary.total_reversal

    return {
        "gstin": business.gstin,
        "ret_period": to_portal_period(period),
        # 3.1(a): outward taxable supplies, other than zero-rated/nil/exempt.
        "sup_details": {
            "osup_det": {
                "txval": float(_q(outward_taxable)),
                "iamt": float(_q(output.igst)),
                "camt": float(_q(output.cgst)),
                "samt": float(_q(output.sgst)),
                "csamt": float(_q(output.cess)),
            },
            # 3.1(c): nil-rated and exempt outward supplies.
            "osup_nil_exmp": {"txval": float(_q(outward_exempt))},
        },
        # 3.2: of the above, supplies to unregistered persons in other states.
        "inter_sup": {
            "unreg_details": [
                {
                    "pos": bucket["pos"],
                    "txval": float(_q(bucket["txval"])),
                    "iamt": float(_q(bucket["iamt"])),
                }
                for _, bucket in sorted(interstate_unregistered.items())
            ]
        },
        # 4: eligible ITC — available, reversed, and the net of the two.
        "itc_elg": {
            "itc_avl": [
                {
                    "ty": "OTH",  # All other ITC; imports and ISD are not modelled yet.
                    "iamt": float(_q(available.igst)),
                    "camt": float(_q(available.cgst)),
                    "samt": float(_q(available.sgst)),
                    "csamt": float(_q(available.cess)),
                }
            ],
            "itc_rev": [
                {
                    "ty": "RUL",  # Reversal under rules 37, 42 and 43.
                    "iamt": float(_q(reversal.igst)),
                    "camt": float(_q(reversal.cgst)),
                    "samt": float(_q(reversal.sgst)),
                    "csamt": float(_q(reversal.cess)),
                }
            ],
            "itc_net": {
                "iamt": float(_q(summary.net_available.igst)),
                "camt": float(_q(summary.net_available.cgst)),
                "samt": float(_q(summary.net_available.sgst)),
                "csamt": float(_q(summary.net_available.cess)),
            },
        },
        # Not part of the portal's schema: what the set-off leaves to pay in
        # cash, so the screen can show it without recomputing.
        "gstbot_set_off": summary.set_off.as_dict(),
    }


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

CSV_COLUMNS = (
    "invoice_number",
    "invoice_date",
    "counterparty_gstin",
    "counterparty_name",
    "place_of_supply",
    "hsn_code",
    "tax_rate",
    "taxable_value",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "total_value",
    "reverse_charge",
    "status",
)


def to_csv(db: Session, business: Business, period: str, invoice_type: InvoiceType) -> str:
    """A period's invoices as CSV, for a human or a CA to check.

    ``\\r\\n`` line endings and quoting on every non-numeric field: this is
    opened in Excel far more often than it is parsed, and Excel is where a
    stray comma in a trade name silently shifts a row.

    Being opened in Excel is also why every text column goes through
    :func:`~app.core.sanitize.csv_safe`. The fields here are free text off an
    uploaded invoice, and Excel runs a cell that starts with ``=``. The numeric
    columns are deliberately not put through it: this application formats them,
    and a credit note's leading ``-`` is a minus sign.

    ``total_value`` is derived by :func:`_invoice_value` rather than read off
    the column, for the reason that function exists: the stored total defaults
    to zero and is only filled when the parser found a grand-total *label* on
    the document, so an invoice whose total was printed as "Amount Payable"
    carries a stored zero. Read straight off the row, this column reported a
    real supply as one worth nothing — and reported it in the one artefact a CA
    opens to check a period before it is filed, while ``/filing/export/gstr1.json``
    for the same period carried the right figure all along. Two exports of one
    month disagreeing about what an invoice is worth is worse than either being
    wrong on its own, because the CSV is what gets believed.
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=CSV_COLUMNS, extrasaction="ignore", lineterminator="\r\n"
    )
    writer.writeheader()
    for invoice in _invoices(db, business.id, period, invoice_type):
        writer.writerow(
            {
                "invoice_number": csv_safe(invoice.invoice_number),
                "invoice_date": to_portal_date(invoice.invoice_date) or "",
                "counterparty_gstin": csv_safe(invoice.counterparty_gstin),
                "counterparty_name": csv_safe(invoice.counterparty_name),
                "place_of_supply": csv_safe(invoice.place_of_supply),
                "hsn_code": csv_safe(invoice.hsn_code),
                "tax_rate": str(invoice.tax_rate) if invoice.tax_rate is not None else "",
                "taxable_value": str(_q(invoice.taxable_value or ZERO)),
                "cgst": str(_q(invoice.cgst or ZERO)),
                "sgst": str(_q(invoice.sgst or ZERO)),
                "igst": str(_q(invoice.igst or ZERO)),
                "cess": str(_q(invoice.cess or ZERO)),
                "total_value": str(_q(_invoice_value(invoice))),
                "reverse_charge": "Y" if invoice.reverse_charge else "N",
                "status": invoice.status.value,
            }
        )
    return buffer.getvalue()


def filename_for(business: Business, period: str, kind: str, extension: str) -> str:
    """A download name that says what the file is without being opened."""
    return f"{kind}_{business.gstin}_{to_portal_period(period)}.{extension}"
