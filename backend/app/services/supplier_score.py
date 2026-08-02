"""Supplier health: how much of a supplier's paperwork can be relied on.

The score answers a question with money attached — *how much of the credit
resting on this supplier should be provided against?* — so it is built from
observed filing behaviour rather than from a rating anyone assigns by hand.

Four components, weighted by how strongly each predicts a credit actually
surviving to be claimed:

======================  ======  ==================================================
Component               Weight  What it measures
======================  ======  ==================================================
Match rate               50%    Of this supplier's invoices, how many appeared in
                                GSTR-2B with the same figures. The single best
                                predictor: a supplier who files correctly keeps
                                filing correctly.
Filing timeliness        20%    Whether they file by the 11th, or two months late.
                                A late filer's credit arrives eventually — but not
                                in the period the buyer wanted to claim it.
Consistency              20%    Whether behaviour holds period to period. A
                                supplier who alternates between perfect and absent
                                is a worse risk than a steady 80%, and an average
                                hides that completely.
Recency                  10%    Whether they have filed lately at all. A supplier
                                last seen four periods ago is drifting toward
                                having deregistered.
======================  ======  ==================================================

Two deliberate refusals:

* **A supplier with no history is not scored.** ``None`` and a low score mean
  different things — "we have no evidence" and "the evidence is bad" — and
  collapsing them would have a business provisioning against a supplier they
  have simply not bought from yet.
* **The score is per-tenant.** The same GSTIN can be reliable to one buyer and
  a chronic late filer to another, and the product has no authority to publish
  a shared reputation.

Confidence is reported alongside the score, because three invoices and three
hundred do not support the same conclusion, and the provisioning recommendation
is deliberately gentler when the evidence is thin.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.supplier import RiskLevel, Supplier

ZERO = Decimal("0.00")

# Component weights. They sum to 100; a component with no evidence is dropped
# and the rest are renormalised, so a supplier with matches but no filing dates
# is still scored on what is known rather than penalised for what is not.
WEIGHT_MATCH_RATE = Decimal("50")
WEIGHT_TIMELINESS = Decimal("20")
WEIGHT_CONSISTENCY = Decimal("20")
WEIGHT_RECENCY = Decimal("10")

# A mismatch is a data problem — the invoice exists and the credit is mostly
# recoverable once someone reconciles the figures. A missing invoice is the
# supplier not having filed, and scores nothing.
MISMATCH_CREDIT = Decimal("0.5")

# Filing this many days past the due date scores zero for timeliness. Set at a
# full period: a supplier who is a month late has already cost the buyer the
# claim they wanted to make.
TIMELINESS_ZERO_AT_DAYS = 30

# Periods of silence before recency is exhausted.
RECENCY_ZERO_AT_PERIODS = 6

# Invoices observed before the score is treated as fully supported. Below this,
# confidence scales linearly and provisioning is softened toward the default.
FULL_CONFIDENCE_INVOICES = 20

# Score thresholds for the risk bands.
LOW_RISK_AT = 85
MEDIUM_RISK_AT = 60


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class Component:
    """One scored dimension, kept so the number can be explained."""

    name: str
    score: Decimal | None  # 0-100, or None when there is no evidence.
    weight: Decimal
    detail: str

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "score": None if self.score is None else float(_q(self.score)),
            "weight": float(self.weight),
            "detail": self.detail,
        }


@dataclass
class Observation:
    """What one period showed about one supplier."""

    period: str
    matched: int = 0
    mismatched: int = 0
    missing: int = 0
    # Days between the GSTR-1 due date and when the supplier actually filed.
    # Negative is early, None is unknown.
    filing_delay_days: int | None = None

    @property
    def total(self) -> int:
        return self.matched + self.mismatched + self.missing

    @property
    def match_rate(self) -> Decimal | None:
        """Weighted share of this period's invoices that survived matching."""
        if self.total == 0:
            return None
        weighted = Decimal(self.matched) + MISMATCH_CREDIT * Decimal(self.mismatched)
        return weighted / Decimal(self.total) * Decimal("100")

    def as_dict(self) -> dict:
        return {
            "period": self.period,
            "matched": self.matched,
            "mismatched": self.mismatched,
            "missing": self.missing,
            "filing_delay_days": self.filing_delay_days,
        }


