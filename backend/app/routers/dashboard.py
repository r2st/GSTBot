"""The dashboard: counts, tax summary, and what is owed this period."""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_business
from app.core.rate_limit import RateLimit
from app.models.alert import OPEN_STATUSES, Alert
from app.models.business import Business
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.schemas.dashboard import (
    DashboardOut,
    InvoiceCounts,
    NetLiability,
    PeriodSummary,
    PlanUsage,
    TaxBucket,
)
from app.services import gst_calendar, invoice_service, reconciliation
from app.services.gst_calendar import gstr3b_due_date

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# The heaviest read in the product: seven periods of tax summary plus four
# aggregate counts. Limited more tightly than a plain list because a polling
# client here costs real database work.
_dashboard_limit = RateLimit("dashboard", "120/minute")

# An extraction below this needs a human to look at it before it is filed.
REVIEW_CONFIDENCE_THRESHOLD = 0.6

# How many months of history the dashboard chart shows.
RECENT_PERIOD_COUNT = 6


def _previous_periods(current: str, count: int) -> list[str]:
    """The *count* periods ending at *current*, oldest first."""
    year, month = (int(part) for part in current.split("-"))
    periods: list[str] = []
    for _ in range(count):
        periods.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(periods))


def _bucket(data: dict) -> TaxBucket:
    return TaxBucket(**{key: data[key] for key in TaxBucket.model_fields if key in data})


def _net_liability(sales: TaxBucket, purchase: TaxBucket) -> NetLiability:
    """Output tax less input credit, per head, floored at zero.

    Floored because a head where credit exceeds liability produces a carried-
    forward balance, not a refund the business can spend — showing it as a
    negative "liability" would read as money coming back this month.
    """

    def _net(out_tax: Decimal, in_tax: Decimal) -> Decimal:
        return max(Decimal("0.00"), out_tax - in_tax)

    cgst = _net(sales.cgst, purchase.cgst)
    sgst = _net(sales.sgst, purchase.sgst)
    igst = _net(sales.igst, purchase.igst)
    cess = _net(sales.cess, purchase.cess)
    return NetLiability(cgst=cgst, sgst=sgst, igst=igst, cess=cess, total=cgst + sgst + igst + cess)


