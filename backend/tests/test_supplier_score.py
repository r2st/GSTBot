"""Supplier health: the weighting, the confidence, and the provisioning advice."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.supplier import RiskLevel, Supplier
from app.services import reconciliation
from app.services import supplier_score as scoring
from app.services.gstr2b import GSTR2BRecord
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE

PERIOD = "2026-04"


def observed(period, matched=0, mismatched=0, missing=0, delay=None) -> scoring.Observation:
    return scoring.Observation(
        period=period,
        matched=matched,
        mismatched=mismatched,
        missing=missing,
        filing_delay_days=delay,
    )


def score(observations, *, as_of=PERIOD) -> scoring.SupplierScore:
    return scoring.score_from_observations(
        SUPPLIER_GSTIN_OTHER_STATE, observations, as_of_period=as_of
    )


def component(result, name) -> scoring.Component:
    return next(c for c in result.components if c.name == name)


# ---------------------------------------------------------------------------
# Due dates and period arithmetic
# ---------------------------------------------------------------------------

def test_gstr1_is_due_on_the_eleventh_of_the_following_month():
    assert scoring.gstr1_due_date("2026-04") == date(2026, 5, 11)


def test_a_december_period_is_due_in_january():
    assert scoring.gstr1_due_date("2026-12") == date(2027, 1, 11)


# ---------------------------------------------------------------------------
# No evidence is not a bad score
# ---------------------------------------------------------------------------

def test_a_supplier_with_no_history_is_unscored_not_zero():
    """Unrated and badly rated warrant different handling."""
    result = score([])

    assert result.score is None
    assert result.risk_level is RiskLevel.UNKNOWN
    assert result.confidence == Decimal("0")
    assert result.recommended_provision_pct == Decimal("0.00")
    assert "No filing history" in result.recommendation


def test_components_with_no_evidence_report_none_rather_than_zero():
    result = score([observed(PERIOD, matched=1)])

    assert component(result, "timeliness").score is None
    assert component(result, "consistency").score is None
    assert component(result, "match_rate").score == Decimal("100")


# ---------------------------------------------------------------------------
# Match rate
# ---------------------------------------------------------------------------

def test_a_perfect_filer_scores_full_marks():
    result = score([observed(PERIOD, matched=10, delay=0)])

    assert result.score == 100
    assert result.risk_level is RiskLevel.LOW


def test_a_supplier_who_never_files_scores_zero():
    result = score([observed(PERIOD, missing=10)])

    assert component(result, "match_rate").score == Decimal("0")
    assert result.risk_level is RiskLevel.HIGH


def test_a_mismatch_earns_half_credit_and_a_missing_invoice_none():
    """A mismatch is a data problem; a missing invoice is a supplier who did not file."""
    mismatched = score([observed(PERIOD, mismatched=10)])
    missing = score([observed(PERIOD, missing=10)])

    assert component(mismatched, "match_rate").score == Decimal("50")
    assert component(missing, "match_rate").score == Decimal("0")


def test_match_rate_pools_invoices_rather_than_averaging_periods():
    """A one-invoice month must not outweigh a two-hundred-invoice month."""
    result = score(
        [observed("2026-03", matched=99, missing=1), observed("2026-04", missing=1)]
    )

    # 99 of 101, not the mean of 99% and 0%.
    assert component(result, "match_rate").score > Decimal("97")


# ---------------------------------------------------------------------------
# Timeliness
# ---------------------------------------------------------------------------

def test_filing_by_the_due_date_scores_full_timeliness():
    result = score([observed(PERIOD, matched=5, delay=0)])
    assert component(result, "timeliness").score == Decimal("100")


def test_filing_early_earns_nothing_extra():
    """The buyer's claim is not improved by an early filing."""
    result = score([observed(PERIOD, matched=5, delay=-10)])
    assert component(result, "timeliness").score == Decimal("100")


def test_a_full_period_late_scores_no_timeliness():
    result = score([observed(PERIOD, matched=5, delay=30)])
    assert component(result, "timeliness").score == Decimal("0")


def test_timeliness_falls_off_linearly():
    result = score([observed(PERIOD, matched=5, delay=15)])
    assert component(result, "timeliness").score == Decimal("50")


def test_timeliness_averages_across_periods():
    result = score(
        [observed("2026-03", matched=5, delay=0), observed("2026-04", matched=5, delay=30)]
    )
    assert component(result, "timeliness").score == Decimal("50")


# ---------------------------------------------------------------------------
# Consistency
# ---------------------------------------------------------------------------

