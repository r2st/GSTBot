"""The matching engine: books against GSTR-2B, and the ITC that follows.

Reconciliation answers one question per purchase invoice — *did the supplier
actually declare this?* — and the answer decides real money. Input Tax Credit
may only be claimed on an invoice that appears in the buyer's GSTR-2B, so an
invoice sitting in the books with no counterpart is credit the business has
probably already claimed and may have to reverse, with interest.

Matching is deliberately two-pass:

1. **Exact.** Same supplier GSTIN, same invoice number.
2. **Normalised.** Same supplier, same invoice number once case, separators and
   leading zeros are discarded, so ``INV/2026/0042``, ``inv-2026-42`` and
   ``INV20260042`` meet. Suppliers type their own numbers into the portal by
   hand and the buyer's data entry is independent of theirs; refusing to match
   across punctuation would report a wall of false mismatches.

The normalised pass never runs first. Two genuinely different invoices can
normalise together (``INV-01`` and ``INV/1``), so an exact counterpart always
wins before a fuzzy one is considered.

Amounts are compared with a tolerance because the portal and the books round
independently, at the line and at the invoice. A one-rupee gap is arithmetic;
it is not a dispute worth putting in front of a user.

Credit notes are not matched at all. A note has no counterpart in a purchase
register — it reverses part of a supply already declared — so it is taken off
the period's eligible credit rather than paired with anything. The portal
states its amounts as positive figures and leaves the sign to the document
type, which is the trap: read as money alone, a reduction counts as a second
supply and the pool comes out too big.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gstr_return import GSTRReturn, ReturnStatus, ReturnType
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.reconciliation_run import (
    MatchCategory,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.models.supplier import Supplier
from app.services import gstin as gstin_service
from app.services import supplier_score
from app.services.gst_calendar import gstr1_due_date
from app.services.gstr2b import GSTR2BRecord

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")

# Rupee gap below which books and portal are treated as agreeing. One rupee
# absorbs independent rounding on both sides without hiding a real difference:
# GST is computed to the paisa and reported to the rupee.
DEFAULT_TOLERANCE = Decimal("1.00")

# The money fields compared field by field. ``total_value`` is included so an
# invoice whose tax happens to agree but whose value does not is still caught.
COMPARED_FIELDS = ("taxable_value", "cgst", "sgst", "igst", "cess", "total_value")

# Runs of letters and runs of digits, with every separator falling away.
_TOKENS = re.compile(r"[A-Z]+|[0-9]+")


def normalize_invoice_number(number: str | None) -> str:
    """A comparison key for an invoice number.

    Upper-cased and split into runs of letters and digits, dropping every
    separator, with leading zeros stripped from each numeric run. So
    ``INV/2026/0042``, ``inv-2026-42`` and ``INV 2026 0042`` all become
    ``INV202642``.

    Per-run rather than once over the whole string: the zeros that differ
    between a buyer's books and a supplier's portal entry are usually inside
    the number (``2026/0042`` against ``2026/42``), not at the front of it.

    This is lossy by design — ``A-1-02`` and ``A-12`` collapse together — which
    is why :func:`match` only reaches for this key after an exact one has
    failed.
    """
    if not number:
        return ""
    return "".join(
        token.lstrip("0") or "0" if token.isdigit() else token
        for token in _TOKENS.findall(number.upper())
    )


@dataclass
class Difference:
    """One field on which the books and the portal disagree."""

    field: str
    books: Decimal
    gstr2b: Decimal

    @property
    def delta(self) -> Decimal:
        return self.books - self.gstr2b

    def as_dict(self) -> dict:
        return {
            "field": self.field,
            "books": str(self.books),
            "gstr2b": str(self.gstr2b),
            "delta": str(self.delta),
        }


@dataclass
class Finding:
    """What reconciliation concluded about one invoice."""

    category: MatchCategory
    invoice: Invoice | None = None
    record: GSTR2BRecord | None = None
    differences: list[Difference] = field(default_factory=list)
    matched_on: str | None = None  # "exact" or "normalized"
    note: str | None = None

    def as_dict(self) -> dict:
        invoice = self.invoice
        record = self.record
        payload: dict = {
            "category": self.category.value,
            "matched_on": self.matched_on,
            "note": self.note,
            "supplier_gstin": (
                invoice.counterparty_gstin
                if invoice
                else (record.supplier_gstin if record else None)
            ),
            "supplier_name": (
                invoice.counterparty_name
                if invoice
                else (record.supplier_name if record else None)
            ),
            "invoice_number": (
                invoice.invoice_number if invoice else (record.invoice_number if record else None)
            ),
            "differences": [d.as_dict() for d in self.differences],
        }
        if invoice is not None:
            payload["invoice_id"] = invoice.id
            payload["invoice_date"] = (
                invoice.invoice_date.isoformat() if invoice.invoice_date else None
            )
            payload["books"] = {
                "taxable_value": str(invoice.taxable_value),
                "total_tax": str(invoice.total_tax),
                "total_value": str(invoice.total_value),
            }
        if record is not None:
            payload["gstr2b"] = {
                "taxable_value": str(record.taxable_value),
                "total_tax": str(record.total_tax),
                "total_value": str(record.total_value),
                "itc_available": record.itc_available,
                "supplier_filing_date": (
                    record.supplier_filing_date.isoformat()
                    if record.supplier_filing_date
                    else None
                ),
            }
            if invoice is None:
                payload["invoice_date"] = (
                    record.invoice_date.isoformat() if record.invoice_date else None
                )
        return payload


@dataclass
class ReconciliationResult:
    """The outcome of one run, before it is written to the database."""

    period: str
    findings: list[Finding] = field(default_factory=list)
    itc_eligible: Decimal = ZERO
    itc_at_risk: Decimal = ZERO
    itc_claimed: Decimal = ZERO
    # Tax on credit notes the supplier declared, already taken off
    # ``itc_eligible``. Reported separately because the deduction is otherwise
    # invisible: the pool simply comes back smaller than the invoices in it.
    credit_notes: Decimal = ZERO
    # Of ``itc_eligible``, the part sitting on capital goods. Rule 43 gives that
    # credit to sixty months rather than to this one, so :mod:`app.services.itc`
    # keeps it in a separate pool — and cannot compare its input pool against a
    # total that has capital credit mixed into it. Reported so it can be taken
    # back out; see :attr:`input_itc_eligible`.
    itc_eligible_capital: Decimal = ZERO
    tolerance: Decimal = DEFAULT_TOLERANCE

    @property
    def input_itc_eligible(self) -> Decimal:
        """Eligible credit on inputs alone — capital goods taken out.

        Floored at zero because credit notes come off the total after the split,
        so a period whose notes exceed its input credit has none left rather
        than a negative amount of it.
        """
        return max(ZERO, self.itc_eligible - self.itc_eligible_capital)

    def counts(self) -> dict[MatchCategory, int]:
        tally = dict.fromkeys(MatchCategory, 0)
        for finding in self.findings:
            tally[finding.category] += 1
        return tally

    @property
    def total_invoices(self) -> int:
        """Invoices from the books that were considered.

        Excludes ``missing_in_books``: those are the portal's rows, not ours,
        and counting them here would make the denominator disagree with the
        purchase count on the dashboard.
        """
        return sum(
            1 for f in self.findings if f.category is not MatchCategory.MISSING_IN_BOOKS
        )


def _sum_tax(record: GSTR2BRecord) -> Decimal:
    return record.total_tax


def _differences(
    invoice: Invoice, record: GSTR2BRecord, tolerance: Decimal
) -> list[Difference]:
    """Fields where the two sides differ by more than *tolerance*."""
    found: list[Difference] = []
    for name in COMPARED_FIELDS:
        books = getattr(invoice, name) or ZERO
        portal = getattr(record, name) or ZERO
        if abs(books - portal) > tolerance:
            found.append(Difference(field=name, books=books, gstr2b=portal))
    return found


def _book_invoices(db: Session, business_id: int, period: str) -> list[Invoice]:
    """Purchase invoices in the books for *period*, oldest first.

    Only purchases: GSTR-2B is a statement of inward supply, and a sales
    invoice has no counterpart in it. Failed extractions are excluded — an
    invoice whose fields were never read cannot be compared with anything, and
    reporting it as "missing at the supplier's end" would be a lie about the
    supplier.
    """
    return list(
        db.scalars(
            select(Invoice)
            .where(
                Invoice.business_id == business_id,
                Invoice.deleted_at.is_(None),
                Invoice.invoice_type == InvoiceType.PURCHASE,
                Invoice.period == period,
                Invoice.status != InvoiceStatus.FAILED,
            )
            .order_by(Invoice.invoice_date.asc(), Invoice.id.asc())
        ).all()
    )


def match(
    invoices: list[Invoice],
    records: list[GSTR2BRecord],
    *,
    period: str,
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> ReconciliationResult:
    """Pure matching: no database, no side effects, fully testable.

    Kept free of the session on purpose — this is the part of the product whose
    correctness costs a business money, and it should be assertable against
    plain lists rather than through a fixture.
    """
    result = ReconciliationResult(period=period, tolerance=tolerance)

    # ---- Split off the documents that take credit away ----
    # A credit note is not an invoice and has no counterpart in a purchase
    # register, so it is held out of the matching entirely. Left in, it was
    # paired against nothing, reported as a supply the business had forgotten
    # to book, and — the part that costs money — left the period's eligible
    # credit at the full value of the invoices it was issued against. The
    # supplier has withdrawn part of that supply; the credit goes with it.
    credit_notes = [record for record in records if record.is_credit_note]
    records = [record for record in records if not record.is_credit_note]

    # ---- Index the portal side, both ways ----
    exact_index: dict[tuple[str, str], list[GSTR2BRecord]] = {}
    loose_index: dict[tuple[str, str], list[GSTR2BRecord]] = {}
    for record in records:
        gstin = (record.supplier_gstin or "").upper()
        exact_index.setdefault((gstin, (record.invoice_number or "").strip().upper()), []).append(
            record
        )
        loose_index.setdefault(
            (gstin, normalize_invoice_number(record.invoice_number)), []
        ).append(record)

    consumed: set[int] = set()  # id() of records already claimed by an invoice.

    def _take(index: dict, key: tuple[str, str]) -> GSTR2BRecord | None:
        for candidate in index.get(key, []):
            if id(candidate) not in consumed:
                consumed.add(id(candidate))
                return candidate
        return None

    # ---- Pass 1: pair each booked invoice with a portal row ----
    # Every invoice gets its exact attempt before any invoice gets a fuzzy one,
    # so a normalised collision cannot steal a row that an exact counterpart
    # was entitled to.
    paired: list[tuple[Invoice, GSTR2BRecord | None, str | None]] = []
    for invoice in invoices:
        gstin = (invoice.counterparty_gstin or "").upper()
        record = _take(exact_index, (gstin, (invoice.invoice_number or "").strip().upper()))
        paired.append((invoice, record, "exact" if record else None))

    for index, (invoice, record, _) in enumerate(paired):
        if record is not None:
            continue
        gstin = (invoice.counterparty_gstin or "").upper()
        found = _take(loose_index, (gstin, normalize_invoice_number(invoice.invoice_number)))
        if found is not None:
            paired[index] = (invoice, found, "normalized")

    # ---- Pass 2: which of these are the same invoice booked twice ----
    # A duplicate is an invoice that shares a counterparty and (normalised)
    # number with an earlier one *and* found no portal row of its own. The
    # second half matters: ``INV-01`` and ``INV/1`` normalise together but are
    # two real invoices when the 2B declares both, and calling either a
    # duplicate would drop a legitimate claim. Where the 2B declares one, the
    # copy is exactly the double-claim that draws a departmental notice.
    seen_in_books: dict[tuple[str, str], Invoice] = {}
    duplicate_of: dict[int, Invoice] = {}
    for invoice, record, _ in paired:
        key = (
            (invoice.counterparty_gstin or "").upper(),
            normalize_invoice_number(invoice.invoice_number),
        )
        if not key[0] and not key[1]:
            continue
        original = seen_in_books.get(key)
        if original is None:
            seen_in_books[key] = invoice
        elif record is None:
            duplicate_of[id(invoice)] = original

    # ---- Pass 3: categorise, and count the credit ----
    for invoice, record, matched_on in paired:
        original = duplicate_of.get(id(invoice))
        if original is not None:
            result.findings.append(
                Finding(
                    category=MatchCategory.DUPLICATE,
                    invoice=invoice,
                    note=f"Same supplier and invoice number as invoice {original.id}",
                )
            )
            continue

        booked_tax = invoice.total_tax
        claims_credit = invoice.itc_eligible and not invoice.reverse_charge
        if claims_credit:
            result.itc_claimed += booked_tax

        if record is None:
            # Booked, but the supplier has not declared it. The whole of this
            # invoice's credit is exposed.
            result.findings.append(
                Finding(category=MatchCategory.MISSING_IN_2B, invoice=invoice)
            )
            if claims_credit:
                result.itc_at_risk += booked_tax
            continue

        differences = _differences(invoice, record, tolerance)
        result.findings.append(
            Finding(
                category=(
                    MatchCategory.MISMATCHED if differences else MatchCategory.MATCHED
                ),
                invoice=invoice,
                record=record,
                differences=differences,
                matched_on=matched_on,
            )
        )

        if not claims_credit:
            # Blocked credit (s.17(5)) or reverse charge: matching changes
            # nothing about what may be claimed here.
            continue
        if not record.itc_available:
            # The supplier filed it, but the portal marks the credit
            # unavailable. Booked as claimed, so it is exposed in full.
            result.itc_at_risk += booked_tax
            continue

        # Credit is capped by what the supplier actually declared: claiming
        # more than the portal shows is what a notice is issued over. Anything
        # booked above that figure is at risk.
        portal_tax = _sum_tax(record)
        allowed = min(booked_tax, portal_tax)
        result.itc_eligible += allowed
        if invoice.is_capital_good:
            # Tracked separately because it is spent over sixty months, not
            # this one. Pooled with the rest, it makes the period's eligible
            # total far larger than the input credit the ITC screen holds, and
            # a cap on that pool then never binds.
            result.itc_eligible_capital += allowed
        if booked_tax > portal_tax:
            result.itc_at_risk += booked_tax - portal_tax

    # ---- Whatever the portal has that we never booked ----
    for record in records:
        if id(record) in consumed:
            continue
        result.findings.append(
            Finding(
                category=MatchCategory.MISSING_IN_BOOKS,
                record=record,
                note="In GSTR-2B but not in the purchase register",
            )
        )

    # ---- ...and whatever it has taken back ----
    # Floored at zero rather than allowed to go negative: a period whose notes
    # exceed its invoices has no credit left, not credit owed the other way. The
    # excess belongs to the period holding the invoices the notes were issued
    # against, and inventing a negative pool here would carry it into a set-off
    # that has no shape for one.
    for record in credit_notes:
        result.credit_notes += record.total_tax
        result.findings.append(
            Finding(
                category=MatchCategory.MISSING_IN_BOOKS,
                record=record,
                note=(
                    "Credit note in GSTR-2B, not in the purchase register. The "
                    "credit it reverses has been taken off the eligible pool."
                ),
            )
        )
    result.itc_eligible = max(ZERO, result.itc_eligible - result.credit_notes)

    return result


def _score_suppliers(db: Session, business_id: int, result: ReconciliationResult) -> dict:
    """Roll the run's findings into each supplier's compliance record.

    The score is evidence from this tenant's own books only — a supplier who
    files everything for one buyer and nothing for another genuinely is two
    different risks, and the product has no authority to publish a shared
    reputation.

    This function's job is to *record* the period's observation; the weighting
    that turns a history into a number lives in :mod:`app.services.supplier_score`
    and is applied here from the full history rather than from this period
    alone. Re-running a period therefore corrects a supplier's score instead of
    compounding it, which matters because periods are reconciled repeatedly as
    suppliers file late.
    """
    per_gstin: dict[str, dict[str, int]] = {}
    filing_dates: dict[str, date] = {}
    for finding in result.findings:
        gstin = (
            finding.invoice.counterparty_gstin
            if finding.invoice is not None
            else (finding.record.supplier_gstin if finding.record else None)
        )
        if not gstin:
            continue

        # When the supplier actually filed, taken from the earliest 2B row seen
        # for them: a statement carries one filing date per supplier, and the
        # earliest is the one the buyer's claim depends on.
        if finding.record is not None and finding.record.supplier_filing_date:
            existing = filing_dates.get(gstin)
            if existing is None or finding.record.supplier_filing_date < existing:
                filing_dates[gstin] = finding.record.supplier_filing_date

        bucket = per_gstin.setdefault(
            gstin, {"total": 0, "matched": 0, "mismatched": 0, "missing": 0}
        )
        if finding.category is MatchCategory.MISSING_IN_BOOKS:
            continue
        bucket["total"] += 1
        if finding.category is MatchCategory.MATCHED:
            bucket["matched"] += 1
        elif finding.category is MatchCategory.MISMATCHED:
            bucket["mismatched"] += 1
        elif finding.category is MatchCategory.MISSING_IN_2B:
            bucket["missing"] += 1

    summary: dict[str, dict] = {}
    for gstin, tally in per_gstin.items():
        supplier = db.scalar(
            select(Supplier).where(
                Supplier.business_id == business_id,
                Supplier.gstin == gstin,
                Supplier.deleted_at.is_(None),
            )
        )
        if supplier is None:
            continue

        history = [
            entry
            for entry in (supplier.filing_history or [])
            # Replace this period's entry rather than appending a second one:
            # a re-run supersedes what the last run saw.
            if isinstance(entry, dict) and entry.get("period") != result.period
        ]
        observation: dict = {
            "period": result.period,
            "matched": tally["matched"],
            "mismatched": tally["mismatched"],
            "missing": tally["missing"],
        }
        filed_on = filing_dates.get(gstin)
        if filed_on is not None:
            delay = (filed_on - gstr1_due_date(result.period)).days
            observation["filing_delay_days"] = delay
            observation["filed_on"] = filed_on.isoformat()
        history.append(observation)
        # Bounded: this column is an audit trail for the score, not a ledger.
        supplier.filing_history = sorted(history, key=lambda e: e["period"])[-36:]

        # Counters are totals over the recorded history, so re-running a period
        # cannot inflate them.
        supplier.total_invoices = sum(
            int(e.get("matched") or 0) + int(e.get("mismatched") or 0)
            + int(e.get("missing") or 0)
            for e in supplier.filing_history
        )
        supplier.matched_invoices = sum(
            int(e.get("matched") or 0) for e in supplier.filing_history
        )
        supplier.mismatched_invoices = sum(
            int(e.get("mismatched") or 0) for e in supplier.filing_history
        )
        supplier.missing_invoices = sum(
            int(e.get("missing") or 0) for e in supplier.filing_history
        )
        supplier.late_filings = sum(
            1
            for e in supplier.filing_history
            if (e.get("filing_delay_days") or 0) > 0
        )

        score = supplier_score.score_supplier(supplier, as_of_period=result.period)
        supplier_score.apply_score(supplier, score)
        supplier.last_filed_period = result.period
        if filed_on is not None:
            supplier.last_seen_at = filed_on

        summary[gstin] = {
            "compliance_score": supplier.compliance_score,
            "risk_level": supplier.risk_level.value,
            "confidence": float(score.confidence),
            "recommended_provision_pct": float(score.recommended_provision_pct),
            **tally,
        }
    return summary


def _apply_statuses(result: ReconciliationResult) -> None:
    """Write each finding back onto its invoice's status."""
    status_for = {
        MatchCategory.MATCHED: InvoiceStatus.MATCHED,
        MatchCategory.MISMATCHED: InvoiceStatus.MISMATCHED,
        MatchCategory.MISSING_IN_2B: InvoiceStatus.MISSING_IN_2B,
    }
    for finding in result.findings:
        if finding.invoice is None:
            continue
        new_status = status_for.get(finding.category)
        if new_status is not None:
            finding.invoice.status = new_status


