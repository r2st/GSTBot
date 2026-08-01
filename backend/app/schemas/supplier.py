"""Request/response models for supplier health scoring."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.supplier import RiskLevel


class ScoreComponentOut(BaseModel):
    """One scored dimension, so the number can be explained rather than trusted."""

    name: str
    # None when there is no evidence for this dimension — which is not the same
    # as scoring zero, and must not render as it.
    score: float | None = None
    weight: float
    detail: str


class ObservationOut(BaseModel):
    """What one period showed about one supplier."""

    period: str
    matched: int
    mismatched: int
    missing: int
    filing_delay_days: int | None = None


class SupplierExposureOut(BaseModel):
    """The money currently resting on a supplier."""

    invoice_count: int
    tax_total: str
    tax_at_risk: str
    unpaid_count: int


class SupplierOut(BaseModel):
    """A supplier as the list screen shows them."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    gstin: str
    legal_name: str | None = None
    trade_name: str | None = None
    state_code: str | None = None
    # None until a reconciliation has produced evidence. Unrated and badly
    # rated warrant very different handling, so they do not share a value.
    compliance_score: int | None = None
    risk_level: RiskLevel
    total_invoices: int
    matched_invoices: int
    mismatched_invoices: int
    missing_invoices: int
    late_filings: int
    last_filed_period: str | None = None
    last_seen_at: date | None = None
    created_at: datetime


class SupplierScoreOut(BaseModel):
    """A supplier's score with its working and what to do about it."""

    gstin: str
    score: int | None = None
    risk_level: str
    confidence: float
    components: list[ScoreComponentOut]
    observations: list[ObservationOut]
    invoices_observed: int
    periods_observed: int
    recommended_provision_pct: float
    recommendation: str


class SupplierDetailOut(SupplierOut):
    """One supplier, with the score breakdown and current exposure."""

    score_detail: SupplierScoreOut
    exposure: SupplierExposureOut


class SupplierListOut(BaseModel):
    items: list[SupplierOut]
    total: int


class RescoreOut(BaseModel):
    """The result of recomputing every supplier's score."""

    rescored: int
    items: list[SupplierScoreOut]
