"""Persisting invoices: storage, plan limits, dedup, and the parse write-back.

The router stays thin and this module owns the rules, because the same three
steps have to happen identically whether an invoice arrives from the upload
endpoint, an inbound email, or a WhatsApp photo.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.business import Business
from app.models.invoice import Invoice, InvoiceSource, InvoiceStatus, InvoiceType
from app.models.supplier import Supplier
from app.services import gst_calendar
from app.services import gstin as gstin_service
from app.services.invoice_parser import ParsedInvoice, parse_invoice

logger = logging.getLogger(__name__)


class PlanLimitExceeded(RuntimeError):
    """The tenant has used up their plan's invoices for the month."""


class DuplicateInvoice(RuntimeError):
    """This exact file, or this invoice number, is already on file."""

    def __init__(self, message: str, invoice_id: int) -> None:
        super().__init__(message)
        self.invoice_id = invoice_id


def month_of(moment: datetime | None = None) -> str:
    """The current filing period as ``YYYY-MM``, in India.

    This is the period the dashboard, the ITC screen and the filing endpoints
    fall back to when the caller names none, so it is a question about the
    Indian calendar and not about the server's. A box on UTC still reads last
    month until 05:30 IST on the 1st, which would open the new month's
    dashboard on the month that has just closed.

    An explicit *moment* is converted rather than read as-is, so a caller that
    passes a UTC instant gets the Indian date it fell on.
    """
    return gst_calendar.period_of(
        gst_calendar.ist_date(moment) if moment else gst_calendar.today_ist()
    )


def month_bounds(period: str) -> tuple[datetime, datetime]:
    """The instants a ``YYYY-MM`` period begins and ends, as UTC.

    The boundary is midnight *in India* — that is when a business's month rolls
    over and when their plan's allowance should reset — but it is returned in
    UTC because that is what the stored timestamps are.

    Converting rather than handing an IST-aware value straight to the query is
    load-bearing. On Postgres a ``timestamptz`` comparison normalises either
    one correctly; SQLAlchemy's SQLite type formats whatever wall clock the
    value carries and drops the offset, so an IST-aware bound would compare
    ``00:00`` against UTC-stored rows and be five and a half hours out — right
    in production, wrong in the suite, which is the split nothing catches.
    """
    year, month = (int(part) for part in period.split("-"))
    start = datetime(year, month, 1, tzinfo=gst_calendar.IST)
    end = (
        datetime(year + 1, 1, 1, tzinfo=gst_calendar.IST)
        if month == 12
        else datetime(year, month + 1, 1, tzinfo=gst_calendar.IST)
    )
    return start.astimezone(UTC), end.astimezone(UTC)


def monthly_usage(db: Session, business_id: int, period: str | None = None) -> int:
    """Invoices uploaded by this tenant in *period* (default: this month).

    Counts by upload month rather than by invoice date, because the plan sells
    processing capacity — a business catching up on last quarter's paperwork is
    using this month's capacity to do it.

    The month is the Indian one. Counted against UTC midnight instead, a
    business that used up October's allowance stays blocked until 05:30 IST on
    1 November — they are told to upgrade on a day their plan has already
    reset — and the invoices they upload in those hours are charged to the
    month that closed.
    """
    period = period or month_of()
    start, end = month_bounds(period)
    return int(
        db.scalar(
            select(func.count(Invoice.id)).where(
                Invoice.business_id == business_id,
                Invoice.deleted_at.is_(None),
                Invoice.created_at >= start,
                Invoice.created_at < end,
            )
        )
        or 0
    )


def plan_limit(business: Business) -> int:
    """Monthly invoice cap for this tenant's plan; 0 means unlimited."""
    return settings.plan_limits.get(str(business.plan.value), 0)