@dataclass
class SupplierScore:
    """A supplier's health, with the working shown."""

    gstin: str
    score: int | None
    risk_level: RiskLevel
    confidence: Decimal  # 0-1.
    components: list[Component] = field(default_factory=list)
    observations: list[Observation] = field(default_factory=list)
    invoices_observed: int = 0
    periods_observed: int = 0
    recommended_provision_pct: Decimal = ZERO
    recommendation: str = ""

    def as_dict(self) -> dict:
        return {
            "gstin": self.gstin,
            "score": self.score,
            "risk_level": self.risk_level.value,
            "confidence": float(self.confidence.quantize(Decimal("0.01"))),
            "components": [component.as_dict() for component in self.components],
            "observations": [observation.as_dict() for observation in self.observations],
            "invoices_observed": self.invoices_observed,
            "periods_observed": self.periods_observed,
            "recommended_provision_pct": float(_q(self.recommended_provision_pct)),
            "recommendation": self.recommendation,
        }


def _periods_between(earlier: str, later: str) -> int:
    """Whole months from *earlier* to *later*, both ``YYYY-MM``."""
    ey, em = (int(part) for part in earlier.split("-"))
    ly, lm = (int(part) for part in later.split("-"))
    return (ly - ey) * 12 + (lm - em)


def _match_rate_component(observations: list[Observation]) -> Component:
    """Share of all observed invoices that matched, pooled across periods.

    Pooled rather than averaged per period: a period with one invoice and a
    period with two hundred are not equal evidence, and averaging their rates
    would let a single bad month with one invoice outweigh a good year.
    """
    total = sum(o.total for o in observations)
    if total == 0:
        return Component("match_rate", None, WEIGHT_MATCH_RATE, "No invoices observed")

    matched = sum(o.matched for o in observations)
    mismatched = sum(o.mismatched for o in observations)
    missing = sum(o.missing for o in observations)
    weighted = Decimal(matched) + MISMATCH_CREDIT * Decimal(mismatched)
    score = weighted / Decimal(total) * Decimal("100")
    return Component(
        "match_rate",
        score,
        WEIGHT_MATCH_RATE,
        f"{matched} matched, {mismatched} mismatched, {missing} never filed, of {total}",
    )


def _timeliness_component(observations: list[Observation]) -> Component:
    """How close to the due date the supplier files, on average.

    On or before the due date scores 100; a full period late scores 0; in
    between it falls off linearly. Filing early earns nothing extra — the
    buyer's claim is not improved by it.
    """
    delays = [o.filing_delay_days for o in observations if o.filing_delay_days is not None]
    if not delays:
        return Component("timeliness", None, WEIGHT_TIMELINESS, "No filing dates observed")

    average = Decimal(sum(delays)) / Decimal(len(delays))
    if average <= 0:
        score = Decimal("100")
    elif average >= TIMELINESS_ZERO_AT_DAYS:
        score = ZERO
    else:
        score = (
            Decimal("100")
            * (Decimal(TIMELINESS_ZERO_AT_DAYS) - average)
            / Decimal(TIMELINESS_ZERO_AT_DAYS)
        )

    days = float(_q(average))
    detail = (
        f"Files {abs(days):.0f} days {'late' if days > 0 else 'early'} on average"
        if days
        else "Files on the due date"
    )
    return Component("timeliness", score, WEIGHT_TIMELINESS, detail)


def _consistency_component(observations: list[Observation]) -> Component:
    """Whether the match rate holds steady from period to period.

    Scored from the standard deviation of the per-period match rate: a steady
    80% is a supplier a business can plan around, while alternating 100% and
    40% averages the same and is not. Needs at least two periods; one period is
    a point, not a trend.
    """
    rates = [o.match_rate for o in observations if o.match_rate is not None]
    if len(rates) < 2:
        return Component(
            "consistency", None, WEIGHT_CONSISTENCY, "Needs two periods of history"
        )

    spread = Decimal(str(statistics.pstdev([float(rate) for rate in rates])))
    # A standard deviation of 50 points or more is as inconsistent as this
    # measure distinguishes; everything above scores zero.
    score = max(ZERO, Decimal("100") - spread * Decimal("2"))
    return Component(
        "consistency",
        score,
        WEIGHT_CONSISTENCY,
        f"Match rate varies by {float(_q(spread)):.0f} points across {len(rates)} periods",
    )