def latest_gstr2b(db: Session, business_id: int, period: str) -> GSTRReturn | None:
    """The most recently imported GSTR-2B for *period*, if there is one."""
    return db.scalar(
        select(GSTRReturn)
        .where(
            GSTRReturn.business_id == business_id,
            GSTRReturn.period == period,
            GSTRReturn.return_type == ReturnType.GSTR2B,
            GSTRReturn.deleted_at.is_(None),
        )
        .order_by(GSTRReturn.created_at.desc(), GSTRReturn.id.desc())
        .limit(1)
    )


def latest_completed_run(
    db: Session, business_id: int, period: str
) -> ReconciliationRun | None:
    """The newest run for *period* that actually finished, if there is one.

    Every figure a reconciliation produces — ``itc_eligible``, ``itc_at_risk``,
    the counts — is left at its column default until the run completes, so an
    unfinished row carries zeros rather than nothing. Read as the current
    position, those zeros are indistinguishable from a period in which no
    supplier declared anything: the ITC screen caps the period's credit at
    ``itc_eligible`` and would scale the whole pool to nought, and the GSTR-3B
    built from it fills table 4(A) with zeros — a return that pays the entire
    output tax in cash while the credit sits unclaimed in the ledger.

    A failed run is exactly how that happens, because a failure is recorded
    rather than swallowed: :func:`run_reconciliation` rolls its work back and
    writes a FAILED row, which is then the newest row for the period. A RUNNING
    row left behind by a worker that died mid-run does the same. Neither is
    evidence about what suppliers filed, so neither may be read as any.

    ``latest_gstr2b``'s counterpart, and used by every caller that reads money
    off a run. The runs *list* deliberately does not filter: "what did we try,
    and when" is the question that row exists to answer.
    """
    return db.scalar(
        select(ReconciliationRun)
        .where(
            ReconciliationRun.business_id == business_id,
            ReconciliationRun.period == period,
            ReconciliationRun.deleted_at.is_(None),
            ReconciliationRun.status == ReconciliationStatus.COMPLETED,
        )
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .limit(1)
    )


