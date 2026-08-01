"""Invoice upload, listing, review and correction."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_business
from app.models.business import Business
from app.models.invoice import Invoice, InvoiceSource, InvoiceStatus, InvoiceType
from app.schemas.invoice import (
    InvoiceDetailOut,
    InvoiceListOut,
    InvoiceOut,
    InvoiceUpdate,
    InvoiceUploadResponse,
)
from app.services import invoice_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
    "text/plain", "text/csv", "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    # Browsers send this for a file they cannot type; the extension decides.
    "application/octet-stream",
}
ALLOWED_EXTENSIONS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic",
    ".txt", ".csv", ".xlsx", ".xlsm", ".xls",
)


def _owned_invoice(db: Session, business: Business, invoice_id: int) -> Invoice:
    """Fetch an invoice, 404ing on anything outside the caller's tenant.

    404 rather than 403 for another tenant's row: a 403 would confirm that the
    id exists, which is enough to probe a competitor's invoice volume.
    """
    invoice = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.business_id == business.id,
            Invoice.deleted_at.is_(None),
        )
    )
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return invoice


@router.post("/upload", response_model=InvoiceUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_invoice(
    file: UploadFile = File(..., description="Invoice as PDF, image, CSV or Excel"),
    invoice_type: InvoiceType = Form(InvoiceType.PURCHASE),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> InvoiceUploadResponse:
    """Upload one invoice and extract its fields.

    The file is stored and committed first, then parsed — either on a Celery
    worker or, when ``CELERY_ENABLED`` is off, inline. Parsing is the slow and
    failure-prone half (a free-tier model call), and separating it means a
    rate-limited model costs a retry rather than the document.
    """
    filename = file.filename or "invoice"
    lowered = filename.lower()
    if file.content_type not in ALLOWED_CONTENT_TYPES and not lowered.endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type or filename}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            # Literal rather than the constant: Starlette renamed this to
            # HTTP_413_CONTENT_TOO_LARGE and deprecated the old spelling, so
            # either name ties us to a version range. The number does not move.
            status_code=413,
            detail=f"File exceeds the {settings.max_upload_mb} MB limit",
        )

    try:
        invoice = invoice_service.create_pending_invoice(
            db,
            business,
            content=content,
            filename=filename,
            content_type=file.content_type,
            invoice_type=invoice_type,
            source=InvoiceSource.UPLOAD,
        )
    except invoice_service.PlanLimitExceeded as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
    except invoice_service.DuplicateInvoice as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": str(exc), "invoice_id": exc.invoice_id},
        ) from exc

    queued = False
    if settings.celery_enabled:
        from app.tasks.invoice_tasks import parse_invoice_task

        try:
            parse_invoice_task.delay(invoice.id)
            queued = True
        except Exception as exc:  # noqa: BLE001 - a dead broker must not lose the file
            # The row is already committed, so falling back to inline parsing
            # costs latency rather than the upload.
            logger.warning("Could not queue invoice %s, parsing inline: %s", invoice.id, exc)

    if not queued:
        invoice = invoice_service.process_invoice(db, invoice)

    return InvoiceUploadResponse(
        invoice=InvoiceDetailOut.from_invoice(invoice),
        queued=queued,
        message="Invoice queued for extraction" if queued else "Invoice processed",
    )


@router.get("", response_model=InvoiceListOut)
def list_invoices(
    invoice_type: InvoiceType | None = None,
    invoice_status: InvoiceStatus | None = Query(default=None, alias="status"),
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    counterparty_gstin: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> InvoiceListOut:
    """List this tenant's invoices, newest first."""
    conditions = [Invoice.business_id == business.id, Invoice.deleted_at.is_(None)]
    if invoice_type:
        conditions.append(Invoice.invoice_type == invoice_type)
    if invoice_status:
        conditions.append(Invoice.status == invoice_status)
    if period:
        conditions.append(Invoice.period == period)
    if counterparty_gstin:
        conditions.append(Invoice.counterparty_gstin == counterparty_gstin.upper())
    if search:
        pattern = f"%{search}%"
        conditions.append(
            Invoice.invoice_number.ilike(pattern) | Invoice.counterparty_name.ilike(pattern)
        )

    total = int(db.scalar(select(func.count(Invoice.id)).where(*conditions)) or 0)
    rows = db.scalars(
        select(Invoice)
        .where(*conditions)
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return InvoiceListOut(
        items=[InvoiceOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{invoice_id}", response_model=InvoiceDetailOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> InvoiceDetailOut:
    return InvoiceDetailOut.from_invoice(_owned_invoice(db, business, invoice_id))


@router.patch("/{invoice_id}", response_model=InvoiceDetailOut)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> InvoiceDetailOut:
    """Apply a reviewer's corrections.

    A corrected invoice is promoted out of ``FAILED``: a human has now supplied
    the fields the extractor could not, so it belongs in the filing pool rather
    than in the error queue. ``parsed_with`` records that a person touched it.
    """
    invoice = _owned_invoice(db, business, invoice_id)
    changes = payload.model_dump(exclude_unset=True)
    for attr, value in changes.items():
        setattr(invoice, attr, value)

    if "invoice_date" in changes and invoice.invoice_date:
        invoice.period = invoice.invoice_date.strftime("%Y-%m")
    if changes:
        invoice.parsed_with = "manual"
        invoice.extraction_confidence = 1.0
        if invoice.status in (InvoiceStatus.FAILED, InvoiceStatus.UPLOADED):
            invoice.status = InvoiceStatus.PARSED
        if invoice.invoice_type == InvoiceType.PURCHASE and invoice.counterparty_gstin:
            supplier = invoice_service.get_or_create_supplier(
                db, business.id, invoice.counterparty_gstin, invoice.counterparty_name
            )
            invoice.supplier_id = supplier.id

    db.commit()
    db.refresh(invoice)
    return InvoiceDetailOut.from_invoice(invoice)


@router.post("/{invoice_id}/reparse", response_model=InvoiceDetailOut)
def reparse_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> InvoiceDetailOut:
    """Re-run extraction over the stored file.

    Always inline: the caller asked for this and is waiting on the answer,
    unlike an upload where the queue is what keeps the request fast.
    """
    invoice = _owned_invoice(db, business, invoice_id)
    return InvoiceDetailOut.from_invoice(invoice_service.process_invoice(db, invoice))


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> None:
    """Soft-delete an invoice. The row and the stored file both stay."""
    invoice = _owned_invoice(db, business, invoice_id)
    invoice.soft_delete()
    db.commit()
