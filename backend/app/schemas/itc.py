"""Request/response models for the ITC position and its reversals."""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.mixins import MONEY_MAX


class TaxHeadsOut(BaseModel):
    """An amount split across the four heads.

    Serialised as strings, like every other money figure in this API: the
    browser must not put a rupee value through a JavaScript float on its way
    to the screen.
    """

    model_config = ConfigDict(from_attributes=True)

    igst: str
    cgst: str
    sgst: str
    cess: str
    total: str


class SetOffStepOut(BaseModel):
    credit_head: str
    liability_head: str
    amount: str


class SetOffOut(BaseModel):
    """How credit settled the liability, step by step."""

    steps: list[SetOffStepOut]
    cash_payable: TaxHeadsOut
    credit_carried_forward: TaxHeadsOut
    credit_used: TaxHeadsOut
    total_cash: str


class Rule37ItemOut(BaseModel):
    invoice_id: int
    invoice_number: str | None = None
    supplier_gstin: str | None = None
    supplier_name: str | None = None
    invoice_date: str | None = None
    days_outstanding: int | None = None
    days_remaining: int | None = None
    tax: TaxHeadsOut
    overdue: bool


class Rule37Out(BaseModel):
    """Credit reversed by non-payment, and credit about to be."""

    overdue: list[Rule37ItemOut]
    approaching: list[Rule37ItemOut]
    reversal: TaxHeadsOut
    approaching_amount: TaxHeadsOut
    days: int
    warning_days: int


class ProportionateOut(BaseModel):
    """Rules 42 and 43: the exempt share of common and capital credit."""

    exempt_turnover: str
    total_turnover: str
    exempt_ratio: str
    common_credit: TaxHeadsOut
    rule_42_reversal: TaxHeadsOut
    capital_credit: TaxHeadsOut
    capital_credit_this_month: TaxHeadsOut
    rule_43_reversal: TaxHeadsOut
    total_reversal: TaxHeadsOut
    capital_months: int


class ITCSummaryOut(BaseModel):
    """The whole ITC position for one period."""

    period: str
    available: TaxHeadsOut
    output_tax: TaxHeadsOut
    rule_37: Rule37Out
    # ``rule_37.reversal`` is the standing exposure across the whole purchase
    # register — every rupee resting on an invoice past its 180 days, whenever
    # it lapsed. This is the slice of it that lapsed *in* this period, and so
    # the only part this period's return gives back: Rule 37 is paid once, in
    # the return for the month the clock ran out, and re-availed on payment.
    rule_37_reversal: TaxHeadsOut
    proportionate: ProportionateOut
    total_reversal: TaxHeadsOut
    net_available: TaxHeadsOut
    set_off: SetOffOut
    itc_at_risk: str
    # False when no reconciliation has been run for the period, in which case
    # ``available`` is what the books claim rather than what the 2B supports.
    # The screen is expected to say so — presenting an unreconciled figure as
    # eligible is the overstatement that produces a reversal with interest.
    reconciled: bool
    invoice_count: int
    unclaimed_count: int


class SetOffRequest(BaseModel):
    """Ask what a given credit and liability would settle to.

    Exposed separately from the period summary so a CA can try a what-if
    against figures that are not in the books yet.
    """

    # Bounded above as well as below: the waterfall subtracts these and
    # quantizes the result to paise, and a figure wider than a money column can
    # hold takes ``quantize`` past the decimal context and raises. A what-if is
    # the one place a caller is expected to type a number nothing validated
    # upstream, so it is the one place that has to say no to it.
    credit_igst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    credit_cgst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    credit_sgst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    credit_cess: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    liability_igst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    liability_cgst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    liability_sgst: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
    liability_cess: Decimal = Field(default=Decimal("0"), ge=0, le=MONEY_MAX)
