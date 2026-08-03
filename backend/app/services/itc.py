"""Input Tax Credit: what may be claimed, what must be reversed, what it settles.

Three separate questions, deliberately kept apart because they are governed by
different parts of the Act and fail in different ways:

* **How much credit is available.** Reconciliation already answers this per
  invoice — credit is capped by what the supplier declared in GSTR-2B. This
  module only pools that answer by tax head.
* **How much must be given back.** Rules 37, 42 and 43 reverse credit that was
  legitimately taken at the time and stopped being available later: because the
  supplier was never paid, because the input fed an exempt supply, or because a
  capital good's credit belongs to sixty months rather than one.
* **How the credit settles the liability.** Sections 49, 49A and 49B fix the
  order in which credit is set off against output tax. The order is not a
  preference — using the wrong head first leaves a business paying cash it did
  not need to pay while credit expires in the ledger.

The set-off is the part worth reading twice. CGST and SGST credit may never
touch each other's liability: they are levied by different governments, and the
ledger keeps them apart no matter how convenient the offset would be. IGST is
the only credit that crosses, and it must be exhausted first.

Every figure is ``Decimal``. GST is computed to the paisa, and a float cannot
hold 18% of ₹1,234.56.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import gst_calendar, reconciliation

ZERO = Decimal("0.00")

# Rule 37: credit is reversed when the supplier has not been paid within 180
# days of the invoice date. Counted from the invoice date, not the receipt date
# or the filing date — the Act ties it to the document.
RULE_37_DAYS = 180

# Invoices inside this window of the deadline are reported as approaching it,
# so a business can pay a supplier before the credit reverses rather than after.
RULE_37_WARNING_DAYS = 30

# Rule 43 spreads capital-goods credit over sixty months, starting with the
# month of purchase.
RULE_43_MONTHS = 60

# The heads, in the order every breakdown in this module reports them.
HEADS = ("igst", "cgst", "sgst", "cess")


def _q(value: Decimal) -> Decimal:
    """Round to paise, half-up — the rounding the GST rules specify."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class TaxHeads:
    """An amount split across the four tax heads."""

    igst: Decimal = ZERO
    cgst: Decimal = ZERO
    sgst: Decimal = ZERO
    cess: Decimal = ZERO

    @property
    def total(self) -> Decimal:
        return self.igst + self.cgst + self.sgst + self.cess

    def __add__(self, other: TaxHeads) -> TaxHeads:
        return TaxHeads(
            igst=self.igst + other.igst,
            cgst=self.cgst + other.cgst,
            sgst=self.sgst + other.sgst,
            cess=self.cess + other.cess,
        )

    def scaled(self, factor: Decimal) -> TaxHeads:
        """This split multiplied by *factor*, re-rounded to paise."""
        return TaxHeads(
            igst=_q(self.igst * factor),
            cgst=_q(self.cgst * factor),
            sgst=_q(self.sgst * factor),
            cess=_q(self.cess * factor),
        )

    def as_dict(self) -> dict:
        return {
            "igst": str(_q(self.igst)),
            "cgst": str(_q(self.cgst)),
            "sgst": str(_q(self.sgst)),
            "cess": str(_q(self.cess)),
            "total": str(_q(self.total)),
        }


# ---------------------------------------------------------------------------
# Section 49 / 49A / 49B — the set-off waterfall
# ---------------------------------------------------------------------------

@dataclass
class SetOffStep:
    """One application of credit from one head against one liability."""

    credit_head: str
    liability_head: str
    amount: Decimal

    def as_dict(self) -> dict:
        return {
            "credit_head": self.credit_head,
            "liability_head": self.liability_head,
            "amount": str(_q(self.amount)),
        }


