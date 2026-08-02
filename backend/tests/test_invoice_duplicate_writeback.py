"""The duplicate that can only be found after the document has been read.

An invoice number is not known until the file is parsed, so the dedup check at
upload time can compare nothing but file hashes. A re-scan of the same paper
invoice, or the PDF alongside the photo of it, is a different file each time —
so the collision surfaces at the *write-back*, on the unique constraint over
(business, type, counterparty, number).

That used to escape `process_invoice`: the parse succeeded, the commit that
saved it did not, and the exception propagated out of a function documented as
never raising. On a worker that meant the row stayed PROCESSING with no reason
recorded, and Celery retried a permanent failure three times over three
minutes. The user watched a spinner that was never going to stop.

These tests are written against the second upload rather than against a forced
IntegrityError, because the point is that this is reachable by an ordinary user
doing an ordinary thing.
"""
from __future__ import annotations

import pytest

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import invoice_service
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE


def invoice_text(number: str = "INV-2026-0042", *, total: str = "531000.00") -> str:
    """One invoice, with the number and figures as parameters.

    Changing the number alone keeps the file hash different, which is exactly
    the case upload-time dedup cannot catch.
    """
    return f"""\
NORTHWIND SUPPLIES PRIVATE LIMITED
GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}
1st Floor, MG Road, Bengaluru, Karnataka 560001

TAX INVOICE

Invoice No: {number}
Invoice Date: 15/04/2026
Place of Supply: 27 Maharashtra

Bill To:
UMANG TRADERS
GSTIN: {BUSINESS_GSTIN}

HSN Code: 84713010
Taxable Value:  450000.00
IGST @ 18%:      81000.00
Grand Total:    {total}
"""


def upload(client, text: str, *, name: str):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": "purchase"},
    )


@pytest.fixture()
def first_invoice(auth_client):
    """One parsed purchase invoice, already on file."""
    response = upload(auth_client, invoice_text(), name="original.pdf.txt")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["invoice"]["status"] == InvoiceStatus.PARSED.value
    return body["invoice"]


class TestASecondCopyOfTheSameInvoice:
    """A different file carrying an invoice number already recorded."""

    @pytest.fixture()
    def second(self, auth_client, first_invoice):
        # A different total, so the bytes and therefore the hash differ — the
        # way a re-scan or a corrected copy would. Same invoice number.
        response = upload(
            auth_client,
            invoice_text(total="531000.50"),
            name="rescanned.txt",
        )
        assert response.status_code == 201, response.text
        return response.json()["invoice"]

    def test_the_upload_is_still_accepted(self, second):
        """Upload cannot know yet, so it must not pretend to."""
        assert second["id"]

    def test_it_does_not_get_stuck_in_processing(self, second):
        """The regression. PROCESSING means "a worker has it", and nothing
        was ever coming back for this row."""
        assert second["status"] != InvoiceStatus.PROCESSING.value

    def test_it_is_marked_failed(self, second):
        assert second["status"] == InvoiceStatus.FAILED.value

    def test_the_reason_names_the_invoice_it_repeats(self, second, first_invoice):
        """A constraint name is true and useless; the user needs to know which
        of the two documents to delete."""
        assert second["parse_error"]
        assert str(first_invoice["id"]) in second["parse_error"]
        assert "INV-2026-0042" in second["parse_error"]

    def test_the_reason_is_not_a_database_error(self, second):
        error = second["parse_error"].lower()
        for leak in ("integrityerror", "psycopg", "sqlalchemy", "constraint", "traceback"):
            assert leak not in error, f"{leak!r} leaked into a user-facing message"

    def test_the_original_is_left_alone(self, auth_client, first_invoice, second):
        """The rollback must not take the invoice that was already correct."""
        response = auth_client.get(f"/api/v1/invoices/{first_invoice['id']}")

        assert response.status_code == 200
        kept = response.json()
        assert kept["status"] == InvoiceStatus.PARSED.value
        assert kept["invoice_number"] == "INV-2026-0042"
        assert kept["parse_error"] is None

    def test_only_one_invoice_holds_the_number(self, db_session, business, second):
        """The half-written row must not have landed."""
        rows = (
            db_session.query(Invoice)
            .filter_by(
                business_id=business.id,
                invoice_type=InvoiceType.PURCHASE,
                invoice_number="INV-2026-0042",
            )
            .all()
        )

        assert len(rows) == 1


class TestTheSessionSurvivesIt:
    """A failed flush poisons the session: nothing else commits until it is
    rolled back. The worker reuses its session for the rest of the task, so
    this is the difference between one bad invoice and a stuck worker."""

    def test_the_service_returns_rather_than_raising(self, db_session, business, auth_client):
        """`process_invoice` is documented as never raising, and the worker's
        retry logic depends on that being true."""
        upload(auth_client, invoice_text(), name="first.txt")
        second = upload(auth_client, invoice_text(total="1.00"), name="second.txt")

        assert second.status_code == 201

    def test_the_next_invoice_still_parses(self, auth_client, first_invoice):
        """The collision must not leave the connection unable to write."""
        upload(auth_client, invoice_text(total="531000.50"), name="dupe.txt")

        third = upload(auth_client, invoice_text(number="INV-2026-0043"), name="third.txt")

        assert third.status_code == 201, third.text
        assert third.json()["invoice"]["status"] == InvoiceStatus.PARSED.value
        assert third.json()["invoice"]["invoice_number"] == "INV-2026-0043"

    def test_a_write_after_the_failure_commits(self, auth_client, db_session, first_invoice):
        """The proof that the rollback happened: an unrelated write goes
        through on the same session afterwards."""
        upload(auth_client, invoice_text(total="531000.50"), name="dupe.txt")

        response = auth_client.patch(
            f"/api/v1/invoices/{first_invoice['id']}",
            json={"counterparty_name": "Northwind Supplies Pvt Ltd"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["counterparty_name"] == "Northwind Supplies Pvt Ltd"


class TestTheSameNumberIsAllowedWhereItShouldBe:
    """The constraint is scoped, and the failure path must not over-reach."""

    def test_a_sales_invoice_may_reuse_a_purchase_number(self, auth_client, first_invoice):
        """Different direction, different counterparty column — two unrelated
        businesses numbering their own invoices the same way is normal.

        The figures differ so the bytes do: an identical file is refused by the
        hash check at upload, which is a different rule and not the one under
        test here.
        """
        response = auth_client.post(
            "/api/v1/invoices/upload",
            files={
                "file": ("sale.txt", invoice_text(total="531000.75").encode(), "text/plain")
            },
            data={"invoice_type": "sales"},
        )

        assert response.status_code == 201, response.text
        assert response.json()["invoice"]["status"] == InvoiceStatus.PARSED.value

    def test_another_tenant_may_use_the_same_number(self, client, other_tenant, first_invoice):
        """The constraint is per business. A supplier sends the same invoice
        number to every one of their customers."""
        response = client.post(
            "/api/v1/invoices/upload",
            files={"file": ("theirs.txt", invoice_text().encode(), "text/plain")},
            data={"invoice_type": "purchase"},
            headers={"Authorization": f"Bearer {other_tenant}"},
        )

        assert response.status_code == 201, response.text
        assert response.json()["invoice"]["status"] == InvoiceStatus.PARSED.value


def test_the_message_stands_alone_when_the_original_cannot_be_found(monkeypatch):
    """The lookup after the rollback is a second query and can come back empty
    — a soft delete between the two, say. The row still needs a reason."""
    assert invoice_service._duplicate_message("INV-1", None) == "Invoice INV-1 is already on file."
    assert invoice_service._duplicate_message(None, None) == "This invoice is already on file."
