"""A DUPLICATE invoice must stay DUPLICATE unless its identity changes.

Reconciliation marks an invoice DUPLICATE when a normalized match finds
another row for the same counterparty and invoice number.  That verdict is
about who the supplier is and what number they gave it, not about the money
on the row.  Two paths used to silently un-duplicate an invoice, putting it
back into the filing pool where the supply was counted twice:

1. ``POST /{id}/reparse`` — re-runs extraction, blindly sets PROCESSING then
   PARSED. The database constraint only catches *exact* key collisions, not
   the normalised match reconciliation uses, so the row escapes.

2. ``PATCH /{id}`` with a money field — the withdrawal logic treated
   DUPLICATE like any other reconciliation verdict, withdrawing it to PARSED
   whenever a reconciled field changed. But the duplicate condition is about
   counterparty + number, not about money: editing ``taxable_value`` should
   not un-duplicate the row.

Both are now guarded.
"""
from __future__ import annotations

import pytest

from app.models.invoice import Invoice, InvoiceStatus
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE


def _invoice_text(number: str = "DUP-001") -> str:
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
Taxable Value:  100000.00
IGST @ 18%:      18000.00
Grand Total:    118000.00
"""


def _upload(client, text: str, *, name: str = "dup.txt"):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": "purchase"},
    )


@pytest.fixture()
def duplicate_invoice(auth_client, db_session, business):
    """A parsed invoice manually set to DUPLICATE, the way reconciliation does."""
    resp = _upload(auth_client, _invoice_text(), name="dup-original.txt")
    assert resp.status_code == 201, resp.text
    inv_id = resp.json()["invoice"]["id"]
    inv = db_session.get(Invoice, inv_id)
    inv.status = InvoiceStatus.DUPLICATE
    db_session.commit()
    db_session.refresh(inv)
    return inv


class TestReparseRefusesDuplicate:
    def test_reparse_on_a_duplicate_invoice_is_refused(self, auth_client, duplicate_invoice):
        resp = auth_client.post(f"/api/v1/invoices/{duplicate_invoice.id}/reparse")
        assert resp.status_code == 409

    def test_the_status_stays_duplicate(self, auth_client, db_session, duplicate_invoice):
        auth_client.post(f"/api/v1/invoices/{duplicate_invoice.id}/reparse")
        db_session.refresh(duplicate_invoice)
        assert duplicate_invoice.status == InvoiceStatus.DUPLICATE


class TestPatchMoneyFieldDoesNotUnDuplicate:
    def test_patching_taxable_value_keeps_duplicate(
        self, auth_client, db_session, duplicate_invoice,
    ):
        resp = auth_client.patch(
            f"/api/v1/invoices/{duplicate_invoice.id}",
            json={"taxable_value": "200000.00"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == InvoiceStatus.DUPLICATE.value

    def test_patching_igst_keeps_duplicate(self, auth_client, db_session, duplicate_invoice):
        resp = auth_client.patch(
            f"/api/v1/invoices/{duplicate_invoice.id}",
            json={"igst": "36000.00"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == InvoiceStatus.DUPLICATE.value

    def test_patching_invoice_date_keeps_duplicate(
        self, auth_client, db_session, duplicate_invoice,
    ):
        resp = auth_client.patch(
            f"/api/v1/invoices/{duplicate_invoice.id}",
            json={"invoice_date": "2026-05-01"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == InvoiceStatus.DUPLICATE.value


class TestPatchIdentityFieldWithdrawsDuplicate:
    def test_patching_invoice_number_withdraws_duplicate(
        self, auth_client, db_session, duplicate_invoice
    ):
        resp = auth_client.patch(
            f"/api/v1/invoices/{duplicate_invoice.id}",
            json={"invoice_number": "UNIQUE-999"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == InvoiceStatus.PARSED.value

    def test_patching_counterparty_gstin_withdraws_duplicate(
        self, auth_client, db_session, duplicate_invoice
    ):
        resp = auth_client.patch(
            f"/api/v1/invoices/{duplicate_invoice.id}",
            json={"counterparty_gstin": SUPPLIER_GSTIN_SAME_STATE},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == InvoiceStatus.PARSED.value
