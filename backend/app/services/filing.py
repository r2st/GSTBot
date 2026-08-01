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
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Business
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import gstin as gstin_service
from app.services import itc as itc_service

ZERO = Decimal("0.00")

# The rates GST actually levies. A rate outside this set is a data-entry error
# every time — there is no 15% or 20% slab — and the portal rejects it.
VALID_RATES = (
    Decimal("0"),
    Decimal("0.1"),
    Decimal("0.25"),
    Decimal("1"),
    Decimal("1.5"),
    Decimal("3"),
    Decimal("5"),
    Decimal("6"),
    Decimal("7.5"),
    Decimal("12"),
    Decimal("18"),
    Decimal("28"),
)

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
    counterparty_state = (
        gstin_service.state_code_of(invoice.counterparty_gstin or "")
        if invoice.counterparty_gstin
        else None
    )
    place_of_supply = invoice.place_of_supply or counterparty_state
    if business_state and place_of_supply:
        interstate = place_of_supply != business_state
        has_igst = (invoice.igst or ZERO) > ZERO
        has_local = (invoice.cgst or ZERO) > ZERO or (invoice.sgst or ZERO) > ZERO

        if interstate and has_local:
            add(
                "igst",
                Severity.ERROR,
                f"Inter-state supply to {place_of_supply} carries CGST/SGST; it should be IGST",
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

        if invoice.counterparty_gstin and gstin_service.is_valid(invoice.counterparty_gstin):
            b2b.setdefault(invoice.counterparty_gstin, []).append(
                {
                    "inum": invoice.invoice_number or "",
                    "idt": to_portal_date(invoice.invoice_date),
                    "val": float(_q(invoice.total_value or (taxable + _tax_total(invoice)))),
                    "pos": place_of_supply,
                    "rchrg": "Y" if invoice.reverse_charge else "N",
                    "inv_typ": "R",  # Regular. SEZ and deemed export are not modelled yet.
                    "itms": [_item_block(invoice)],
                }
            )
        elif interstate and (invoice.total_value or ZERO) > B2CL_THRESHOLD:
            b2cl.setdefault(place_of_supply, []).append(
                {
                    "inum": invoice.invoice_number or "",
                    "idt": to_portal_date(invoice.invoice_date),
                    "val": float(_q(invoice.total_value or ZERO)),
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

def build_gstr3b(db: Session, business: Business, period: str) -> dict:
    """Pre-fill GSTR-3B for *period* from sales, purchases and the last run.

    Table 4 is filled from the reconciled ITC position rather than from the
    purchase register, because 4(A) is credit *available* and only GSTR-2B
    establishes that. The reversals computed under Rules 37, 42 and 43 land in
    4(B), and 4(C) is the net — which is the figure that actually reduces the
    cash payable.
    """
    summary = itc_service.summarise(db, business.id, period)
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
    reversal = summary.rule_37.reversal + summary.proportionate.total_reversal

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
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=CSV_COLUMNS, extrasaction="ignore", lineterminator="\r\n"
    )
    writer.writeheader()
    for invoice in _invoices(db, business.id, period, invoice_type):
        writer.writerow(
            {
                "invoice_number": invoice.invoice_number or "",
                "invoice_date": to_portal_date(invoice.invoice_date) or "",
                "counterparty_gstin": invoice.counterparty_gstin or "",
                "counterparty_name": invoice.counterparty_name or "",
                "place_of_supply": invoice.place_of_supply or "",
                "hsn_code": invoice.hsn_code or "",
                "tax_rate": str(invoice.tax_rate) if invoice.tax_rate is not None else "",
                "taxable_value": str(_q(invoice.taxable_value or ZERO)),
                "cgst": str(_q(invoice.cgst or ZERO)),
                "sgst": str(_q(invoice.sgst or ZERO)),
                "igst": str(_q(invoice.igst or ZERO)),
                "cess": str(_q(invoice.cess or ZERO)),
                "total_value": str(_q(invoice.total_value or ZERO)),
                "reverse_charge": "Y" if invoice.reverse_charge else "N",
                "status": invoice.status.value,
            }
        )
    return buffer.getvalue()


def filename_for(business: Business, period: str, kind: str, extension: str) -> str:
    """A download name that says what the file is without being opened."""
    return f"{kind}_{business.gstin}_{to_portal_period(period)}.{extension}"