def test_consistency_needs_two_periods():
    result = score([observed(PERIOD, matched=5)])
    assert component(result, "consistency").score is None


def test_a_steady_supplier_scores_full_consistency():
    result = score(
        [observed("2026-03", matched=8, missing=2), observed("2026-04", matched=8, missing=2)]
    )
    assert component(result, "consistency").score == Decimal("100")


def test_an_erratic_supplier_scores_worse_than_a_steady_one_at_the_same_average():
    """Alternating 100% and 40% averages 70% and is a worse risk than a steady 70%."""
    erratic = score(
        [observed("2026-03", matched=10), observed("2026-04", matched=4, missing=6)]
    )
    steady = score(
        [observed("2026-03", matched=7, missing=3), observed("2026-04", matched=7, missing=3)]
    )

    assert component(erratic, "consistency").score < component(steady, "consistency").score
    assert erratic.score < steady.score


# ---------------------------------------------------------------------------
# Recency
# ---------------------------------------------------------------------------

def test_filing_this_period_scores_full_recency():
    result = score([observed(PERIOD, matched=5)], as_of=PERIOD)
    assert component(result, "recency").score == Decimal("100")


def test_recency_decays_with_silence():
    result = score([observed("2026-01", matched=5)], as_of="2026-04")
    assert component(result, "recency").score == Decimal("50")


def test_six_periods_of_silence_exhausts_recency():
    result = score([observed("2025-10", matched=5)], as_of="2026-04")
    assert component(result, "recency").score == Decimal("0")


def test_a_supplier_only_ever_seen_missing_has_no_recency_evidence():
    result = score([observed(PERIOD, missing=5)])
    assert component(result, "recency").score is None


# ---------------------------------------------------------------------------
# Weighting and renormalisation
# ---------------------------------------------------------------------------

def test_missing_dimensions_are_renormalised_rather_than_scored_zero():
    """Match rate 50 and recency 100, with the other two absent: (50x50 + 100x10)/60."""
    result = score([observed(PERIOD, matched=1, missing=1)])

    assert result.score == 58


def test_all_four_dimensions_combine_by_weight():
    result = score(
        [
            observed("2026-03", matched=10, delay=0),
            observed("2026-04", matched=10, delay=0),
        ]
    )

    assert component(result, "match_rate").score == Decimal("100")
    assert component(result, "timeliness").score == Decimal("100")
    assert component(result, "consistency").score == Decimal("100")
    assert component(result, "recency").score == Decimal("100")
    assert result.score == 100


# ---------------------------------------------------------------------------
# Confidence and provisioning
# ---------------------------------------------------------------------------

def test_confidence_grows_with_volume_and_spread():
    thin = score([observed(PERIOD, matched=2)])
    thick = score(
        [
            observed("2026-02", matched=20),
            observed("2026-03", matched=20),
            observed("2026-04", matched=20),
        ]
    )

    assert thin.confidence < thick.confidence
    assert thick.confidence == Decimal("1.00")


def test_a_reliable_supplier_needs_no_provision():
    result = score(
        [
            observed("2026-02", matched=20, delay=0),
            observed("2026-03", matched=20, delay=0),
            observed("2026-04", matched=20, delay=0),
        ]
    )

    assert result.recommended_provision_pct == Decimal("0.00")
    assert "No provision needed" in result.recommendation


def test_an_unreliable_supplier_gets_a_provision_and_advice():
    result = score(
        [
            observed("2026-02", missing=20),
            observed("2026-03", missing=20),
            observed("2026-04", missing=20),
        ]
    )

    assert result.score is not None
    assert result.recommended_provision_pct > Decimal("50")
    assert "holding payment" in result.recommendation


def test_thin_evidence_softens_the_provision():
    """A harsh judgement from three invoices must not become a large provision."""
    thin = score([observed(PERIOD, missing=3)])
    thick = score(
        [
            observed("2026-02", missing=20),
            observed("2026-03", missing=20),
            observed("2026-04", missing=20),
        ]
    )

    assert thin.recommended_provision_pct < thick.recommended_provision_pct


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (100, RiskLevel.LOW),
        (85, RiskLevel.LOW),
        (84, RiskLevel.MEDIUM),
        (60, RiskLevel.MEDIUM),
        (59, RiskLevel.HIGH),
        (0, RiskLevel.HIGH),
        (None, RiskLevel.UNKNOWN),
    ],
)
def test_risk_bands(value, expected):
    assert scoring.risk_level_for(value) is expected


# ---------------------------------------------------------------------------
# Reading history back off a supplier row
# ---------------------------------------------------------------------------