def _recency_component(observations: list[Observation], as_of_period: str) -> Component:
    """How recently the supplier was last seen filing anything.

    A supplier who has filed nothing for six periods scores zero: at that point
    the likeliest explanations are that they have stopped trading or had their
    registration cancelled, and either one puts the credit at risk.
    """
    filed = [o.period for o in observations if o.matched or o.mismatched]
    if not filed:
        return Component("recency", None, WEIGHT_RECENCY, "Never seen filing")

    gap = max(0, _periods_between(max(filed), as_of_period))
    if gap >= RECENCY_ZERO_AT_PERIODS:
        score = ZERO
    else:
        score = (
            Decimal("100")
            * (Decimal(RECENCY_ZERO_AT_PERIODS) - Decimal(gap))
            / Decimal(RECENCY_ZERO_AT_PERIODS)
        )
    detail = "Filed this period" if gap == 0 else f"Last filed {gap} period(s) ago"
    return Component("recency", score, WEIGHT_RECENCY, detail)


def _confidence(invoices: int, periods: int) -> Decimal:
    """0-1, from how much evidence the score rests on.

    Volume and spread both count: twenty invoices in one month say less about a
    supplier than twenty across six, because a single good month is not a
    pattern.
    """
    if invoices == 0:
        return Decimal("0")
    volume = min(Decimal("1"), Decimal(invoices) / Decimal(FULL_CONFIDENCE_INVOICES))
    spread = min(Decimal("1"), Decimal(periods) / Decimal("3"))
    return (volume * Decimal("0.7") + spread * Decimal("0.3")).quantize(Decimal("0.01"))


def risk_level_for(score: int | None) -> RiskLevel:
    if score is None:
        return RiskLevel.UNKNOWN
    if score >= LOW_RISK_AT:
        return RiskLevel.LOW
    if score >= MEDIUM_RISK_AT:
        return RiskLevel.MEDIUM
    return RiskLevel.HIGH


def _provisioning(score: int | None, confidence: Decimal) -> tuple[Decimal, str]:
    """How much of this supplier's credit to hold back, and why.

    The provision is the complement of the score — a supplier whose invoices
    survive 70% of the time leaves 30% of their credit exposed — scaled by
    confidence, so a harsh judgement from thin evidence does not turn into a
    large provision on its own. Anything below one percent is not worth a
    journal entry and is reported as none.
    """
    if score is None:
        return ZERO, "No filing history yet. Reconcile a period to build a score."

    raw = (Decimal("100") - Decimal(score)) * confidence
    provision = _q(max(ZERO, raw))

    if provision < Decimal("1"):
        return ZERO, "Files reliably. No provision needed."
    if score >= LOW_RISK_AT:
        return provision, (
            f"Broadly reliable. Hold {provision}% of the credit until the 2B confirms it."
        )
    if score >= MEDIUM_RISK_AT:
        return provision, (
            f"Mixed record. Provide {provision}% against this supplier's credit and "
            "confirm the 2B before claiming."
        )
    return provision, (
        f"Unreliable filer. Provide {provision}% and consider holding payment until "
        "the invoice appears in GSTR-2B."
    )