def check_plan_limit(db: Session, business: Business) -> None:
    """Raise :class:`PlanLimitExceeded` if the tenant is at their cap."""
    limit = plan_limit(business)
    if limit and monthly_usage(db, business.id) >= limit:
        raise PlanLimitExceeded(
            f"Plan '{business.plan.value}' allows {limit} invoices per month. "
            "Upgrade to continue uploading."
        )


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def store_upload(content: bytes, filename: str, business_id: int) -> str:
    """Write the upload to disk and return its path.

    Namespaced by tenant and prefixed with a UUID: two businesses both
    uploading "invoice.pdf" must not be able to reach each other's file, and
    the stored name must not be attacker-controlled.
    """
    directory = Path(settings.upload_dir) / str(business_id)
    directory.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename or "").suffix[:10]
    path = directory / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(content)
    return str(path)


def find_duplicate(
    db: Session,
    business_id: int,
    *,
    digest: str | None = None,
    invoice_type: InvoiceType | None = None,
    counterparty_gstin: str | None = None,
    invoice_number: str | None = None,
) -> Invoice | None:
    """An existing invoice that this upload would duplicate, if any.

    Two ways to be a duplicate, checked in this order: the identical file
    (same SHA-256), or the same invoice number from the same counterparty.
    """
    if digest:
        existing = db.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.file_hash == digest,
                Invoice.deleted_at.is_(None),
            )
        )
        if existing:
            return existing
    if invoice_type and counterparty_gstin and invoice_number:
        return db.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.invoice_type == invoice_type,
                Invoice.counterparty_gstin == counterparty_gstin,
                Invoice.invoice_number == invoice_number,
                Invoice.deleted_at.is_(None),
            )
        )
    return None


def get_or_create_supplier(
    db: Session, business_id: int, gstin: str, name: str | None = None
) -> Supplier:
    """The supplier row for *gstin* under this tenant, creating it if new."""
    supplier = db.scalar(
        select(Supplier).where(
            Supplier.business_id == business_id,
            Supplier.gstin == gstin,
            Supplier.deleted_at.is_(None),
        )
    )
    if supplier is None:
        supplier = Supplier(
            business_id=business_id,
            gstin=gstin,
            legal_name=name,
            state_code=gstin_service.state_code_of(gstin),
        )
        db.add(supplier)
        db.flush()
    elif name and not supplier.legal_name:
        supplier.legal_name = name
    return supplier