def test_observations_are_rebuilt_from_stored_history():
    supplier = Supplier(
        business_id=1,
        gstin=SUPPLIER_GSTIN_OTHER_STATE,
        filing_history=[
            {"period": "2026-03", "matched": 5, "mismatched": 1, "missing": 0},
            {"period": "2026-04", "matched": 4, "missing": 2, "filing_delay_days": 7},
        ],
    )

    observations = scoring.observations_from_history(supplier)

    assert [o.period for o in observations] == ["2026-03", "2026-04"]
    assert observations[1].filing_delay_days == 7


def test_malformed_history_entries_are_skipped():
    supplier = Supplier(
        business_id=1,
        gstin=SUPPLIER_GSTIN_OTHER_STATE,
        filing_history=["nonsense", {"no_period": True}, {"period": "2026-04", "matched": 1}],
    )

    assert len(scoring.observations_from_history(supplier)) == 1


# ---------------------------------------------------------------------------
# Integration with reconciliation
# ---------------------------------------------------------------------------

def book(db, business_id, **kwargs) -> Invoice:
    defaults = dict(
        business_id=business_id,
        invoice_type=InvoiceType.PURCHASE,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="INV-1",
        invoice_date=date(2026, 4, 15),
        period=PERIOD,
        taxable_value=Decimal("100000.00"),
        igst=Decimal("18000.00"),
        total_value=Decimal("118000.00"),
    )
    defaults.update(kwargs)
    invoice = Invoice(**defaults)
    db.add(invoice)
    db.commit()
    return invoice


def portal(**kwargs) -> GSTR2BRecord:
    defaults = dict(
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="INV-1",
        invoice_date=date(2026, 4, 15),
        period=PERIOD,
        taxable_value=Decimal("100000.00"),
        igst=Decimal("18000.00"),
        total_value=Decimal("118000.00"),
    )
    defaults.update(kwargs)
    return GSTR2BRecord(**defaults)


def test_reconciliation_records_the_suppliers_filing_delay(db_session, business):
    db_session.add(Supplier(business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    db_session.commit()
    book(db_session, business.id)
    # Due 11 May; filed 21 May.
    reconciliation.store_gstr2b(
        db_session,
        business.id,
        PERIOD,
        [portal(supplier_filing_date=date(2026, 5, 21))],
    )

    reconciliation.run_reconciliation(db_session, business.id, PERIOD)

    supplier = db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one()
    assert supplier.filing_history[-1]["filing_delay_days"] == 10
    assert supplier.late_filings == 1
    assert supplier.last_seen_at == date(2026, 5, 21)


def test_rerunning_a_period_corrects_the_score_rather_than_compounding_it(
    db_session, business
):
    """Periods are reconciled repeatedly as suppliers file late."""
    db_session.add(Supplier(business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    db_session.commit()
    book(db_session, business.id)
    reconciliation.store_gstr2b(db_session, business.id, PERIOD, [])

    reconciliation.run_reconciliation(db_session, business.id, PERIOD)
    supplier = db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one()
    assert supplier.missing_invoices == 1

    # The supplier files late; the 2B is regenerated and the period re-run.
    reconciliation.store_gstr2b(db_session, business.id, PERIOD, [portal()])
    reconciliation.run_reconciliation(db_session, business.id, PERIOD)

    db_session.refresh(supplier)
    assert len(supplier.filing_history) == 1
    assert supplier.missing_invoices == 0
    assert supplier.matched_invoices == 1
    assert supplier.risk_level is RiskLevel.LOW


def test_rescore_all_recomputes_every_supplier(db_session, business):
    db_session.add(
        Supplier(
            business_id=business.id,
            gstin=SUPPLIER_GSTIN_OTHER_STATE,
            compliance_score=1,
            risk_level=RiskLevel.HIGH,
            filing_history=[{"period": PERIOD, "matched": 10}],
        )
    )
    db_session.commit()

    scores = scoring.rescore_all(db_session, business.id, as_of_period=PERIOD)

    assert len(scores) == 1
    supplier = db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one()
    assert supplier.compliance_score == 100
    assert supplier.risk_level is RiskLevel.LOW


def test_exposure_counts_credit_resting_on_a_supplier(db_session, business):
    supplier = Supplier(business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE)
    db_session.add(supplier)
    db_session.commit()

    book(db_session, business.id, invoice_number="A-1", status=InvoiceStatus.MATCHED)
    book(
        db_session,
        business.id,
        invoice_number="A-2",
        status=InvoiceStatus.MISSING_IN_2B,
        paid_at=date(2026, 5, 1),
    )

    result = scoring.exposure(db_session, business.id, supplier)

    assert result.invoice_count == 2
    assert result.tax_total == Decimal("36000.00")
    assert result.tax_at_risk == Decimal("18000.00")
    assert result.unpaid_count == 1


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def test_list_endpoint_returns_suppliers_riskiest_first(auth_client, db_session, business):
    db_session.add_all(
        [
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_OTHER_STATE,
                compliance_score=90,
                risk_level=RiskLevel.LOW,
            ),
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_SAME_STATE,
                compliance_score=20,
                risk_level=RiskLevel.HIGH,
            ),
        ]
    )
    db_session.commit()

    response = auth_client.get("/api/v1/suppliers")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert [item["compliance_score"] for item in body["items"]] == [20, 90]


def test_unrated_suppliers_sort_last(auth_client, db_session, business):
    db_session.add_all(
        [
            Supplier(business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE),
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_SAME_STATE,
                compliance_score=30,
                risk_level=RiskLevel.HIGH,
            ),
        ]
    )
    db_session.commit()

    items = auth_client.get("/api/v1/suppliers").json()["items"]

    assert [item["compliance_score"] for item in items] == [30, None]


def test_list_endpoint_filters_by_risk_level(auth_client, db_session, business):
    db_session.add_all(
        [
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_OTHER_STATE,
                compliance_score=90,
                risk_level=RiskLevel.LOW,
            ),
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_SAME_STATE,
                compliance_score=20,
                risk_level=RiskLevel.HIGH,
            ),
        ]
    )
    db_session.commit()

    body = auth_client.get("/api/v1/suppliers?risk_level=high").json()

    assert body["total"] == 1
    assert body["items"][0]["gstin"] == SUPPLIER_GSTIN_SAME_STATE


