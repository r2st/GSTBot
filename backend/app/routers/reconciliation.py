"""GSTR-2B import and the reconciliation runs that follow it."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_business
from app.models.business import Business
from app.models.gstr_return import GSTRReturn, ReturnType
from app.models.reconciliation_run import ReconciliationRun
from app.schemas.reconciliation import (
    GSTR2BImportOut,
    ReconcileRequest,
    ReconciliationDetailOut,
    ReconciliationListOut,
    ReconciliationRunOut,
)
from app.services import gstr2b, reconciliation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])

ALLOWED_EXTENSIONS = (".json", ".csv", ".txt")


@router.post(
    "/gstr2b/import", response_model=GSTR2BImportOut, status_code=status.HTTP_201_CREATED
)
async def import_gstr2b(
    file: UploadFile = File(..., description="GSTR-2B download: portal JSON or CSV export"),
    period: str | None = Form(
        default=None, description="YYYY-MM; taken from the file when omitted"
    ),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> GSTR2BImportOut:
    """Import a GSTR-2B for a period.

    The period is read out of the file when the caller does not name one: the
    portal stamps the statement period into the download, and a user who has
    just clicked through three months of statements should not have to keep
    track of which one this was.
    """
    filename = file.filename or "gstr2b"
    if not filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type: {filename}. Upload the GSTR-2B JSON from the "
                "GST portal, or a CSV export of it."
            ),
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"File exceeds the {settings.max_upload_mb} MB limit"
        )

    try:
        records = gstr2b.parse(content, filename)
    except gstr2b.GSTR2BParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    if not records:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No invoices found in the file. Check that this is a GSTR-2B download.",
        )

    # Which period this statement is filed under, in order of authority: an
    # explicit form value, the period the portal stamped into the download,
    # then the most common invoice period in the file. The last is a guess, so
    # it breaks ties toward the latest month rather than on dict ordering —
    # late filings drag earlier months in, and the statement is about the
    # newest of them.
    resolved = period or next(
        (record.statement_period for record in records if record.statement_period), None
    )
    if resolved is None:
        periods = [record.period for record in records if record.period]
        resolved = max(sorted(set(periods), reverse=True), key=periods.count) if periods else None
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Could not determine the period from the file. Re-upload and set the "
                "period explicitly."
            ),
        )

    had_previous = reconciliation.latest_gstr2b(db, business.id, resolved) is not None
    stored = reconciliation.store_gstr2b(
        db, business.id, resolved, records, source_filename=filename
    )

    other_periods = sorted(
        {record.period for record in records if record.period and record.period != resolved}
    )
    message = f"Imported {len(records)} invoices for {resolved}"
    if had_previous:
        message += " (replacing the previous import)"
    if other_periods:
        # Not an error: these are late filings, and they reconcile against the
        # month they belong to rather than this statement's month.
        message += (
            f". {len(other_periods)} other period(s) present: {', '.join(other_periods)}"
        )

    return GSTR2BImportOut(
        **{key: getattr(stored, key) for key in (
            "id", "period", "return_type", "status", "invoice_count",
            "total_taxable_value", "total_cgst", "total_sgst", "total_igst",
            "total_cess", "created_at",
        )},
        other_periods=other_periods,
        replaced_previous=had_previous,
        message=message,
    )


@router.get("/gstr2b/periods", response_model=list[str])
def list_imported_periods(
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> list[str]:
    """Periods with a GSTR-2B on file, newest first."""
    return reconciliation.periods_with_2b(db, business.id)


@router.post("/run", response_model=ReconciliationDetailOut, status_code=status.HTTP_201_CREATED)
def run(
    payload: ReconcileRequest,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ReconciliationDetailOut:
    """Reconcile a period's purchase register against its GSTR-2B.

    Runs inline. The caller is waiting on the answer, and matching a month of
    invoices is arithmetic over rows already in the database — unlike parsing,
    it makes no network call that could rate-limit.
    """
    try:
        completed = reconciliation.run_reconciliation(
            db, business.id, payload.period, tolerance=payload.tolerance
        )
    except reconciliation.NoGSTR2BImported as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return ReconciliationDetailOut.model_validate(completed)


@router.get("", response_model=ReconciliationListOut)
def list_runs(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ReconciliationListOut:
    """Past runs, newest first."""
    conditions = [
        ReconciliationRun.business_id == business.id,
        ReconciliationRun.deleted_at.is_(None),
    ]
    if period:
        conditions.append(ReconciliationRun.period == period)

    total = int(db.scalar(select(func.count(ReconciliationRun.id)).where(*conditions)) or 0)
    rows = db.scalars(
        select(ReconciliationRun)
        .where(*conditions)
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return ReconciliationListOut(
        items=[ReconciliationRunOut.model_validate(row) for row in rows], total=total
    )


@router.get("/latest", response_model=ReconciliationDetailOut)
def latest_run(
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ReconciliationDetailOut:
    """The most recent run for a period, report included."""
    found = db.scalar(
        select(ReconciliationRun)
        .where(
            ReconciliationRun.business_id == business.id,
            ReconciliationRun.period == period,
            ReconciliationRun.deleted_at.is_(None),
        )
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .limit(1)
    )
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No reconciliation has been run for {period}",
        )
    return ReconciliationDetailOut.model_validate(found)


@router.get("/{run_id}", response_model=ReconciliationDetailOut)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ReconciliationDetailOut:
    """One run with its full per-invoice report.

    404 rather than 403 outside the tenant: a 403 confirms the id exists, which
    leaks that another business ran a reconciliation.
    """
    found = db.scalar(
        select(ReconciliationRun).where(
            ReconciliationRun.id == run_id,
            ReconciliationRun.business_id == business.id,
            ReconciliationRun.deleted_at.is_(None),
        )
    )
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reconciliation run not found"
        )
    return ReconciliationDetailOut.model_validate(found)


@router.get("/gstr2b/{period}", response_model=GSTR2BImportOut)
def get_imported_2b(
    period: str,
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> GSTR2BImportOut:
    """The GSTR-2B currently on file for a period."""
    found = db.scalar(
        select(GSTRReturn)
        .where(
            GSTRReturn.business_id == business.id,
            GSTRReturn.period == period,
            GSTRReturn.return_type == ReturnType.GSTR2B,
            GSTRReturn.deleted_at.is_(None),
        )
        .order_by(GSTRReturn.created_at.desc(), GSTRReturn.id.desc())
        .limit(1)
    )
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No GSTR-2B imported for {period}",
        )
    return GSTR2BImportOut.model_validate(found)
