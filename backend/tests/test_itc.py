"""The set-off waterfall, the reversal rules, and the ITC endpoints."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import itc as itc_service
from app.services import reconciliation
from app.services.gstr2b import GSTR2BRecord
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE

PERIOD = "2026-04"


def heads(igst="0", cgst="0", sgst="0", cess="0") -> itc_service.TaxHeads:
    return itc_service.TaxHeads(
        igst=Decimal(igst), cgst=Decimal(cgst), sgst=Decimal(sgst), cess=Decimal(cess)
    )


def purchase(**kwargs) -> Invoice:
    """An unsaved purchase invoice with credit on it."""
    defaults = dict(
        id=kwargs.pop("id", 1),
        business_id=1,
        invoice_type=InvoiceType.PURCHASE,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        counterparty_name="Northwind Supplies",
        invoice_number="INV-1",
        invoice_date=date(2026, 4, 15),
        period=PERIOD,
        taxable_value=Decimal("100000.00"),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("18000.00"),
        cess=Decimal("0.00"),
        total_value=Decimal("118000.00"),
        itc_eligible=True,
        reverse_charge=False,
        is_capital_good=False,
        paid_at=None,
    )
    defaults.update(kwargs)
    return Invoice(**defaults)


def save(db, business_id, **kwargs) -> Invoice:
    invoice = purchase(id=None, business_id=business_id, **kwargs)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


# ---------------------------------------------------------------------------
# Section 49 / 49A / 49B — the set-off order
# ---------------------------------------------------------------------------

def test_igst_credit_settles_igst_first():
    result = itc_service.set_off(heads(igst="10000"), heads(igst="10000"))

    assert result.cash_payable.total == Decimal("0.00")
    assert result.credit_carried_forward.total == Decimal("0.00")
    assert [(s.credit_head, s.liability_head) for s in result.steps] == [("igst", "igst")]


def test_igst_credit_spills_onto_cgst_then_sgst():
    """s.49A: IGST must be exhausted before any other credit is touched."""
    result = itc_service.set_off(
        heads(igst="30000"), heads(igst="10000", cgst="10000", sgst="10000")
    )

    assert result.cash_payable.total == Decimal("0.00")
    assert [(s.credit_head, s.liability_head, s.amount) for s in result.steps] == [
        ("igst", "igst", Decimal("10000.00")),
        ("igst", "cgst", Decimal("10000.00")),
        ("igst", "sgst", Decimal("10000.00")),
    ]


def test_cgst_credit_never_settles_sgst_liability():
    """The two are levied by different governments and never meet.

    The business has exactly enough credit in total, and still has to pay the
    SGST in cash while the CGST credit carries forward. Reporting a set-off
    here would understate the cash they have to find this month.
    """
    result = itc_service.set_off(heads(cgst="5000"), heads(sgst="5000"))

    assert result.steps == []
    assert result.cash_payable.sgst == Decimal("5000.00")
    assert result.credit_carried_forward.cgst == Decimal("5000.00")


def test_sgst_credit_never_settles_cgst_liability():
    result = itc_service.set_off(heads(sgst="5000"), heads(cgst="5000"))

    assert result.steps == []
    assert result.cash_payable.cgst == Decimal("5000.00")
    assert result.credit_carried_forward.sgst == Decimal("5000.00")


def test_cgst_credit_settles_its_own_head_then_igst():
    result = itc_service.set_off(heads(cgst="10000"), heads(cgst="4000", igst="3000"))

    assert [(s.credit_head, s.liability_head, s.amount) for s in result.steps] == [
        ("cgst", "cgst", Decimal("4000.00")),
        ("cgst", "igst", Decimal("3000.00")),
    ]
    assert result.credit_carried_forward.cgst == Decimal("3000.00")
    assert result.cash_payable.total == Decimal("0.00")


def test_cess_is_ring_fenced():
    """Cess credit settles cess and nothing else, in either direction."""
    result = itc_service.set_off(heads(cess="5000"), heads(igst="5000"))

    assert result.steps == []
    assert result.cash_payable.igst == Decimal("5000.00")
    assert result.credit_carried_forward.cess == Decimal("5000.00")


def test_igst_is_exhausted_before_cgst_credit_is_used():
    """The rule most often got wrong: using CGST first looks equivalent.

    With ₹10,000 IGST credit and ₹10,000 CGST credit against a ₹10,000 CGST
    liability, the IGST must go first — leaving the CGST credit to carry
    forward, where it can settle a future CGST or IGST liability. Spending the
    CGST credit instead would strand IGST credit that is more flexible.
    """
    result = itc_service.set_off(heads(igst="10000", cgst="10000"), heads(cgst="10000"))

    assert [(s.credit_head, s.liability_head) for s in result.steps] == [("igst", "cgst")]
    assert result.credit_used.igst == Decimal("10000.00")
    assert result.credit_used.cgst == Decimal("0.00")
    assert result.credit_carried_forward.cgst == Decimal("10000.00")


def test_insufficient_credit_leaves_the_balance_payable_in_cash():
    result = itc_service.set_off(heads(igst="3000"), heads(igst="10000"))

    assert result.cash_payable.igst == Decimal("7000.00")
    assert result.total_cash == Decimal("7000.00")
    assert result.credit_carried_forward.total == Decimal("0.00")


def test_no_liability_carries_the_whole_credit_forward():
    result = itc_service.set_off(heads(igst="1000", cgst="500", sgst="500"), heads())

    assert result.total_cash == Decimal("0.00")
    assert result.credit_carried_forward.total == Decimal("2000.00")


# ---------------------------------------------------------------------------
# Rule 37 — 180 days
# ---------------------------------------------------------------------------

def test_rule_37_flags_an_unpaid_invoice_past_180_days():
    invoice = purchase(invoice_date=date(2026, 1, 1))
    result = itc_service.rule_37([invoice], as_of=date(2026, 7, 1))

    assert [item.invoice_id for item in result.overdue] == [1]
    assert result.reversal.igst == Decimal("18000.00")
    assert result.overdue[0].days_outstanding == 181


def test_rule_37_allows_the_whole_of_day_180():
    """Exactly 180 days is inside the window; 181 is not."""
    invoice = purchase(invoice_date=date(2026, 1, 1))

    on_the_day = itc_service.rule_37([invoice], as_of=date(2026, 6, 30))
    the_day_after = itc_service.rule_37([invoice], as_of=date(2026, 7, 1))

    assert on_the_day.overdue == []
    assert on_the_day.reversal.total == Decimal("0.00")
    assert len(the_day_after.overdue) == 1


def test_rule_37_warns_before_the_deadline():
    invoice = purchase(invoice_date=date(2026, 1, 1))
    # Day 160: twenty days left, inside the thirty-day warning window.
    result = itc_service.rule_37([invoice], as_of=date(2026, 6, 10))

    assert result.overdue == []
    assert [item.invoice_id for item in result.approaching] == [1]
    assert result.approaching[0].days_remaining == 20
    assert result.approaching_amount.igst == Decimal("18000.00")


def test_rule_37_ignores_a_paid_invoice():
    invoice = purchase(invoice_date=date(2026, 1, 1), paid_at=date(2026, 2, 1))
    result = itc_service.rule_37([invoice], as_of=date(2026, 12, 1))

    assert result.overdue == []
    assert result.reversal.total == Decimal("0.00")


def test_rule_37_ignores_invoices_that_never_claimed_credit():
    """Blocked credit and reverse charge have no credit to reverse."""
    blocked = purchase(id=1, invoice_date=date(2026, 1, 1), itc_eligible=False)
    rcm = purchase(id=2, invoice_date=date(2026, 1, 1), reverse_charge=True)

    result = itc_service.rule_37([blocked, rcm], as_of=date(2026, 12, 1))

    assert result.overdue == []


def test_rule_37_skips_an_invoice_with_no_date():
    """A missing date means extraction failed, not that 180 days have passed."""
    result = itc_service.rule_37(
        [purchase(invoice_date=None)], as_of=date(2026, 12, 1)
    )

    assert result.overdue == []
    assert result.approaching == []


def test_rule_37_reports_the_most_overdue_first():
    old = purchase(id=1, invoice_date=date(2025, 1, 1))
    newer = purchase(id=2, invoice_date=date(2026, 1, 1))

    result = itc_service.rule_37([newer, old], as_of=date(2026, 12, 1))

    assert [item.invoice_id for item in result.overdue] == [1, 2]


# ---------------------------------------------------------------------------
# Rules 42 and 43 — proportionate reversal
# ---------------------------------------------------------------------------

def test_rule_42_reverses_the_exempt_share_of_common_credit():
    """D1 = (E / F) x C2 — a quarter of turnover exempt reverses a quarter."""
    result = itc_service.proportionate_reversal(
        common_credit=heads(igst="40000"),
        capital_credit=heads(),
        exempt_turnover=Decimal("250000"),
        total_turnover=Decimal("1000000"),
    )

    assert result.exempt_ratio == Decimal("0.25")
    assert result.rule_42_reversal.igst == Decimal("10000.00")


def test_rule_43_spreads_capital_credit_over_sixty_months():
    """Only Tc/60 belongs to this month, and only the exempt share of it reverses."""
    result = itc_service.proportionate_reversal(
        common_credit=heads(),
        capital_credit=heads(igst="60000"),
        exempt_turnover=Decimal("500000"),
        total_turnover=Decimal("1000000"),
    )

    assert result.capital_credit_this_month.igst == Decimal("1000.00")
    assert result.rule_43_reversal.igst == Decimal("500.00")


def test_no_exempt_turnover_reverses_nothing():
    result = itc_service.proportionate_reversal(
        common_credit=heads(igst="40000"),
        capital_credit=heads(igst="60000"),
        exempt_turnover=Decimal("0"),
        total_turnover=Decimal("1000000"),
    )

    assert result.exempt_ratio == Decimal("0")
    assert result.total_reversal.total == Decimal("0.00")


def test_zero_turnover_does_not_divide_by_zero():
    """A period with no outward supply has no exempt proportion to compute."""
    result = itc_service.proportionate_reversal(
        common_credit=heads(igst="40000"),
        capital_credit=heads(),
        exempt_turnover=Decimal("0"),
        total_turnover=Decimal("0"),
    )

    assert result.exempt_ratio == Decimal("0")
    assert result.rule_42_reversal.total == Decimal("0.00")


def test_exempt_turnover_above_total_is_capped_at_everything():
    """Contradictory inputs must not reverse more credit than exists."""
    result = itc_service.proportionate_reversal(
        common_credit=heads(igst="40000"),
        capital_credit=heads(),
        exempt_turnover=Decimal("2000000"),
        total_turnover=Decimal("1000000"),
    )

    assert result.exempt_ratio == Decimal("1")
    assert result.rule_42_reversal.igst == Decimal("40000.00")


def test_reversal_splits_across_every_head():
    result = itc_service.proportionate_reversal(
        common_credit=heads(igst="1000", cgst="500", sgst="500", cess="100"),
        capital_credit=heads(),
        exempt_turnover=Decimal("500000"),
        total_turnover=Decimal("1000000"),
    )

    assert result.rule_42_reversal.igst == Decimal("500.00")
    assert result.rule_42_reversal.cgst == Decimal("250.00")
    assert result.rule_42_reversal.sgst == Decimal("250.00")
    assert result.rule_42_reversal.cess == Decimal("50.00")


# ---------------------------------------------------------------------------
# The period summary
# ---------------------------------------------------------------------------

def test_summary_pools_credit_by_head(db_session, business):
    save(db_session, business.id, invoice_number="A-1")
    save(
        db_session,
        business.id,
        invoice_number="A-2",
        counterparty_gstin=SUPPLIER_GSTIN_SAME_STATE,
        igst=Decimal("0.00"),
        cgst=Decimal("9000.00"),
        sgst=Decimal("9000.00"),
    )

    summary = itc_service.summarise(db_session, business.id, PERIOD)

    assert summary.available.igst == Decimal("18000.00")
    assert summary.available.cgst == Decimal("9000.00")
    assert summary.available.sgst == Decimal("9000.00")
    assert summary.invoice_count == 2
    assert summary.reconciled is False


def test_summary_excludes_blocked_and_reverse_charge_credit(db_session, business):
    save(db_session, business.id, invoice_number="A-1")
    save(db_session, business.id, invoice_number="A-2", itc_eligible=False)
    save(db_session, business.id, invoice_number="A-3", reverse_charge=True)

    summary = itc_service.summarise(db_session, business.id, PERIOD)

    assert summary.available.igst == Decimal("18000.00")
    assert summary.unclaimed_count == 2


def test_capital_goods_credit_is_not_pooled_with_inputs(db_session, business):
    """Its credit belongs to Rule 43's sixty months, not to this month."""
    save(db_session, business.id, invoice_number="A-1", is_capital_good=True)

    summary = itc_service.summarise(db_session, business.id, PERIOD)

    assert summary.available.igst == Decimal("0.00")
    assert summary.proportionate.capital_credit.igst == Decimal("18000.00")
    assert summary.proportionate.capital_credit_this_month.igst == Decimal("300.00")