@dataclass
class SetOffResult:
    """How credit settled a period's liability, and what is left on each side."""

    steps: list[SetOffStep] = field(default_factory=list)
    cash_payable: TaxHeads = field(default_factory=TaxHeads)
    credit_carried_forward: TaxHeads = field(default_factory=TaxHeads)
    credit_used: TaxHeads = field(default_factory=TaxHeads)

    @property
    def total_cash(self) -> Decimal:
        return self.cash_payable.total

    def as_dict(self) -> dict:
        return {
            "steps": [step.as_dict() for step in self.steps],
            "cash_payable": self.cash_payable.as_dict(),
            "credit_carried_forward": self.credit_carried_forward.as_dict(),
            "credit_used": self.credit_used.as_dict(),
            "total_cash": str(_q(self.total_cash)),
        }


def set_off(credit: TaxHeads, liability: TaxHeads) -> SetOffResult:
    """Apply *credit* against *liability* in the statutory order.

    The order, from s.49(5) as amended by 49A and 49B:

    1. IGST credit against IGST liability, then against CGST, then SGST. IGST
       must be exhausted before any other credit is touched — that is what 49A
       says, and it is the rule most often got wrong, because using CGST credit
       first looks equivalent and is not.
    2. CGST credit against CGST liability, then against IGST.
    3. SGST credit against SGST liability, then against IGST.
    4. Cess credit against cess liability only.

    CGST credit is never applied to SGST liability or the reverse. The two are
    levied by different governments and the ledger does not let them meet, so a
    business with CGST credit and only SGST liability pays the SGST in cash and
    carries the CGST forward. Reporting anything else would understate the cash
    a business has to find this month.

    Within step 1, IGST is spread across CGST and SGST in whatever order the
    taxpayer chooses; this applies it to CGST first, which is the portal's own
    default and keeps the answer reproducible.
    """
    remaining_credit = TaxHeads(
        igst=max(ZERO, credit.igst),
        cgst=max(ZERO, credit.cgst),
        sgst=max(ZERO, credit.sgst),
        cess=max(ZERO, credit.cess),
    )
    remaining_liability = TaxHeads(
        igst=max(ZERO, liability.igst),
        cgst=max(ZERO, liability.cgst),
        sgst=max(ZERO, liability.sgst),
        cess=max(ZERO, liability.cess),
    )
    result = SetOffResult()
    used = {head: ZERO for head in HEADS}

    def apply(credit_head: str, liability_head: str) -> None:
        available = getattr(remaining_credit, credit_head)
        owed = getattr(remaining_liability, liability_head)
        amount = min(available, owed)
        if amount <= ZERO:
            return
        setattr(remaining_credit, credit_head, available - amount)
        setattr(remaining_liability, liability_head, owed - amount)
        used[credit_head] += amount
        result.steps.append(
            SetOffStep(
                credit_head=credit_head, liability_head=liability_head, amount=_q(amount)
            )
        )

    # 1. IGST first, and completely — s.49A.
    apply("igst", "igst")
    apply("igst", "cgst")
    apply("igst", "sgst")
    # 2 and 3. Own head first, then IGST. Never each other's.
    apply("cgst", "cgst")
    apply("cgst", "igst")
    apply("sgst", "sgst")
    apply("sgst", "igst")
    # 4. Cess is ring-fenced.
    apply("cess", "cess")

    result.cash_payable = TaxHeads(
        igst=_q(remaining_liability.igst),
        cgst=_q(remaining_liability.cgst),
        sgst=_q(remaining_liability.sgst),
        cess=_q(remaining_liability.cess),
    )
    result.credit_carried_forward = TaxHeads(
        igst=_q(remaining_credit.igst),
        cgst=_q(remaining_credit.cgst),
        sgst=_q(remaining_credit.sgst),
        cess=_q(remaining_credit.cess),
    )
    result.credit_used = TaxHeads(
        igst=_q(used["igst"]),
        cgst=_q(used["cgst"]),
        sgst=_q(used["sgst"]),
        cess=_q(used["cess"]),
    )
    return result


# ---------------------------------------------------------------------------
# Rule 37 — credit on invoices left unpaid past 180 days
# ---------------------------------------------------------------------------