def create_pending_invoice(
    db: Session,
    business: Business,
    *,
    content: bytes,
    filename: str,
    content_type: str | None,
    invoice_type: InvoiceType,
    source: InvoiceSource = InvoiceSource.UPLOAD,
) -> Invoice:
    """Store an upload and record it as awaiting extraction.

    Committed before any parsing happens, so the file is durably ours the
    moment the request returns. Extraction can then run on a worker, fail, and
    be retried without the user needing the paper again.
    """
    check_plan_limit(db, business)

    digest = file_hash(content)
    duplicate = find_duplicate(db, business.id, digest=digest)
    if duplicate is not None:
        raise DuplicateInvoice(
            f"This file was already uploaded as invoice {duplicate.id}", duplicate.id
        )

    invoice = Invoice(
        business_id=business.id,
        invoice_type=invoice_type,
        status=InvoiceStatus.UPLOADED,
        source=source,
        source_filename=filename,
        content_type=content_type,
        file_size=len(content),
        file_hash=digest,
        storage_path=store_upload(content, filename, business.id),
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def apply_parsed(db: Session, invoice: Invoice, parsed: ParsedInvoice) -> Invoice:
    """Write an extraction onto an invoice row and link its counterparty.

    Which party is "the counterparty" flips with direction: on a purchase we
    are the buyer and the supplier is the other side, on a sale it is the
    reverse. Getting this backwards would file our own GSTIN as the vendor on
    every purchase, so it is decided here once rather than at each call site.
    """
    business_gstin = invoice.business.gstin if invoice.business else None

    if invoice.invoice_type == InvoiceType.PURCHASE:
        counterparty = parsed.supplier_gstin
        counterparty_name = parsed.supplier_name
        # A supplier who filled in only one GSTIN put their own on the
        # invoice; if it happens to be ours, the other one is theirs.
        if counterparty and business_gstin and counterparty == business_gstin:
            counterparty = parsed.buyer_gstin
            counterparty_name = parsed.buyer_name
    else:
        counterparty = parsed.buyer_gstin
        counterparty_name = parsed.buyer_name
        if counterparty and business_gstin and counterparty == business_gstin:
            counterparty = parsed.supplier_gstin
            counterparty_name = parsed.supplier_name

    invoice.counterparty_gstin = counterparty
    invoice.counterparty_name = counterparty_name
    invoice.invoice_number = parsed.invoice_number
    invoice.invoice_date = parsed.invoice_date
    invoice.period = parsed.period
    invoice.place_of_supply = parsed.place_of_supply
    invoice.hsn_code = parsed.hsn_code
    invoice.taxable_value = parsed.taxable_value
    invoice.cgst = parsed.cgst
    invoice.sgst = parsed.sgst
    invoice.igst = parsed.igst
    invoice.cess = parsed.cess
    invoice.total_value = parsed.total_value
    invoice.tax_rate = parsed.tax_rate
    invoice.reverse_charge = parsed.reverse_charge
    invoice.line_items = parsed.line_items or None
    invoice.raw_text = parsed.raw_text or None
    invoice.extraction = parsed.as_dict()
    invoice.parsed_with = parsed.parsed_with
    invoice.extraction_confidence = parsed.confidence
    invoice.parse_error = None
    invoice.status = InvoiceStatus.PARSED

    # A purchase from an identifiable supplier gets a supplier row, which is
    # what the compliance score is later built on.
    if invoice.invoice_type == InvoiceType.PURCHASE and counterparty:
        supplier = get_or_create_supplier(db, invoice.business_id, counterparty, counterparty_name)
        invoice.supplier_id = supplier.id

    return invoice


def process_invoice(db: Session, invoice: Invoice) -> Invoice:
    """Parse a stored invoice and record the outcome. Never raises.

    A failure is written to the row as ``FAILED`` with the reason, rather than
    propagating: this runs on a Celery worker where an exception would be a
    log line nobody reads, and the user needs to see which of their fifty
    uploads needs attention.

    The write-back is inside the guarded block as well as the parse. Committing
    outside it is what leaves a row stuck in ``PROCESSING``: the parse can
    succeed and the *insert* still fail, and the user is then watching a
    spinner for a document nothing is coming back to.
    """
    invoice.status = InvoiceStatus.PROCESSING
    db.commit()

    # Captured as soon as they are known. A rollback reverts them on the
    # instance, and they are the only detail that makes the message below
    # worth reading.
    number: str | None = None
    counterparty: str | None = None

    try:
        path = Path(invoice.storage_path) if invoice.storage_path else None
        content = path.read_bytes() if path and path.exists() else None
        if content is None and not invoice.raw_text:
            raise FileNotFoundError(f"Stored file is missing: {invoice.storage_path}")

        parsed = parse_invoice(
            content=content,
            content_type=invoice.content_type,
            filename=invoice.source_filename,
            text=invoice.raw_text,
        )
        apply_parsed(db, invoice, parsed)
        number, counterparty = invoice.invoice_number, invoice.counterparty_gstin
        db.commit()
    except IntegrityError:
        # The same invoice number from the same counterparty is already on
        # file. Only discoverable here: the number is not known until the
        # document has been read, so the dedup at upload time can compare
        # nothing but file hashes — and a re-scan of a paper invoice is a
        # different file every time.
        db.rollback()
        existing = find_duplicate(
            db,
            invoice.business_id,
            invoice_type=invoice.invoice_type,
            counterparty_gstin=counterparty,
            invoice_number=number,
        )
        logger.info(
            "Invoice %s duplicates invoice %s", invoice.id, existing.id if existing else "?"
        )
        invoice.status = InvoiceStatus.FAILED
        invoice.parse_error = _duplicate_message(number, existing)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - the row is the error channel
        # Rollback before writing the failure: a half-applied extraction is
        # worse than none, and after a failed flush the session refuses to
        # commit anything at all until it is cleared.
        db.rollback()
        logger.exception("Invoice %s failed to parse", invoice.id)
        invoice.status = InvoiceStatus.FAILED
        invoice.parse_error = str(exc)[:2000]
        db.commit()

    db.refresh(invoice)
    return invoice


def _duplicate_message(number: str | None, existing: Invoice | None) -> str:
    """Why the row failed, in the words of someone who uploaded a document.

    The constraint name and the psycopg traceback are true and useless; what
    the user needs is which invoice this repeats so they can delete one.
    """
    named = f"Invoice {number}" if number else "This invoice"
    if existing is not None:
        return f"{named} is already on file as invoice {existing.id}."
    return f"{named} is already on file."


def tax_summary(
    db: Session, business_id: int, period: str | None = None
) -> dict[str, dict[str, int | Decimal]]:
    """Aggregate tax by direction, for the dashboard.

    One grouped query rather than a query per figure: the dashboard is the
    most-hit endpoint in the product and a business can hold tens of thousands
    of invoices.

    Failed extractions are left out, because the returns leave them out. The
    dashboard's net liability is the number a business plans its cash around,
    and it has to be the number the GSTR-3B it files will show — a row whose
    figures are stale from an earlier read is not in the return, and must not
    be in the total either. The status counts above are unaffected: those are
    lifetime counts of documents, and a failed one still needs attention.

    Three buckets, not two. ``sales`` and ``purchase`` are the tax that appears
    on invoices in each direction; ``credit`` is the part of the purchase side
    that may actually be claimed, which is a smaller and different number. Tax
    on a purchase is not credit if the credit is blocked under s.17(5) — a car,
    a staff lunch, a club membership — or if the supply is under reverse
    charge, where the supplier charges nothing and the buyer self-assesses.
    :mod:`app.services.itc` has always drawn that line; the dashboard's net
    liability is what it is drawn for, because subtracting a blocked credit
    from output tax tells a business it owes less than it does.
    """
    conditions = [
        Invoice.business_id == business_id,
        Invoice.deleted_at.is_(None),
        Invoice.status != InvoiceStatus.FAILED,
    ]
    if period:
        conditions.append(Invoice.period == period)

    # The same test ``itc.summarise`` applies before pooling a purchase into
    # available credit, expressed in SQL so the claimable totals come back from
    # the same grouped scan rather than a second pass over the table.
    claims_credit = and_(
        Invoice.itc_eligible.is_(True), Invoice.reverse_charge.is_(False)
    )
    MONEY = ("taxable_value", "cgst", "sgst", "igst", "cess", "total_value")

    def _summed(name: str):
        return func.coalesce(func.sum(getattr(Invoice, name)), 0)

    def _summed_if_claimable(name: str):
        return func.coalesce(
            func.sum(case((claims_credit, getattr(Invoice, name)), else_=0)), 0
        )

    rows = db.execute(
        select(
            Invoice.invoice_type,
            func.count(Invoice.id),
            *(_summed(name) for name in MONEY),
            func.count(case((claims_credit, Invoice.id))),
            *(_summed_if_claimable(name) for name in MONEY),
        )
        .where(*conditions)
        .group_by(Invoice.invoice_type)
    ).all()

    def _blank() -> dict[str, int | Decimal]:
        return {
            "count": 0,
            "taxable_value": Decimal("0.00"),
            "cgst": Decimal("0.00"),
            "sgst": Decimal("0.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
            "total_value": Decimal("0.00"),
            "total_tax": Decimal("0.00"),
        }

    def _fill(bucket: dict, count, money) -> None:
        bucket["count"] = int(count)
        for name, value in zip(MONEY, money, strict=True):
            bucket[name] = Decimal(str(value))
        bucket["total_tax"] = (
            bucket["cgst"] + bucket["sgst"] + bucket["igst"] + bucket["cess"]
        )

    summary = {"sales": _blank(), "purchase": _blank(), "credit": _blank()}
    width = len(MONEY)
    for row in rows:
        invoice_type, count, *rest = row
        key = invoice_type.value if hasattr(invoice_type, "value") else str(invoice_type)
        _fill(summary.setdefault(key, _blank()), count, rest[:width])
        # Only a purchase can carry credit; a sale's claimable columns are the
        # same arithmetic over rows that never had credit to begin with.
        if key == InvoiceType.PURCHASE.value:
            _fill(summary["credit"], rest[width], rest[width + 1 :])
    return summary