def test_summary_caps_credit_at_what_reconciliation_found_eligible(db_session, business):
    """Only GSTR-2B establishes what a supplier actually declared."""
    save(db_session, business.id, invoice_number="A-1")
    save(db_session, business.id, invoice_number="A-2")
    # Only one of the two was declared by the supplier.
    reconciliation.store_gstr2b(
        db_session,
        business.id,
        PERIOD,
        [
            GSTR2BRecord(
                supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
                invoice_number="A-1",
                invoice_date=date(2026, 4, 15),
                period=PERIOD,
                taxable_value=Decimal("100000.00"),
                igst=Decimal("18000.00"),
                total_value=Decimal("118000.00"),
            )
        ],
    )
    reconciliation.run_reconciliation(db_session, business.id, PERIOD)

    summary = itc_service.summarise(db_session, business.id, PERIOD)

    assert summary.reconciled is True
    assert summary.available.igst == Decimal("18000.00")  # Not 36,000.
    assert summary.itc_at_risk == Decimal("18000.00")


def test_summary_looks_beyond_the_period_for_rule_37(db_session, business):
    """The invoice that crosses 180 days is one from months ago."""
    save(
        db_session,
        business.id,
        invoice_number="OLD-1",
        invoice_date=date(2025, 6, 1),
        period="2025-06",
    )

    summary = itc_service.summarise(
        db_session, business.id, PERIOD, as_of=date(2026, 4, 30)
    )

    assert summary.invoice_count == 0  # Nothing booked in the period itself.
    assert len(summary.rule_37.overdue) == 1
    assert summary.rule_37.reversal.igst == Decimal("18000.00")