@dataclass
class Rule37Item:
    """One unpaid purchase, and where it stands against the 180-day clock."""

    invoice_id: int
    invoice_number: str | None
    supplier_gstin: str | None
    supplier_name: str | None
    invoice_date: date | None
    days_outstanding: int | None
    days_remaining: int | None
    tax: TaxHeads
    overdue: bool

    def as_dict(self) -> dict:
        return {
            "invoice_id": self.invoice_id,
            "invoice_number": self.invoice_number,
            "supplier_gstin": self.supplier_gstin,
            "supplier_name": self.supplier_name,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "days_outstanding": self.days_outstanding,
            "days_remaining": self.days_remaining,
            "tax": self.tax.as_dict(),
            "overdue": self.overdue,
        }


@dataclass
class Rule37Result:
    """Credit that has reversed, and credit about to."""

    overdue: list[Rule37Item] = field(default_factory=list)
    approaching: list[Rule37Item] = field(default_factory=list)
    reversal: TaxHeads = field(default_factory=TaxHeads)
    approaching_amount: TaxHeads = field(default_factory=TaxHeads)

    def as_dict(self) -> dict:
        return {
            "overdue": [item.as_dict() for item in self.overdue],
            "approaching": [item.as_dict() for item in self.approaching],
            "reversal": self.reversal.as_dict(),
            "approaching_amount": self.approaching_amount.as_dict(),
            "days": RULE_37_DAYS,
            "warning_days": RULE_37_WARNING_DAYS,
        }


def _invoice_tax(invoice: Invoice) -> TaxHeads:
    return TaxHeads(
        igst=invoice.igst or ZERO,
        cgst=invoice.cgst or ZERO,
        sgst=invoice.sgst or ZERO,
        cess=invoice.cess or ZERO,
    )


def rule_37(invoices: list[Invoice], *, as_of: date | None = None) -> Rule37Result:
    """Credit exposed by non-payment, from a list of purchase invoices.

    Pure: takes rows, returns an answer. An invoice counts when it is unpaid
    (``paid_at`` is None) and claims credit at all — a blocked-credit or
    reverse-charge purchase has no credit to reverse, and reporting one would
    send a business chasing a payment for no tax reason.

    An invoice with no date is skipped rather than assumed overdue. The clock
    runs from the invoice date, and a missing date means the extraction failed,
    not that 180 days have passed.

    The 180 days are counted in Indian calendar days, because that is the
    calendar the invoice date is written in and the one the Act is enforced in.
    Reading the day off a UTC clock is a day short for the five and a half
    hours after midnight IST, and the invoice that crosses day 180 in that
    window is reported as still inside it — which understates the reversal in
    GSTR-3B, and an understated reversal is over-claimed credit with interest
    on it.
    """
    today = as_of or gst_calendar.today_ist()
    result = Rule37Result()

    for invoice in invoices:
        if invoice.paid_at is not None:
            continue
        if not invoice.itc_eligible or invoice.reverse_charge:
            continue
        if invoice.invoice_date is None:
            continue

        tax = _invoice_tax(invoice)
        if tax.total <= ZERO:
            continue

        outstanding = (today - invoice.invoice_date).days
        remaining = RULE_37_DAYS - outstanding
        item = Rule37Item(
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            supplier_gstin=invoice.counterparty_gstin,
            supplier_name=invoice.counterparty_name,
            invoice_date=invoice.invoice_date,
            days_outstanding=outstanding,
            days_remaining=remaining,
            tax=tax,
            overdue=remaining < 0,
        )
        # Strictly past the 180th day: the Act allows the whole of day 180, so
        # an invoice exactly 180 days old has not yet reversed.
        if remaining < 0:
            result.overdue.append(item)
            result.reversal = result.reversal + tax
        elif remaining <= RULE_37_WARNING_DAYS:
            result.approaching.append(item)
            result.approaching_amount = result.approaching_amount + tax

    result.overdue.sort(key=lambda i: i.days_outstanding or 0, reverse=True)
    result.approaching.sort(key=lambda i: i.days_remaining or 0)
    return result


# ---------------------------------------------------------------------------
# Rules 42 and 43 — proportionate reversal on exempt supplies
# ---------------------------------------------------------------------------

