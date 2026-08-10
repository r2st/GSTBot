"""s.16(4) — the day unclaimed input credit stops being claimable.

Every other reversal this product computes is recoverable. Rule 37 gives the
credit back the moment the supplier is paid; Rules 42 and 43 apportion it
rather than destroy it. s.16(4) is the one that does not: credit on an invoice
that was never taken into a return by the 30th of November following its
financial year is not deferred, it is extinguished, and no later filing brings
it back.

That makes it the largest single source of the "ITC leakage" this product
exists to prevent, and the hardest to notice unaided — an April invoice has
nineteen months of runway, during which nothing about it looks wrong. It is
absent from the reconciliation's mismatch list because it matches nothing, it
is absent from Rule 37 because it was never claimed to begin with, and it is
absent from the period's ITC summary because that summary is about the period,
not about the invoice's fate. Nothing else here would ever have raised it.

**What "unclaimed" means.** Credit reaches a return through GSTR-3B table 4(A),
so an invoice's credit has been taken when the GSTR-3B for the invoice's period
is recorded as filed, and not before. That is the same test the deadline
alerting applies to a period, and it is deliberately the recorded filing rather
than anything inferred from the invoice row: an invoice carries no "claimed"
column and inventing one from status would make MATCHED mean claimed, which it
does not — matching says the supplier declared it, not that the buyer took it.

The consequence is that this tracks the product's own record of filing. A
business that files on the portal and does not record it here has its credit
counted as at risk. That is the safe direction to be wrong in, and it is the
direction the whole alerting module already errs in; the wording says what to
do about it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.gstr_return import ReturnType
from app.models.invoice import Invoice
from app.services import filing as filing_service
from app.services import gst_calendar
from app.services.itc import TaxHeads, purchase_invoices

# How far ahead the exposure is worth surfacing. Sixty days rather than the
# seven a filing deadline gets, because the two deadlines ask for different
# things. A filing deadline asks a business to file a return they already have
# the data for; this asks them to find invoices they have lost, chase suppliers
# who never declared them, and get a return amended — none of which happens in
# a week, and all of which is impossible the day after.
LEAD_DAYS = 60

# ...and the point at which two months of runway has become two weeks.
URGENT_DAYS = 15


@dataclass(frozen=True)
class LapsingCredit:
    """The unclaimed credit of one financial year, and how long it has left.

    One row per financial year rather than per invoice: the deadline is a
    property of the year, every invoice inside it shares the same date, and a
    business with four hundred unclaimed purchases wants one number and a date,
    not four hundred alerts.
    """

    financial_year: str
    deadline: date
    days_remaining: int
    tax: TaxHeads
    invoice_count: int
    # The periods inside this financial year whose GSTR-3B is not recorded
    # filed. This is the actionable half — "file these and the credit is
    # safe" — and without it the alert names a problem with no next step.
    periods: tuple[str, ...]

    @property
    def expired(self) -> bool:
        """Whether the deadline has passed and this credit is gone for good."""
        return self.days_remaining < 0

    @property
    def total(self) -> Decimal:
        return self.tax.total

    def as_dict(self) -> dict:
        return {
            "financial_year": self.financial_year,
            "deadline": self.deadline.isoformat(),
            "days_remaining": self.days_remaining,
            "expired": self.expired,
            "tax": self.tax.as_dict(),
            "invoice_count": self.invoice_count,
            "periods": list(self.periods),
        }


def _claimable(invoice: Invoice) -> bool:
    """Whether s.16(4) has anything to say about this purchase.

    Three exclusions, each for a different reason:

    *Ineligible credit* was never claimable, so it cannot lapse. An invoice
    blocked under s.17(5) loses nothing on 30 November because it had nothing.

    *Reverse charge* is excluded because the document s.16(4) runs against is
    not this one. The recipient's own invoice under s.31(3)(f) is what carries
    the credit, its date is what the financial year is taken from, and this
    application does not hold it — so the deadline computed from the supplier's
    date would be a date about the wrong document. Guessing is worse than being
    silent: the guess is wrong by up to a year in the direction that reports a
    live credit as expired.

    *No invoice date* leaves no financial year to derive, and therefore no
    deadline. These rows are already visible as unparsed elsewhere; inventing a
    deadline from ``created_at`` would attach a real, alarming date to a field
    nobody extracted.

    Capital goods are deliberately *not* excluded, which is the one place this
    disagrees with :func:`~app.services.itc.summarise`. That function keeps them
    out of the input pool because Rule 43 spreads their credit over sixty
    months. s.16(4) is a different question — it bounds when the credit may
    first be *taken*, not how it is then apportioned — and a machine bought in
    April is exactly the invoice whose credit is large enough to be worth
    losing.
    """
    return (
        invoice.itc_eligible
        and not invoice.reverse_charge
        and invoice.invoice_date is not None
    )


def _period_of(invoice: Invoice) -> str:
    """The period whose GSTR-3B would have carried this invoice's credit.

    The stored column where there is one, and the invoice date's month where
    there is not. Deriving rather than skipping matters: a row whose ``period``
    was never populated still belongs to a month, and treating it as
    unattributable would count it as permanently unclaimed no matter how many
    returns the business filed — an alert that cannot be cleared by doing the
    thing it asks for.
    """
    return invoice.period or gst_calendar.period_of(invoice.invoice_date)


def lapsing_credit(
    db: Session,
    business_id: int,
    *,
    as_of: date | None = None,
    since_period: str | None = None,
) -> list[LapsingCredit]:
    """Unclaimed credit by financial year, soonest deadline first.

    Every financial year with unclaimed credit is returned, including ones
    whose deadline has already passed — a lapsed year is the most important
    thing on this list, not the least, and dropping it would let a permanent
    loss disappear from the screen the morning after it happened.

    Years with nothing unclaimed are absent rather than present with zeros, so
    the empty list means "nothing at risk" and a caller can say so.

    *since_period* is the earliest period this answer is allowed to be about,
    and exists for one caller: the alerting, which must not tell a business
    signed up last week that credit lapsed in a year the product has no filing
    record for. Everything here is measured against *recorded* filings, so a
    period from before the business arrived has no record for the same reason
    it has no invoices — and "you have lost ₹4 lakh" is the worst possible
    thing to be wrong about on day one. The ITC screen passes nothing and sees
    the whole register, because there the business is asking rather than being
    interrupted.
    """
    today = as_of or gst_calendar.today_ist()

    invoices = [
        invoice
        for invoice in purchase_invoices(db, business_id)
        if _claimable(invoice)
        and (since_period is None or _period_of(invoice) >= since_period)
    ]
    if not invoices:
        return []

    # One query for the whole register rather than one per period. The periods
    # asked about are only those actually carrying credit, so a business with
    # two unclaimed months does not fetch six years of filing history.
    periods = {_period_of(invoice) for invoice in invoices}
    filed = filing_service.filed_returns(db, business_id, sorted(periods))

    years: dict[str, dict] = {}
    for invoice in invoices:
        period = _period_of(invoice)
        if (period, ReturnType.GSTR3B) in filed:
            continue

        year = gst_calendar.financial_year(invoice.invoice_date)
        bucket = years.setdefault(
            year,
            {
                "deadline": gst_calendar.itc_claim_deadline(invoice.invoice_date),
                "tax": TaxHeads(),
                "count": 0,
                "periods": set(),
            },
        )
        bucket["tax"] = bucket["tax"] + TaxHeads(
            igst=invoice.igst,
            cgst=invoice.cgst,
            sgst=invoice.sgst,
            cess=invoice.cess,
        )
        bucket["count"] += 1
        bucket["periods"].add(period)

    return sorted(
        (
            LapsingCredit(
                financial_year=year,
                deadline=bucket["deadline"],
                days_remaining=(bucket["deadline"] - today).days,
                tax=bucket["tax"],
                invoice_count=bucket["count"],
                periods=tuple(sorted(bucket["periods"])),
            )
            for year, bucket in years.items()
        ),
        key=lambda row: row.deadline,
    )


def at_risk(
    db: Session,
    business_id: int,
    *,
    as_of: date | None = None,
    since_period: str | None = None,
) -> list[LapsingCredit]:
    """The subset of :func:`lapsing_credit` worth telling someone about today.

    Inside the lead window, or already past the deadline. Kept separate from
    the full list because the two have different audiences: the ITC screen
    shows everything unclaimed so a business can see the shape of it, and the
    alerting is only allowed to interrupt about the part that is nearly gone.
    """
    return [
        row
        for row in lapsing_credit(
            db, business_id, as_of=as_of, since_period=since_period
        )
        if row.days_remaining <= LEAD_DAYS
    ]
