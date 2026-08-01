"""Filing preparation: validate a period, generate the return, export it."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_business
from app.models.business import Business
from app.models.invoice import InvoiceType
from app.schemas.filing import FilingPreviewOut, ValidationReportOut
from app.services import filing as filing_service
from app.services import invoice_service

router = APIRouter(prefix="/filing", tags=["filing"])

# Which direction of invoice each return is built from.
_DIRECTION = {
    "gstr1": InvoiceType.SALES,
    "gstr3b": InvoiceType.SALES,
    "purchases": InvoiceType.PURCHASE,
}


def _resolve_period(period: str | None) -> str:
    return period or invoice_service.month_of()


@router.get("/validate", response_model=ValidationReportOut)
def validate(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    invoice_type: InvoiceType = Query(default=InvoiceType.SALES),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ValidationReportOut:
    """Everything that would stop a period being filed, and what merely ought to be fixed.

    Runs over sales by default, because that is what GSTR-1 is built from.
    Purchases are validated too — a supplier GSTIN that does not checksum is a
    credit that will never match — but they are asked for explicitly.
    """
    report = filing_service.validate_period(
        db, business, _resolve_period(period), invoice_type=invoice_type
    )
    return ValidationReportOut.model_validate(report.as_dict())


@router.get("/gstr1", response_model=FilingPreviewOut)
def preview_gstr1(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> FilingPreviewOut:
    """GSTR-1 for a period, in the portal's JSON shape, with its validation."""
    resolved = _resolve_period(period)
    return FilingPreviewOut(
        period=resolved,
        return_type="gstr1",
        document=filing_service.build_gstr1(db, business, resolved),
        validation=ValidationReportOut.model_validate(
            filing_service.validate_period(db, business, resolved).as_dict()
        ),
    )


@router.get("/gstr3b", response_model=FilingPreviewOut)
def preview_gstr3b(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> FilingPreviewOut:
    """GSTR-3B pre-filled from the reconciled position, with its validation."""
    resolved = _resolve_period(period)
    return FilingPreviewOut(
        period=resolved,
        return_type="gstr3b",
        document=filing_service.build_gstr3b(db, business, resolved),
        validation=ValidationReportOut.model_validate(
            filing_service.validate_period(db, business, resolved).as_dict()
        ),
    )


@router.get("/export/{return_type}.{extension}")
def export(
    return_type: str,
    extension: str,
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> Response:
    """Download a period as JSON for the portal, or CSV for a human.

    A download rather than a JSON body: this file goes into the government's
    offline utility or a spreadsheet, and it should arrive named for the GSTIN
    and period it covers rather than as ``download (3)``.

    Exports regardless of validation errors, on purpose. A business that wants
    to see what its half-finished GSTR-1 looks like is entitled to; the
    validation endpoint is what says whether to file it, and the preview
    endpoints return both together.
    """
    resolved = _resolve_period(period)
    kind = return_type.lower()
    fmt = extension.lower()

    if kind not in _DIRECTION:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown return type '{return_type}'. Expected one of: "
            + ", ".join(sorted(_DIRECTION)),
        )
    if fmt not in ("json", "csv"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown format '{extension}'. Expected json or csv.",
        )

    filename = filing_service.filename_for(business, resolved, kind, fmt)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    if fmt == "csv":
        body = filing_service.to_csv(db, business, resolved, _DIRECTION[kind])
        # UTF-8 BOM: Excel reads a plain UTF-8 CSV as Latin-1 and mangles every
        # trade name with a rupee sign or a non-ASCII character in it.
        return Response(
            content="﻿" + body,
            media_type="text/csv; charset=utf-8",
            headers=headers,
        )

    if kind == "gstr3b":
        document = filing_service.build_gstr3b(db, business, resolved)
    elif kind == "gstr1":
        document = filing_service.build_gstr1(db, business, resolved)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Purchases can only be exported as CSV",
        )

    return Response(
        content=json.dumps(document, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers=headers,
    )
