"""The period readers must search on the direction, not filter on it.

Sales and purchases share ``invoices``, and every query that reads a period
wants exactly one of them: GSTR-1 is built from the sales side, the ITC
position and the GSTR-2B match from the purchase side. So a period holds about
twice the rows any single caller wants, and whether ``invoice_type`` is in the
index key or only in the ``WHERE`` decides whether the other half is fetched
off the heap before being thrown away.

Like ``test_sweep_indexes``, these plan the SQL the production functions
actually emit rather than asserting an index is declared. A declaration is not
a plan — the two-column ``(business_id, period)`` index these queries used
before was *offered* to the planner the whole time and taken every time; it
simply could not carry the direction. The plan is what tells those apart.

``ANALYZE`` before planning for the same reason it is there: an index is only
ever offered, and which one SQLite takes is a cost decision it makes badly
without statistics. The seed below is shaped so the choice means something —
both directions present in every period, in the ratio a real register has.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.models.business import Business
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import filing, itc, reconciliation
from tests.conftest import BUSINESS_GSTIN

# Two years of history, because the planner's choice is only meaningful against
# one. ``ix_invoices_business_type_date`` also leads with ``business_id`` and
# carries ``invoice_type``, and it additionally satisfies these callers'
# ``ORDER BY invoice_date`` — so over a handful of periods SQLite prefers it and
# reads every month of the register to avoid a sort of forty rows. The period
# predicate has to be selective enough for that trade to come out the other way,
# which over two years it is, and on a real register it always is.
PERIODS = tuple(f"{year}-{month:02d}" for year in (2025, 2026) for month in range(1, 13))
PER_DIRECTION = 40  # per period, per direction


@pytest.fixture()
def register(db_session) -> Business:
    """A register with both directions in every period, mostly readable."""
    business = Business(
        gstin=BUSINESS_GSTIN,
        legal_name="Umang Traders Private Limited",
        state_code=BUSINESS_GSTIN[:2],
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)

    for period in PERIODS:
        year, month = (int(part) for part in period.split("-"))
        for invoice_type in (InvoiceType.SALES, InvoiceType.PURCHASE):
            for index in range(PER_DIRECTION):
                db_session.add(
                    Invoice(
                        business_id=business.id,
                        invoice_type=invoice_type,
                        period=period,
                        # A tenth still queued, which is why ``status`` stays a
                        # filter rather than joining the key.
                        status=(
                            InvoiceStatus.UPLOADED
                            if index % 10 == 0
                            else InvoiceStatus.PARSED
                        ),
                        invoice_date=date(year, month, 1 + index % 28),
                    )
                )
    db_session.commit()
    db_session.get_bind().raw_connection().cursor().execute("ANALYZE")
    return business


def _plan(session, statement: str, parameters) -> str:
    rows = (
        session.get_bind()
        .raw_connection()
        .cursor()
        .execute("EXPLAIN QUERY PLAN " + statement, parameters)
    )
    return " | ".join(str(row[-1]) for row in rows)


def _first_invoice_select(session, run):
    """Run *run*, returning the first SELECT it issues against ``invoices``.

    Against ``invoices`` specifically, not simply the first SELECT: the
    ``Business`` these callers are handed is expired by the fixture's commit,
    so reading ``register.id`` to build the call reloads it, and that reload
    would otherwise be the statement under test.
    """
    from sqlalchemy import event

    statements: list[tuple[str, object]] = []

    def _record(_conn, _cursor, statement, parameters, _context, _executemany):
        normalised = " ".join(statement.split()).upper()
        if normalised.startswith("SELECT") and "FROM INVOICES" in normalised:
            statements.append((statement, parameters))

    bind = session.get_bind()
    event.listen(bind, "before_cursor_execute", _record)
    try:
        run()
    finally:
        event.remove(bind, "before_cursor_execute", _record)

    assert statements, "the caller never read the invoices table"
    return statements[0]


def _assert_searches_on_direction(session, run) -> None:
    statement, parameters = _first_invoice_select(session, run)
    plan = _plan(session, statement, parameters)

    assert "ix_invoices_business_period" in plan, plan
    # The point of the whole exercise: ``invoice_type`` inside the index
    # condition, not left to a filter that runs after the heap read. SQLite
    # names every searched column in the plan, so its absence here is exactly
    # the regression — an index narrowed back to two columns still matches the
    # name assertion above and still says SEARCH.
    assert "invoice_type=?" in plan, plan
    assert "SCAN" not in plan, plan


class TestTheReturnsReadOneDirection:
    def test_the_filable_invoices_for_a_period_search_on_the_direction(
        self, db_session, register
    ):
        _assert_searches_on_direction(
            db_session,
            lambda: filing._invoices(
                db_session, register.id, "2026-04", InvoiceType.SALES
            ),
        )

    def test_the_unreadable_invoices_for_a_period_search_on_the_direction(
        self, db_session, register
    ):
        _assert_searches_on_direction(
            db_session,
            lambda: filing._unreadable_invoices(
                db_session, register.id, "2026-04", InvoiceType.SALES
            ),
        )

    def test_both_halves_of_validation_still_return_the_rows_the_plan_is_for(
        self, db_session, register
    ):
        # A plan is worthless if the predicate stopped matching, and a widened
        # index is exactly the change that could quietly drop the direction
        # from the ``WHERE`` while the plan above looks healthier than ever.
        # Sales only, and only the readable ones.
        filable = filing._invoices(db_session, register.id, "2026-04", InvoiceType.SALES)
        unreadable = filing._unreadable_invoices(
            db_session, register.id, "2026-04", InvoiceType.SALES
        )

        assert len(filable) == PER_DIRECTION - PER_DIRECTION // 10
        assert len(unreadable) == PER_DIRECTION // 10
        assert {invoice.invoice_type for invoice in filable} == {InvoiceType.SALES}
        assert {invoice.invoice_type for invoice in unreadable} == {InvoiceType.SALES}


class TestTheOtherPeriodReadersShareTheIndex:
    def test_the_reconciliation_candidates_search_on_the_direction(
        self, db_session, register
    ):
        _assert_searches_on_direction(
            db_session,
            lambda: reconciliation._book_invoices(db_session, register.id, "2026-04"),
        )

    def test_the_output_tax_for_a_period_searches_on_the_direction(
        self, db_session, register
    ):
        _assert_searches_on_direction(
            db_session,
            lambda: itc._outward_tax(db_session, register.id, "2026-04"),
        )


class TestTheDashboardStillSearchesThePrefix:
    def test_a_period_scan_with_no_direction_still_uses_the_widened_index(
        self, db_session, register
    ):
        # ``(business_id, period)`` is a prefix of the widened key, which is the
        # whole reason this replaces the old index instead of joining it. If
        # that stopped holding, the grouped scan behind the dashboard would
        # fall back to a table scan and nothing else here would notice.
        from app.services import invoice_service

        statement, parameters = _first_invoice_select(
            db_session,
            lambda: invoice_service.tax_summary(db_session, register.id, "2026-04"),
        )
        plan = _plan(db_session, statement, parameters)

        assert "ix_invoices_business_period" in plan, plan
        assert "SCAN" not in plan, plan