@dataclass
class ProportionateResult:
    """The common-credit reversal for one period, under Rules 42 and 43."""

    exempt_turnover: Decimal = ZERO
    total_turnover: Decimal = ZERO
    exempt_ratio: Decimal = ZERO
    common_credit: TaxHeads = field(default_factory=TaxHeads)
    rule_42_reversal: TaxHeads = field(default_factory=TaxHeads)
    capital_credit: TaxHeads = field(default_factory=TaxHeads)
    capital_credit_this_month: TaxHeads = field(default_factory=TaxHeads)
    rule_43_reversal: TaxHeads = field(default_factory=TaxHeads)

    @property
    def total_reversal(self) -> TaxHeads:
        return self.rule_42_reversal + self.rule_43_reversal

    def as_dict(self) -> dict:
        return {
            "exempt_turnover": str(_q(self.exempt_turnover)),
            "total_turnover": str(_q(self.total_turnover)),
            "exempt_ratio": str(self.exempt_ratio.quantize(Decimal("0.000001"))),
            "common_credit": self.common_credit.as_dict(),
            "rule_42_reversal": self.rule_42_reversal.as_dict(),
            "capital_credit": self.capital_credit.as_dict(),
            "capital_credit_this_month": self.capital_credit_this_month.as_dict(),
            "rule_43_reversal": self.rule_43_reversal.as_dict(),
            "total_reversal": self.total_reversal.as_dict(),
            "capital_months": RULE_43_MONTHS,
        }


def proportionate_reversal(
    *,
    common_credit: TaxHeads,
    capital_credit: TaxHeads,
    exempt_turnover: Decimal,
    total_turnover: Decimal,
) -> ProportionateResult:
    """Rules 42 and 43: the share of common credit that fed exempt supplies.

    Rule 42 covers inputs and input services. The reversible share is

        D1 = (E / F) x C2

    where ``E`` is exempt turnover, ``F`` is total turnover, and ``C2`` is the
    common credit — credit on purchases used for both taxable and exempt
    supplies. Credit attributable *exclusively* to exempt supplies is not
    common credit at all; it was never available, and it should never have been
    included in ``common_credit`` by the caller.

    Rule 43 does the same for capital goods, except that the credit is spread
    over sixty months first: only ``Tm = Tc / 60`` belongs to this month, and
    the exempt share of that is what reverses.

    A zero total turnover gives a zero ratio rather than a division error. A
    period with no outward supply at all has no exempt proportion to compute,
    and guessing one would reverse credit on no evidence.
    """
    exempt = max(ZERO, exempt_turnover)
    total = max(ZERO, total_turnover)
    # Exempt turnover cannot exceed total turnover; if a caller passes figures
    # that say otherwise, cap the ratio at 1 rather than reversing more credit
    # than exists.
    ratio = min(Decimal("1"), exempt / total) if total > ZERO else Decimal("0")

    monthly_capital = capital_credit.scaled(Decimal("1") / Decimal(RULE_43_MONTHS))

    return ProportionateResult(
        exempt_turnover=exempt,
        total_turnover=total,
        exempt_ratio=ratio,
        common_credit=common_credit,
        rule_42_reversal=common_credit.scaled(ratio),
        capital_credit=capital_credit,
        capital_credit_this_month=monthly_capital,
        rule_43_reversal=monthly_capital.scaled(ratio),
    )


# ---------------------------------------------------------------------------
# The period summary the API serves
# ---------------------------------------------------------------------------

@dataclass
class ITCSummary:
    """Everything the ITC screen shows for one period."""

    period: str
    available: TaxHeads
    output_tax: TaxHeads
    rule_37: Rule37Result
    proportionate: ProportionateResult
    net_available: TaxHeads
    set_off: SetOffResult
    itc_at_risk: Decimal
    reconciled: bool
    invoice_count: int
    unclaimed_count: int

    def as_dict(self) -> dict:
        return {
            "period": self.period,
            "available": self.available.as_dict(),
            "output_tax": self.output_tax.as_dict(),
            "rule_37": self.rule_37.as_dict(),
            "proportionate": self.proportionate.as_dict(),
            "total_reversal": (
                self.rule_37.reversal + self.proportionate.total_reversal
            ).as_dict(),
            "net_available": self.net_available.as_dict(),
            "set_off": self.set_off.as_dict(),
            "itc_at_risk": str(_q(self.itc_at_risk)),
            "reconciled": self.reconciled,
            "invoice_count": self.invoice_count,
            "unclaimed_count": self.unclaimed_count,
        }


