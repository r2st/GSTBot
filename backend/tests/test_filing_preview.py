"""A preview reads the period once, and says exactly what two reads said.

``build_gstr1`` fills the return's blocks from a period's sales invoices,
``build_gstr3b`` fills tables 3.1 and 3.2 from the same ones, and
``validate_period`` checks every field on each of them. The two preview routes
want a document *and* its validation in one response — they are returned
together on purpose, because a return built from invoices with three invalid
GSTINs is not something anyone should download without being told — and each
half was fetching the period for itself.

Nothing was wrong with the answer, which is why it lasted. It cost a fifth of
the response: on 3,000 sales invoices the two halves are ~80 ms each and the
duplicated read is 33 ms of that, spent on rows already hydrated in the session.

So there are two claims here, and they have to be made together. That the
second read is gone is the point of the change; that the output is unchanged is
what makes it a safe one, and a test for the first alone would pass just as
happily if ``preview`` had started handing the wrong rows to one of its halves.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.business import Business
from app.models.gstr_return import ReturnType
from app.models.invoice import Invoice, InvoiceSource, InvoiceStatus, InvoiceType
from app.services import filing
from tests.conftest import (
    BUSINESS_GSTIN,
    SUPPLIER_GSTIN_OTHER_STATE,
    SUPPLIER_GSTIN_SAME_STATE,
)

PERIOD = "2026-04"


def _seed(db_session, business: Business) -> None:
    """A month of sales across both tax splits, with one row never read.

    Both splits because the B2B/B2CL/B2CS sort and table 3.2 turn on the place
    of supply, and a fixture of one shape would let a mis-passed list through.
    The unreadable row is there because it is the one invoice ``_invoices``
    excludes and ``validate_period`` still has to report — the two halves
    disagreeing about it is exactly what a shared list could break.
    """
    for index in range(12):
        interstate = index % 2 == 0
        db_session.add(
            Invoice(
                business_id=business.id,
                invoice_type=InvoiceType.SALES,
                period=PERIOD,
                status=InvoiceStatus.PARSED,
                source=InvoiceSource.UPLOAD,
                # A registered buyer on some, none on others, so B2B and the
                # B2C blocks are both populated.
                counterparty_gstin=(
                    (SUPPLIER_GSTIN_OTHER_STATE if interstate else SUPPLIER_GSTIN_SAME_STATE)
                    if index % 3
                    else None
                ),
                counterparty_name=f"Customer {index}",
                invoice_number=f"INV-{index:04d}",
                invoice_date=date(2026, 4, 1 + index),
                place_of_supply="29" if interstate else "27",
                taxable_value=Decimal("10000.00"),
                igst=Decimal("1800.00") if interstate else Decimal("0.00"),
                cgst=Decimal("0.00") if interstate else Decimal("900.00"),
                sgst=Decimal("0.00") if interstate else Decimal("900.00"),
                total_value=Decimal("11800.00"),
                tax_rate=Decimal("18.00"),
                hsn_code="998313",
            )
        )
    # Never parsed: absent from the document, an error against the period.
    db_session.add(
        Invoice(
            business_id=business.id,
            invoice_type=InvoiceType.SALES,
            period=PERIOD,
            status=InvoiceStatus.UPLOADED,
            source=InvoiceSource.UPLOAD,
            invoice_number="INV-9999",
        )
    )
    db_session.commit()


@pytest.fixture()
def register(db_session) -> Business:
    """The seeded period, for the service-level tests."""
    business = Business(
        gstin=BUSINESS_GSTIN,
        legal_name="Umang Traders Private Limited",
        state_code=BUSINESS_GSTIN[:2],
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)
    _seed(db_session, business)
    return business


@pytest.fixture()
def seeded_client(db_session, auth_client):
    """The same period, hung off the business ``auth_client`` registered.

    Not the ``register`` fixture with a client bolted on: registering creates a
    business under this same GSTIN, and the partial unique index would refuse
    the second one.
    """
    business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()
    _seed(db_session, business)
    return auth_client


def _invoice_reads(session, run) -> int:
    """How many SELECTs *run* issues against ``invoices``."""
    reads = 0

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        nonlocal reads
        normalised = " ".join(statement.split()).upper()
        if normalised.startswith("SELECT") and "FROM INVOICES" in normalised:
            reads += 1

    bind = session.get_bind()
    event.listen(bind, "before_cursor_execute", _record)
    try:
        run()
    finally:
        event.remove(bind, "before_cursor_execute", _record)
    return reads


class TestThePeriodIsReadOnce:
    def test_a_gstr1_preview_reads_the_filable_invoices_once(self, db_session, register):
        # Two reads of ``invoices``, not three: the filable rows once, and the
        # unreadable ones once for the validation. The third was the same
        # filable query run again for the other half of the response.
        assert (
            _invoice_reads(
                db_session,
                lambda: filing.preview(db_session, register, PERIOD, ReturnType.GSTR1),
            )
            == 2
        )

    def test_composing_the_two_halves_by_hand_still_reads_the_period_twice(
        self, db_session, register
    ):
        # The behaviour this replaced, asserted so the number above means
        # something. Both functions still fetch for themselves when called
        # alone — that is what every other caller does, and it is the branch
        # ``preview`` opts out of rather than one it removed.
        def by_hand():
            filing.build_gstr1(db_session, register, PERIOD)
            filing.validate_period(db_session, register, PERIOD)

        assert _invoice_reads(db_session, by_hand) == 3


class TestTheAnswerIsUnchanged:
    def test_a_gstr1_preview_matches_the_document_and_validation_built_separately(
        self, db_session, register
    ):
        built = filing.preview(db_session, register, PERIOD, ReturnType.GSTR1)

        assert built.document == filing.build_gstr1(db_session, register, PERIOD)
        assert (
            built.validation.as_dict()
            == filing.validate_period(db_session, register, PERIOD).as_dict()
        )
        assert built.period == PERIOD
        assert built.return_type == "gstr1"

    def test_a_gstr3b_preview_matches_the_document_and_validation_built_separately(
        self, db_session, register
    ):
        built = filing.preview(db_session, register, PERIOD, ReturnType.GSTR3B)

        assert built.document == filing.build_gstr3b(db_session, register, PERIOD)
        assert (
            built.validation.as_dict()
            == filing.validate_period(db_session, register, PERIOD).as_dict()
        )
        assert built.return_type == "gstr3b"

    def test_the_unreadable_invoice_is_out_of_the_document_and_in_the_validation(
        self, db_session, register
    ):
        # The shared list is the filable rows. A half that mistook it for
        # "every invoice in the period" would file a row of zeros, and a half
        # that never saw the unreadable one would call the period clean —
        # opposite failures that the same wrong list produces.
        built = filing.preview(db_session, register, PERIOD, ReturnType.GSTR1)
        numbers = {
            entry["inum"]
            for counterparty in built.document["b2b"]
            for entry in counterparty["inv"]
        }

        assert "INV-9999" not in numbers
        assert built.validation.invoice_count == 12
        assert any(
            issue.invoice_number == "INV-9999" for issue in built.validation.errors
        )
        assert not built.validation.ok


class TestTheRoutesAnswerFromIt:
    def test_the_gstr1_route_returns_the_document_with_its_validation(self, seeded_client):
        response = seeded_client.get(f"/api/v1/filing/gstr1?period={PERIOD}")

        assert response.status_code == 200
        body = response.json()
        assert body["period"] == PERIOD
        assert body["return_type"] == "gstr1"
        assert body["document"]["fp"] == "042026"
        assert body["validation"]["period"] == PERIOD
        # The pairing is the reason both travel in one response: the seeded
        # period holds a row that was never read, so this is a document a
        # caller must not be allowed to download without being told.
        assert body["validation"]["ok"] is False

    def test_the_gstr3b_route_returns_the_document_with_its_validation(self, seeded_client):
        response = seeded_client.get(f"/api/v1/filing/gstr3b?period={PERIOD}")

        assert response.status_code == 200
        body = response.json()
        assert body["return_type"] == "gstr3b"
        assert body["document"]["ret_period"] == "042026"
        assert body["validation"]["period"] == PERIOD
        assert body["validation"]["ok"] is False