def score_from_observations(
    gstin: str, observations: list[Observation], *, as_of_period: str
) -> SupplierScore:
    """Score a supplier from its observed periods. Pure: no database.

    Kept free of the session so the weighting can be asserted against plain
    lists — this is arithmetic that decides how much money a business holds
    back, and it should be testable without a fixture.
    """
    ordered = sorted(observations, key=lambda o: o.period)
    components = [
        _match_rate_component(ordered),
        _timeliness_component(ordered),
        _consistency_component(ordered),
        _recency_component(ordered, as_of_period),
    ]

    # Renormalise over the components that have evidence, so a missing
    # dimension neither scores zero nor silently caps the total.
    scored = [c for c in components if c.score is not None]
    total_weight = sum((c.weight for c in scored), ZERO)
    if total_weight > ZERO:
        weighted = sum((c.score * c.weight for c in scored), ZERO)  # type: ignore[operator]
        score: int | None = int(
            (weighted / total_weight).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
    else:
        score = None

    invoices = sum(o.total for o in ordered)
    periods = len([o for o in ordered if o.total])
    confidence = _confidence(invoices, periods)
    provision, recommendation = _provisioning(score, confidence)

    return SupplierScore(
        gstin=gstin,
        score=score,
        risk_level=risk_level_for(score),
        confidence=confidence,
        components=components,
        observations=ordered,
        invoices_observed=invoices,
        periods_observed=periods,
        recommended_provision_pct=provision,
        recommendation=recommendation,
    )


def observations_from_history(supplier: Supplier) -> list[Observation]:
    """Rebuild observations from a supplier's stored ``filing_history``.

    The history is written by reconciliation as an audit trail for the score;
    reading it back is how the score is recomputed without re-running every
    past reconciliation.
    """
    observations: list[Observation] = []
    for entry in supplier.filing_history or []:
        if not isinstance(entry, dict) or not entry.get("period"):
            continue
        observations.append(
            Observation(
                period=str(entry["period"]),
                matched=int(entry.get("matched") or 0),
                mismatched=int(entry.get("mismatched") or 0),
                missing=int(entry.get("missing") or 0),
                filing_delay_days=(
                    int(entry["filing_delay_days"])
                    if entry.get("filing_delay_days") is not None
                    else None
                ),
            )
        )
    return observations


def current_period() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


def score_supplier(supplier: Supplier, *, as_of_period: str | None = None) -> SupplierScore:
    """Score one supplier from its own stored history."""
    return score_from_observations(
        supplier.gstin,
        observations_from_history(supplier),
        as_of_period=as_of_period or current_period(),
    )


def apply_score(supplier: Supplier, score: SupplierScore) -> Supplier:
    """Write a score back onto the supplier row."""
    supplier.compliance_score = score.score
    supplier.risk_level = score.risk_level
    return supplier


def rescore_all(
    db: Session, business_id: int, *, as_of_period: str | None = None
) -> list[SupplierScore]:
    """Recompute every supplier's score for one tenant.

    Exists because the weighting is expected to change: when it does, existing
    suppliers should reflect the new model without anyone re-running a year of
    reconciliations.
    """
    period = as_of_period or current_period()
    suppliers = db.scalars(
        select(Supplier).where(
            Supplier.business_id == business_id, Supplier.deleted_at.is_(None)
        )
    ).all()

    scores: list[SupplierScore] = []
    for supplier in suppliers:
        score = score_supplier(supplier, as_of_period=period)
        apply_score(supplier, score)
        scores.append(score)
    db.commit()
    return scores


@dataclass
class SupplierExposure:
    """The money resting on one supplier right now."""

    invoice_count: int = 0
    tax_total: Decimal = ZERO
    tax_at_risk: Decimal = ZERO
    unpaid_count: int = 0

    def as_dict(self) -> dict:
        return {
            "invoice_count": self.invoice_count,
            "tax_total": str(_q(self.tax_total)),
            "tax_at_risk": str(_q(self.tax_at_risk)),
            "unpaid_count": self.unpaid_count,
        }


def exposure(db: Session, business_id: int, supplier: Supplier) -> SupplierExposure:
    """Credit currently resting on *supplier*'s invoices.

    "At risk" is credit on invoices this supplier has not filed — the
    ``missing_in_2b`` outcome — which is the amount the provisioning
    percentage is meant to be applied to.
    """
    invoices = db.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.deleted_at.is_(None),
            Invoice.invoice_type == InvoiceType.PURCHASE,
            Invoice.counterparty_gstin == supplier.gstin,
        )
    ).all()

    result = SupplierExposure()
    for invoice in invoices:
        if invoice.status == InvoiceStatus.FAILED:
            continue
        tax = (
            (invoice.igst or ZERO)
            + (invoice.cgst or ZERO)
            + (invoice.sgst or ZERO)
            + (invoice.cess or ZERO)
        )
        result.invoice_count += 1
        result.tax_total += tax
        if invoice.status == InvoiceStatus.MISSING_IN_2B:
            result.tax_at_risk += tax
        if invoice.paid_at is None:
            result.unpaid_count += 1
    return result