def test_net_available_never_goes_negative(db_session, business):
    """A reversal larger than the period's credit is a liability, not negative credit."""
    save(
        db_session,
        business.id,
        invoice_number="OLD-1",
        invoice_date=date(2025, 6, 1),
        period="2025-06",
    )

    summary = itc_service.summarise(
        db_session, business.id, PERIOD, as_of=date(2026, 4, 30)
    )

    assert summary.net_available.igst == Decimal("0.00")
    assert summary.net_available.total == Decimal("0.00")


def test_net_available_combines_every_term_in_the_same_period(db_session, business):
    """The one arrangement where each part of the formula is load-bearing.

    ``net = max(0, available + capital_credit_this_month - reversal)``, where
    the reversal is Rule 37's plus Rule 42/43's. Every other test here leaves
    at least one of those terms at zero, and a term that is zero cannot show
    whether it is added or subtracted — so the sign of each was never actually
    asserted. This also runs it on CGST/SGST/cess rather than IGST, which is
    the split an intra-state buyer actually has.

    Worked through by hand:

    ==========================  =======  =======  =====
    Term                          CGST     SGST    Cess
    ==========================  =======  =======  =====
    Credit on this period's
    inputs                       9000     9000    1000
    Capital credit 12000/60        100      100       0
    Rule 42 (25% of inputs)     -2250    -2250    -250
    Rule 43 (25% of monthly)      -25      -25       0
    Rule 37 (unpaid > 180 days)  -500     -500       0
    ==========================  =======  =======  =====
    Net available                6325     6325     750
    """
    # This period's input credit.
    save(
        db_session,
        business.id,
        invoice_number="IN-1",
        igst=Decimal("0.00"),
        cgst=Decimal("9000.00"),
        sgst=Decimal("9000.00"),
        cess=Decimal("1000.00"),
    )
    # A capital good, whose credit belongs to Rule 43's sixty months.
    save(
        db_session,
        business.id,
        invoice_number="CAP-1",
        is_capital_good=True,
        igst=Decimal("0.00"),
        cgst=Decimal("6000.00"),
        sgst=Decimal("6000.00"),
        cess=Decimal("0.00"),
    )
    # An earlier invoice still unpaid past 180 days: Rule 37 reverses it.
    save(
        db_session,
        business.id,
        invoice_number="OLD-1",
        invoice_date=date(2025, 6, 1),
        period="2025-06",
        igst=Decimal("0.00"),
        cgst=Decimal("500.00"),
        sgst=Decimal("500.00"),
        cess=Decimal("0.00"),
    )

    summary = itc_service.summarise(
        db_session,
        business.id,
        PERIOD,
        as_of=date(2026, 4, 30),
        exempt_turnover=Decimal("25000.00"),
        total_turnover=Decimal("100000.00"),
    )

    # The inputs to the formula, so a failure below says which term moved.
    assert summary.available.cgst == Decimal("9000.00")
    assert summary.proportionate.capital_credit_this_month.cgst == Decimal("100.00")
    assert summary.proportionate.rule_42_reversal.cgst == Decimal("2250.00")
    assert summary.proportionate.rule_43_reversal.cgst == Decimal("25.00")
    assert summary.rule_37.reversal.cgst == Decimal("500.00")

    assert summary.net_available.cgst == Decimal("6325.00")
    assert summary.net_available.sgst == Decimal("6325.00")
    assert summary.net_available.cess == Decimal("750.00")
    assert summary.net_available.igst == Decimal("0.00")