def records_from_return(gstr_return: GSTRReturn) -> list[GSTR2BRecord]:
    """Rebuild records from a stored return's normalised ``invoices`` block."""
    from app.services.invoice_parser import to_date

    data = gstr_return.data or {}
    rows = data.get("invoices") if isinstance(data, dict) else None
    records: list[GSTR2BRecord] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        records.append(
            GSTR2BRecord(
                supplier_gstin=row.get("supplier_gstin"),
                supplier_name=row.get("supplier_name"),
                invoice_number=row.get("invoice_number"),
                invoice_date=to_date(row.get("invoice_date")),
                period=row.get("period"),
                place_of_supply=row.get("place_of_supply"),
                taxable_value=Decimal(str(row.get("taxable_value") or "0")),
                cgst=Decimal(str(row.get("cgst") or "0")),
                sgst=Decimal(str(row.get("sgst") or "0")),
                igst=Decimal(str(row.get("igst") or "0")),
                cess=Decimal(str(row.get("cess") or "0")),
                total_value=Decimal(str(row.get("total_value") or "0")),
                itc_available=bool(row.get("itc_available", True)),
                reverse_charge=bool(row.get("reverse_charge", False)),
                document_type=str(row.get("document_type") or "R"),
                supplier_filing_date=to_date(row.get("supplier_filing_date")),
                supplier_filing_period=row.get("supplier_filing_period"),
                rate_items=row.get("rate_items") or [],
            )
        )
    return records


