"""The ITC position: what is available, what reverses, and what settles it."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_business
from app.models.business import Business
from app.schemas.itc import ITCSummaryOut, Rule37Out, SetOffOut, SetOffRequest
from app.services import invoice_service
from app.services import itc as itc_service

router = APIRouter(prefix="/itc", tags=["itc"])


@router.get("", response_model=ITCSummaryOut)
def get_itc_summary(
    period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    exempt_turnover: Decimal | None = Query(default=None, ge=0),
    total_turnover: Decimal | None = Query(default=None, ge=0),
    as_of: date | None = Query(
        default=None, description="Date the 180-day clock is measured against"
    ),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> ITCSummaryOut:
    """The full ITC position for a period.

    The turnover figures are overridable because Rule 42 turns on *exempt
    turnover*, and the product can only infer that from sales invoices that
    carry no tax. A business with exempt supplies it does not invoice through
    GSTBot knows the real number, and a reversal computed from the wrong
    denominator is worse than one the user supplied.

    ``as_of`` exists for the same reason a CA asks "where did this stand at
    year end" — the 180-day clock has a different answer on every date.
    """
    period = period or invoice_service.month_of()
    summary = itc_service.summarise(
        db,
        business.id,
        period,
        as_of=as_of,
        exempt_turnover=exempt_turnover,
        total_turnover=total_turnover,
    )
    return ITCSummaryOut.model_validate(summary.as_dict())


@router.get("/rule37", response_model=Rule37Out)
def get_rule_37(
    as_of: date | None = Query(default=None),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> Rule37Out:
    """Purchases whose credit has reversed, or is about to, for non-payment.

    Deliberately not scoped to a period: the invoice that crosses 180 days is
    one from eight months ago, and a period filter would never surface it.
    """
    invoices = itc_service.purchase_invoices(db, business.id)
    return Rule37Out.model_validate(itc_service.rule_37(invoices, as_of=as_of).as_dict())


@router.post("/set-off", response_model=SetOffOut)
def compute_set_off(payload: SetOffRequest) -> SetOffOut:
    """Apply a given credit against a given liability, in the statutory order.

    Pure arithmetic over what the caller sends — no database — so a CA can try
    a what-if against figures that are not in the books yet.
    """
    credit = itc_service.TaxHeads(
        igst=payload.credit_igst,
        cgst=payload.credit_cgst,
        sgst=payload.credit_sgst,
        cess=payload.credit_cess,
    )
    liability = itc_service.TaxHeads(
        igst=payload.liability_igst,
        cgst=payload.liability_cgst,
        sgst=payload.liability_sgst,
        cess=payload.liability_cess,
    )
    return SetOffOut.model_validate(itc_service.set_off(credit, liability).as_dict())