@router.get(
    "",
    response_model=DashboardOut,
    summary="Everything the landing screen shows, in one round trip",
    description=(
        "Counts are lifetime; the money is for `period` (this month by default). "
        "That split is deliberate — 'how much do I owe' is only ever a question "
        "about a filing period, while 'how many invoices do I have here' is not."
        "\n\n"
        "Also returns six months of history for the trend chart, the plan usage, "
        "the GSTR-3B due date, and a summary of the latest reconciliation for the "
        "period, so the screen needs no follow-up calls."
    ),
    dependencies=[Depends(_dashboard_limit)],
)
def get_dashboard(
    period: str | None = Query(default=None, pattern=gst_calendar.PERIOD_PATTERN),
    db: Session = Depends(get_db),
    business: Business = Depends(get_current_business),
) -> DashboardOut:
    """Everything the landing screen shows, in one round trip.

    Counts are lifetime; the money is for *period* (this month by default),
    because "how much do I owe" is only ever a question about a filing period
    while "how many invoices do I have here" is not.
    """
    period = period or invoice_service.month_of()
    scope = [Invoice.business_id == business.id, Invoice.deleted_at.is_(None)]

    # ---- Counts (lifetime, one grouped query per dimension) ----
    by_type = dict(
        db.execute(
            select(Invoice.invoice_type, func.count(Invoice.id)).where(*scope)
            .group_by(Invoice.invoice_type)
        ).all()
    )
    by_status = dict(
        db.execute(
            select(Invoice.status, func.count(Invoice.id)).where(*scope).group_by(Invoice.status)
        ).all()
    )

    def _key(value) -> str:
        return value.value if hasattr(value, "value") else str(value)

    needs_review = int(
        db.scalar(
            select(func.count(Invoice.id)).where(
                *scope,
                Invoice.status.in_((InvoiceStatus.PARSED, InvoiceStatus.FAILED)),
                (Invoice.extraction_confidence.is_(None))
                | (Invoice.extraction_confidence < REVIEW_CONFIDENCE_THRESHOLD),
            )
        )
        or 0
    )

    counts = InvoiceCounts(
        total=sum(by_type.values()),
        sales=next((c for t, c in by_type.items() if _key(t) == InvoiceType.SALES.value), 0),
        purchase=next((c for t, c in by_type.items() if _key(t) == InvoiceType.PURCHASE.value), 0),
        by_status={_key(s): int(c) for s, c in by_status.items()},
        needs_review=needs_review,
    )

    # ---- Money for the selected period ----
    summary = invoice_service.tax_summary(db, business.id, period)
    sales = _bucket(summary["sales"])
    purchase = _bucket(summary["purchase"])
    net_liability = _net_liability(sales, purchase)

    # ITC resting on invoices the supplier has not filed, from the latest
    # reconciliation for this period that finished. A failed or still-running
    # row carries zeros for every figure, and reading one here reports the risk
    # as nil — the reassuring answer, on the one screen a business checks to
    # decide whether to chase a supplier.
    last_run = reconciliation.latest_completed_run(db, business.id, period)

    # ---- History for the chart ----
    recent: list[PeriodSummary] = []
    for past in _previous_periods(period, RECENT_PERIOD_COUNT):
        past_summary = invoice_service.tax_summary(db, business.id, past)
        past_sales = _bucket(past_summary["sales"])
        past_purchase = _bucket(past_summary["purchase"])
        recent.append(
            PeriodSummary(
                period=past,
                sales=past_sales,
                purchase=past_purchase,
                net_liability=_net_liability(past_sales, past_purchase),
            )
        )

    # Outstanding, not unread. This counted PENDING and SENT alone, which made
    # reading an alert take it off the badge while the return it is about was
    # still unfiled — and hid a delivery that failed entirely. OPEN_STATUSES is
    # what the sweep and /alerts both mean by open, and the badge has to be the
    # same number as the list it links to.
    open_alerts = int(
        db.scalar(
            select(func.count(Alert.id)).where(
                Alert.business_id == business.id,
                Alert.deleted_at.is_(None),
                Alert.status.in_(OPEN_STATUSES),
            )
        )
        or 0
    )

    limit = invoice_service.plan_limit(business)
    used = invoice_service.monthly_usage(db, business.id)

    return DashboardOut(
        business_gstin=business.gstin,
        business_name=business.trade_name or business.legal_name,
        period=period,
        counts=counts,
        sales=sales,
        purchase=purchase,
        net_liability=net_liability,
        output_tax=sales.total_tax,
        input_tax_credit=purchase.total_tax,
        itc_at_risk=last_run.itc_at_risk if last_run else Decimal("0.00"),
        plan_usage=PlanUsage(
            plan=business.plan.value,
            invoices_this_month=used,
            monthly_limit=limit,
            remaining=max(0, limit - used) if limit else None,
        ),
        recent_periods=recent,
        open_alerts=open_alerts,
        next_due_date=gstr3b_due_date(period),
        last_reconciliation=(
            {
                "id": last_run.id,
                "status": last_run.status.value,
                "matched": last_run.matched_count,
                "mismatched": last_run.mismatched_count,
                "missing_in_2b": last_run.missing_in_2b_count,
                "missing_in_books": last_run.missing_in_books_count,
                "itc_eligible": str(last_run.itc_eligible),
                "itc_at_risk": str(last_run.itc_at_risk),
                "completed_at": (
                    last_run.completed_at.isoformat() if last_run.completed_at else None
                ),
            }
            if last_run
            else None
        ),
    )