def _purchases(db: Session, business_id: int, period: str | None = None) -> list[Invoice]:
    """Purchase invoices that could carry credit, oldest first."""
    conditions = [
        Invoice.business_id == business_id,
        Invoice.deleted_at.is_(None),
        Invoice.invoice_type == InvoiceType.PURCHASE,
        Invoice.status != InvoiceStatus.FAILED,
    ]
    if period:
        conditions.append(Invoice.period == period)
    return list(
        db.scalars(
            select(Invoice)
            .where(*conditions)
            .order_by(Invoice.invoice_date.asc(), Invoice.id.asc())
        ).all()
    )


def purchase_invoices(
    db: Session, business_id: int, period: str | None = None
) -> list[Invoice]:
    """Purchase invoices that could carry credit, oldest first.

    Public because Rule 37 is asked of the whole register from the router, not
    just of the period under review.
    """
    return _purchases(db, business_id, period)


def _outward_tax(db: Session, business_id: int, period: str) -> TaxHeads:
    """Output tax declared on sales invoices for *period*.

    Failed extractions are excluded, because GSTR-1 excludes them: ``filing``
    leaves a failed row out of the return entirely. Counting it here and not
    there makes the ITC screen quote an output tax the 3B it produces will not
    contain, and the difference lands on the cash the business is told to pay.
    A re-parse is where this bites — the figures from the first, successful
    read stay on the row after a later attempt fails.
    """
    row = db.execute(
        select(
            func.coalesce(func.sum(Invoice.igst), 0),
            func.coalesce(func.sum(Invoice.cgst), 0),
            func.coalesce(func.sum(Invoice.sgst), 0),
            func.coalesce(func.sum(Invoice.cess), 0),
        ).where(
            Invoice.business_id == business_id,
            Invoice.deleted_at.is_(None),
            Invoice.invoice_type == InvoiceType.SALES,
            Invoice.period == period,
            Invoice.status != InvoiceStatus.FAILED,
        )
    ).one()
    return TaxHeads(
        igst=Decimal(str(row[0])),
        cgst=Decimal(str(row[1])),
        sgst=Decimal(str(row[2])),
        cess=Decimal(str(row[3])),
    )


def turnover_split(db: Session, business_id: int, period: str) -> tuple[Decimal, Decimal]:
    """``(exempt_turnover, total_turnover)`` for *period*, from sales invoices.

    A sale is treated as exempt when it carries taxable value but no tax at
    all. That is what a nil-rated or exempt supply looks like in the books, and
    it is the best evidence the product has without asking a business to
    classify every line by hand — the caller can override both figures when
    they know better.

    Failed extractions are excluded for the same reason as ``_outward_tax``,
    and one worse: a row whose tax fields were never read has no tax, so it
    would be counted as an *exempt* supply and inflate the Rule 42 ratio —
    reversing credit on the strength of an extraction that failed.
    """
    rows = db.execute(
        select(
            Invoice.taxable_value,
            Invoice.igst,
            Invoice.cgst,
            Invoice.sgst,
            Invoice.cess,
        ).where(
            Invoice.business_id == business_id,
            Invoice.deleted_at.is_(None),
            Invoice.invoice_type == InvoiceType.SALES,
            Invoice.period == period,
            Invoice.status != InvoiceStatus.FAILED,
        )
    ).all()

    exempt = ZERO
    total = ZERO
    for taxable_value, igst, cgst, sgst, cess in rows:
        taxable_value = Decimal(str(taxable_value or 0))
        tax = sum(
            (Decimal(str(value or 0)) for value in (igst, cgst, sgst, cess)), ZERO
        )
        total += taxable_value
        if tax == ZERO and taxable_value > ZERO:
            exempt += taxable_value
    return exempt, total