class NoGSTR2BImported(RuntimeError):
    """No GSTR-2B has been imported for the period being reconciled."""


def run_reconciliation(
    db: Session,
    business_id: int,
    period: str,
    *,
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> ReconciliationRun:
    """Reconcile *period* and persist the run. Never raises for data reasons.

    A run is a record rather than a result: periods are reconciled repeatedly
    as suppliers file late and the portal regenerates the 2B, and "what did we
    know, and when" is the question an ITC reversal turns on months later. So
    each call appends a row instead of updating the last one.
    """
    gstr_return = latest_gstr2b(db, business_id, period)
    if gstr_return is None:
        raise NoGSTR2BImported(
            f"No GSTR-2B has been imported for {period}. Import one before reconciling."
        )

    started_at = datetime.now(UTC)
    run = ReconciliationRun(
        business_id=business_id,
        period=period,
        status=ReconciliationStatus.RUNNING,
        started_at=started_at,
    )
    db.add(run)
    db.flush()

    try:
        invoices = _book_invoices(db, business_id, period)
        records = records_from_return(gstr_return)
        result = match(invoices, records, period=period, tolerance=tolerance)

        _apply_statuses(result)
        suppliers = _score_suppliers(db, business_id, result)
        counts = result.counts()

        run.total_invoices = result.total_invoices
        run.matched_count = counts[MatchCategory.MATCHED]
        run.mismatched_count = counts[MatchCategory.MISMATCHED]
        run.missing_in_2b_count = counts[MatchCategory.MISSING_IN_2B]
        run.missing_in_books_count = counts[MatchCategory.MISSING_IN_BOOKS]
        run.duplicate_count = counts[MatchCategory.DUPLICATE]
        run.itc_eligible = result.itc_eligible
        run.itc_at_risk = result.itc_at_risk
        run.itc_claimed = result.itc_claimed
        run.report = {
            "tolerance": str(tolerance),
            "gstr2b_return_id": gstr_return.id,
            "gstr2b_record_count": len(records),
            # Why ``itc_eligible`` can be smaller than the invoices that matched.
            "credit_notes": str(result.credit_notes),
            # How much of ``itc_eligible`` belongs to Rule 43's sixty months
            # rather than to this period's input pool. Kept here rather than in
            # a column so the ITC screen can subtract it without a migration.
            "itc_eligible_capital": str(result.itc_eligible_capital),
            "findings": [finding.as_dict() for finding in result.findings],
            "suppliers": suppliers,
        }
        run.status = ReconciliationStatus.COMPLETED
        run.completed_at = datetime.now(UTC)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - the run row is the error channel
        logger.exception("Reconciliation failed for business %s period %s", business_id, period)
        # Throw away everything the half-finished run wrote. By the time this
        # is reached ``_apply_statuses`` has already rewritten every matched
        # invoice's status, and ``_score_suppliers`` may have rewritten some
        # suppliers' filing history and compliance score but not others'.
        # Committing that beside a row that says the run failed leaves the
        # books asserting a reconciliation that never finished: invoices
        # reading MATCHED against a 2B nobody finished comparing them to, and
        # scores computed from a history only partly brought up to date.
        #
        # A failed run must be a no-op with a receipt, and the receipt is the
        # only thing that survives — a period with no row at all looks like one
        # nobody reconciled, which is the ambiguity this row exists to remove.
        db.rollback()
        run = ReconciliationRun(
            business_id=business_id,
            period=period,
            status=ReconciliationStatus.FAILED,
            started_at=started_at,
            completed_at=datetime.now(UTC),
            error=str(exc)[:2000],
        )
        db.add(run)
        db.commit()

    db.refresh(run)
    return run


def store_gstr2b(
    db: Session,
    business_id: int,
    period: str,
    records: list[GSTR2BRecord],
    *,
    source_filename: str | None = None,
    raw: dict | None = None,
) -> GSTRReturn:
    """Persist an imported 2B, replacing any earlier import for the period.

    Replaced rather than appended: the portal regenerates a 2B when a supplier
    files late, and the newest download supersedes the last one outright. The
    superseded row is soft-deleted, so what an earlier reconciliation ran
    against can still be produced during an assessment.
    """
    existing = latest_gstr2b(db, business_id, period)
    if existing is not None:
        existing.soft_delete()
        db.flush()

    totals = summarise_records(records)
    gstr_return = GSTRReturn(
        business_id=business_id,
        period=period,
        return_type=ReturnType.GSTR2B,
        status=ReturnStatus.IMPORTED,
        data={
            "source_filename": source_filename,
            "imported_at": datetime.now(UTC).isoformat(),
            "invoices": [record.as_dict() for record in records],
            # The portal envelope, kept verbatim beside the normalised rows.
            "raw": raw,
        },
        invoice_count=int(totals["invoice_count"]),
        total_taxable_value=totals["total_taxable_value"],
        total_cgst=totals["total_cgst"],
        total_sgst=totals["total_sgst"],
        total_igst=totals["total_igst"],
        total_cess=totals["total_cess"],
    )
    db.add(gstr_return)
    db.commit()
    db.refresh(gstr_return)
    return gstr_return


def summarise_records(records: list[GSTR2BRecord]) -> dict[str, Decimal | int]:
    """Totals for the ``gstr_returns`` summary columns.

    A credit note is subtracted, exactly as :func:`match` subtracts it from the
    eligible pool. The portal states a note's amounts as positive figures and
    leaves the sign to the document type, so summing the money alone read a
    supplier withdrawing half a supply as a second supply: a statement with one
    ₹18,000 invoice and a ₹9,000 note against it was stored — and shown back on
    the import screen — as ₹27,000 of tax, when the credit it actually carries
    is ₹9,000.

    That was the same misreading :func:`match` was fixed for, left behind in
    the summary columns, and it put the two figures in direct contradiction:
    the import said the statement was worth ₹27,000 and the reconciliation that
    followed it found ₹9,000.

    ``invoice_count`` stays a count of the documents in the statement, notes
    included. It answers "did the whole file come through", which is what the
    number beside a freshly imported file is read for, and a note is a document
    that has to be there.

    Floored at zero per column: a statement whose notes exceed its invoices —
    the month after a large return — carries no credit rather than a negative
    amount of it, which is the same floor the eligible pool takes.
    """
    def net(field: str) -> Decimal:
        total = sum(
            (
                -getattr(record, field) if record.is_credit_note else getattr(record, field)
                for record in records
            ),
            ZERO,
        )
        return max(ZERO, total)

    return {
        "invoice_count": len(records),
        "total_taxable_value": net("taxable_value"),
        "total_cgst": net("cgst"),
        "total_sgst": net("sgst"),
        "total_igst": net("igst"),
        "total_cess": net("cess"),
    }


def periods_with_2b(db: Session, business_id: int) -> list[str]:
    """Periods that have an imported GSTR-2B, newest first."""
    return list(
        db.scalars(
            select(GSTRReturn.period)
            .where(
                GSTRReturn.business_id == business_id,
                GSTRReturn.return_type == ReturnType.GSTR2B,
                GSTRReturn.deleted_at.is_(None),
            )
            .order_by(GSTRReturn.period.desc())
        ).all()
    )


def normalize_gstin(value: str | None) -> str | None:
    """Validated GSTIN, or ``None``. Re-exported for the router's convenience."""
    if not value:
        return None
    try:
        return gstin_service.parse(value).gstin
    except gstin_service.InvalidGSTIN:
        return None