def test_turnover_split_treats_untaxed_sales_as_exempt(db_session, business):
    db_session.add_all(
        [
            Invoice(
                business_id=business.id,
                invoice_type=InvoiceType.SALES,
                status=InvoiceStatus.PARSED,
                invoice_number="S-1",
                period=PERIOD,
                taxable_value=Decimal("100000.00"),
                igst=Decimal("18000.00"),
                total_value=Decimal("118000.00"),
            ),
            Invoice(
                business_id=business.id,
                invoice_type=InvoiceType.SALES,
                status=InvoiceStatus.PARSED,
                invoice_number="S-2",
                period=PERIOD,
                taxable_value=Decimal("50000.00"),
                total_value=Decimal("50000.00"),
            ),
        ]
    )
    db_session.commit()

    exempt, total = itc_service.turnover_split(db_session, business.id, PERIOD)

    assert exempt == Decimal("50000.00")
    assert total == Decimal("150000.00")


def test_summary_set_off_uses_the_net_credit(db_session, business):
    save(db_session, business.id, invoice_number="A-1")
    db_session.add(
        Invoice(
            business_id=business.id,
            invoice_type=InvoiceType.SALES,
            status=InvoiceStatus.PARSED,
            invoice_number="S-1",
            period=PERIOD,
            taxable_value=Decimal("100000.00"),
            igst=Decimal("20000.00"),
            total_value=Decimal("120000.00"),
        )
    )
    db_session.commit()

    summary = itc_service.summarise(db_session, business.id, PERIOD)

    assert summary.output_tax.igst == Decimal("20000.00")
    # ₹18,000 of credit against ₹20,000 of liability leaves ₹2,000 in cash.
    assert summary.set_off.cash_payable.igst == Decimal("2000.00")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def test_itc_endpoint_returns_the_period_position(auth_client, db_session, business):
    save(db_session, business.id, invoice_number="A-1")

    response = auth_client.get(f"/api/v1/itc?period={PERIOD}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["period"] == PERIOD
    assert body["available"]["igst"] == "18000.00"
    assert body["reconciled"] is False


def test_itc_endpoint_accepts_a_turnover_override(auth_client, db_session, business):
    """A business with exempt supplies it does not invoice here knows better."""
    save(db_session, business.id, invoice_number="A-1")

    response = auth_client.get(
        f"/api/v1/itc?period={PERIOD}&exempt_turnover=500000&total_turnover=1000000"
    )

    body = response.json()
    assert body["proportionate"]["exempt_ratio"].startswith("0.5")
    assert body["proportionate"]["rule_42_reversal"]["igst"] == "9000.00"


def test_rule37_endpoint_reports_overdue_credit(auth_client, db_session, business):
    save(
        db_session,
        business.id,
        invoice_number="OLD-1",
        invoice_date=date(2025, 6, 1),
        period="2025-06",
    )

    response = auth_client.get("/api/v1/itc/rule37?as_of=2026-04-30")

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["overdue"]) == 1
    assert body["reversal"]["igst"] == "18000.00"
    assert body["days"] == 180


def test_set_off_endpoint_refuses_to_cross_cgst_and_sgst(auth_client):
    response = auth_client.post(
        "/api/v1/itc/set-off",
        json={"credit_cgst": "5000", "liability_sgst": "5000"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["steps"] == []
    assert body["cash_payable"]["sgst"] == "5000.00"
    assert body["credit_carried_forward"]["cgst"] == "5000.00"


def test_itc_endpoints_require_authentication(client):
    for path in ("/api/v1/itc", "/api/v1/itc/rule37"):
        assert client.get(path).status_code == 401


def test_itc_does_not_leak_across_tenants(auth_client, db_session, business, other_tenant):
    save(db_session, business.id, invoice_number="A-1")

    response = auth_client.get(
        f"/api/v1/itc?period={PERIOD}",
        headers={"Authorization": f"Bearer {other_tenant}"},
    )

    assert response.json()["available"]["igst"] == "0.00"


@pytest.mark.parametrize("bad", ["2026-4", "202604", "april"])
def test_itc_rejects_a_malformed_period(auth_client, bad):
    assert auth_client.get(f"/api/v1/itc?period={bad}").status_code == 422