def test_list_endpoint_searches_by_name_and_gstin(auth_client, db_session, business):
    db_session.add(
        Supplier(
            business_id=business.id,
            gstin=SUPPLIER_GSTIN_OTHER_STATE,
            legal_name="Northwind Supplies",
        )
    )
    db_session.commit()

    assert auth_client.get("/api/v1/suppliers?search=northwind").json()["total"] == 1
    assert auth_client.get("/api/v1/suppliers?search=29AAG").json()["total"] == 1
    assert auth_client.get("/api/v1/suppliers?search=zzz").json()["total"] == 0


def test_detail_endpoint_explains_the_score(auth_client, db_session, business):
    db_session.add(
        Supplier(
            business_id=business.id,
            gstin=SUPPLIER_GSTIN_OTHER_STATE,
            filing_history=[{"period": PERIOD, "matched": 8, "missing": 2}],
        )
    )
    db_session.commit()
    supplier_id = (
        db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one().id
    )

    response = auth_client.get(f"/api/v1/suppliers/{supplier_id}?period={PERIOD}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["gstin"] == SUPPLIER_GSTIN_OTHER_STATE
    names = {c["name"] for c in body["score_detail"]["components"]}
    assert names == {"match_rate", "timeliness", "consistency", "recency"}
    assert body["score_detail"]["recommendation"]
    assert body["exposure"]["invoice_count"] == 0


def test_rescore_endpoint_updates_every_supplier(auth_client, db_session, business):
    db_session.add(
        Supplier(
            business_id=business.id,
            gstin=SUPPLIER_GSTIN_OTHER_STATE,
            compliance_score=1,
            risk_level=RiskLevel.HIGH,
            filing_history=[{"period": PERIOD, "matched": 10}],
        )
    )
    db_session.commit()

    response = auth_client.post(f"/api/v1/suppliers/rescore?period={PERIOD}")

    assert response.status_code == 200, response.text
    assert response.json()["rescored"] == 1
    assert response.json()["items"][0]["score"] == 100


def test_a_supplier_from_another_tenant_is_not_found(
    auth_client, db_session, business, other_tenant
):
    """404 rather than 403: a 403 confirms the id exists."""
    db_session.add(Supplier(business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    db_session.commit()
    supplier_id = (
        db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one().id
    )

    response = auth_client.get(
        f"/api/v1/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {other_tenant}"},
    )

    assert response.status_code == 404


def test_supplier_endpoints_require_authentication(client):
    assert client.get("/api/v1/suppliers").status_code == 401
    assert client.post("/api/v1/suppliers/rescore").status_code == 401


def test_rescore_is_not_shadowed_by_the_detail_route(auth_client):
    """``/suppliers/rescore`` must not be read as ``/suppliers/{id}``."""
    assert auth_client.post("/api/v1/suppliers/rescore").status_code == 200