def summarise(
    db: Session,
    business_id: int,
    period: str,
    *,
    as_of: date | None = None,
    exempt_turnover: Decimal | None = None,
    total_turnover: Decimal | None = None,
) -> ITCSummary:
    """The full ITC position for *period*.

    Credit availability comes from the latest reconciliation *that finished*,
    because only the 2B knows what a supplier actually declared. Without one the
    books are all there is, so the figure is what has been *claimed* rather than
    what is safe — the ``reconciled`` flag says which, and the caller is
    expected to say so on screen. Presenting an unreconciled total as "eligible"
    is exactly the overstatement that produces a reversal with interest.

    A run that failed or is still running is not a reconciliation for this
    purpose, however recent it is: its figures are column defaults, and reading
    them here caps the period's credit at zero. See
    :func:`~app.services.reconciliation.latest_completed_run`.

    Rule 37 deliberately looks at the whole purchase register, not just this
    period: an invoice from eight months ago is the one that crosses 180 days,
    and scoping it to the period under review would never show it.
    """
    period_purchases = _purchases(db, business_id, period)
    all_purchases = _purchases(db, business_id)

    last_run = reconciliation.latest_completed_run(db, business_id, period)

    # Claimable credit by head, from the books. Capital goods are excluded from
    # the input pool: their credit belongs to Rule 43's sixty months.
    available = TaxHeads()
    capital_credit = TaxHeads()
    unclaimed = 0
    for invoice in period_purchases:
        if not invoice.itc_eligible or invoice.reverse_charge:
            unclaimed += 1
            continue
        tax = _invoice_tax(invoice)
        if invoice.is_capital_good:
            capital_credit = capital_credit + tax
        else:
            available = available + tax

    # Where a reconciliation exists, cap the pool at what it found eligible.
    # The run reports one total rather than a per-head split, so scale the
    # book split down by the same proportion rather than inventing a shape the
    # evidence does not have.
    if last_run is not None and available.total > ZERO:
        eligible_total = last_run.itc_eligible or ZERO
        if eligible_total < available.total:
            available = available.scaled(eligible_total / available.total)

    rule_37_result = rule_37(all_purchases, as_of=as_of)

    exempt, total = turnover_split(db, business_id, period)
    if exempt_turnover is not None:
        exempt = exempt_turnover
    if total_turnover is not None:
        total = total_turnover
    proportionate = proportionate_reversal(
        common_credit=available,
        capital_credit=capital_credit,
        exempt_turnover=exempt,
        total_turnover=total,
    )

    # What is left after every reversal, floored at zero per head: a reversal
    # larger than the period's credit produces a liability, not negative credit.
    reversal = rule_37_result.reversal + proportionate.total_reversal
    net_available = TaxHeads(
        igst=max(ZERO, available.igst + proportionate.capital_credit_this_month.igst
                 - reversal.igst),
        cgst=max(ZERO, available.cgst + proportionate.capital_credit_this_month.cgst
                 - reversal.cgst),
        sgst=max(ZERO, available.sgst + proportionate.capital_credit_this_month.sgst
                 - reversal.sgst),
        cess=max(ZERO, available.cess + proportionate.capital_credit_this_month.cess
                 - reversal.cess),
    )

    output_tax = _outward_tax(db, business_id, period)

    return ITCSummary(
        period=period,
        available=available,
        output_tax=output_tax,
        rule_37=rule_37_result,
        proportionate=proportionate,
        net_available=net_available,
        set_off=set_off(net_available, output_tax),
        itc_at_risk=(last_run.itc_at_risk if last_run else ZERO) or ZERO,
        reconciled=last_run is not None,
        invoice_count=len(period_purchases),
        unclaimed_count=unclaimed,
    )


def rule_37_due_date(invoice_date: date) -> date:
    """The day after which credit on an invoice dated *invoice_date* reverses."""
    return invoice_date + timedelta(days=RULE_37_DAYS)
