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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.business import Business
from app.models.invoice import Invoice, InvoiceSource, InvoiceStatus, InvoiceType
from app.models.supplier import Supplier
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
    """The current filing period as ``YYYY-MM``."""
    return (moment or datetime.now(UTC)).strftime("%Y-%m")


def monthly_usage(db: Session, business_id: int, period: str | None = None) -> int:
    """Invoices uploaded by this tenant in *period* (default: this month).

    Counts by upload month rather than by invoice date, because the plan sells
    processing capacity — a business catching up on last quarter's paperwork is
    using this month's capacity to do it.
    """
    period = period or month_of()
    start = datetime.strptime(period, "%Y-%m").replace(tzinfo=UTC)
    end = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
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
    """
    invoice.status = InvoiceStatus.PROCESSING
    db.commit()

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
    except Exception as exc:  # noqa: BLE001 - the row is the error channel
        logger.exception("Invoice %s failed to parse", invoice.id)
        invoice.status = InvoiceStatus.FAILED
        invoice.parse_error = str(exc)[:2000]

    db.commit()
    db.refresh(invoice)
    return invoice


def tax_summary(
    db: Session, business_id: int, period: str | None = None
) -> dict[str, dict[str, int | Decimal]]:
    """Aggregate tax by direction, for the dashboard.

    One grouped query rather than a query per figure: the dashboard is the
    most-hit endpoint in the product and a business can hold tens of thousands
    of invoices.
    """
    conditions = [Invoice.business_id == business_id, Invoice.deleted_at.is_(None)]
    if period:
        conditions.append(Invoice.period == period)

    rows = db.execute(
        select(
            Invoice.invoice_type,
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.taxable_value), 0),
            func.coalesce(func.sum(Invoice.cgst), 0),
            func.coalesce(func.sum(Invoice.sgst), 0),
            func.coalesce(func.sum(Invoice.igst), 0),
            func.coalesce(func.sum(Invoice.cess), 0),
            func.coalesce(func.sum(Invoice.total_value), 0),
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

    summary = {"sales": _blank(), "purchase": _blank()}
    for invoice_type, count, taxable, cgst, sgst, igst, cess, total in rows:
        key = invoice_type.value if hasattr(invoice_type, "value") else str(invoice_type)
        bucket = summary.setdefault(key, _blank())
        bucket["count"] = int(count)
        bucket["taxable_value"] = Decimal(str(taxable))
        bucket["cgst"] = Decimal(str(cgst))
        bucket["sgst"] = Decimal(str(sgst))
        bucket["igst"] = Decimal(str(igst))
        bucket["cess"] = Decimal(str(cess))
        bucket["total_value"] = Decimal(str(total))
        bucket["total_tax"] = (
            bucket["cgst"] + bucket["sgst"] + bucket["igst"] + bucket["cess"]
        )
    return summary
