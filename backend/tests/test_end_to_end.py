"""The product, driven the way a business drives it, over HTTP only.

Every other file in this suite tests one layer. This one tests the seams
between them, which is where the bugs that reach users actually live: an
invoice whose extracted period does not match the period the 2B import
derived, a reconciliation run whose ITC figure the summary endpoint recomputes
differently, an export that disagrees with the preview the user just approved.
Each of those passes every unit test on both sides of the seam.

So nothing here reaches into the database or calls a service directly. A
journey is a sequence of requests, each one using an id or a period that came
out of the previous response, and the assertions are on the handoffs rather
than on arithmetic that ``test_reconciliation.py`` and ``test_itc.py`` already
own.

The model is stubbed rather than absent (see ``stub_openrouter``): a
production deployment has ``OPENROUTER_API_KEY`` set, so the extraction path
these journeys run through is the one the server runs. ``CELERY_ENABLED`` is
false in this suite, so the parse that the worker would do happens inline —
which is the same code, called from the same place, and is exactly what the
API does when the broker is unreachable.
"""
from __future__ import annotations

import csv
import io
import json
from decimal import Decimal

import pytest

from tests.conftest import (
    BUSINESS_GSTIN,
    SUPPLIER_GSTIN_OTHER_STATE,
    SUPPLIER_GSTIN_SAME_STATE,
    TEST_EMAIL,
    TEST_PASSWORD,
)

PERIOD = "2026-04"

# ---------------------------------------------------------------------------
# The two documents every journey below is built from
# ---------------------------------------------------------------------------

# Inter-state purchase: Karnataka supplier, Maharashtra buyer, so the credit
# is IGST and the intra-state split never applies.
PURCHASE_TEXT = f"""\
NORTHWIND SUPPLIES PRIVATE LIMITED
GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}
MG Road, Bengaluru, Karnataka 560001

TAX INVOICE

Invoice No: INV-2026-0042
Invoice Date: 15/04/2026
Place of Supply: 27 Maharashtra

Bill To: UMANG TRADERS
GSTIN: {BUSINESS_GSTIN}

HSN Code: 84713010
Laptop computers   10 x 45,000.00 = 450,000.00

Taxable Value:  450000.00
IGST @ 18%:      81000.00
Grand Total:    531000.00
"""

PURCHASE_EXTRACTION = {
    "supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE,
    "supplier_name": "Northwind Supplies Private Limited",
    "buyer_gstin": BUSINESS_GSTIN,
    "invoice_number": "INV-2026-0042",
    "invoice_date": "2026-04-15",
    "place_of_supply": "27",
    "hsn_code": "84713010",
    "taxable_value": 450000,
    "cgst": 0,
    "sgst": 0,
    "igst": 81000,
    "cess": 0,
    "total_value": 531000,
    "tax_rate": 18,
    "confidence": 0.95,
}

# Intra-state sale: both parties in Maharashtra, so the liability splits into
# CGST and SGST — and the set-off below has to consume the IGST credit from
# the purchase across both heads in the statutory order.
SALES_TEXT = f"""\
UMANG TRADERS PRIVATE LIMITED
GSTIN: {BUSINESS_GSTIN}
Andheri East, Mumbai, Maharashtra 400069

TAX INVOICE

Invoice No: UT/2026/0101
Invoice Date: 22/04/2026
Place of Supply: 27 Maharashtra

Bill To: MEHTA ELECTRICALS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}

HSN Code: 85044090
Power adapters   400 x 500.00 = 200,000.00

Taxable Value:  200000.00
CGST @ 9%:       18000.00
SGST @ 9%:       18000.00
Grand Total:    236000.00
"""

SALES_EXTRACTION = {
    "supplier_gstin": BUSINESS_GSTIN,
    "supplier_name": "Umang Traders Private Limited",
    "buyer_gstin": SUPPLIER_GSTIN_SAME_STATE,
    "buyer_name": "Mehta Electricals",
    "invoice_number": "UT/2026/0101",
    "invoice_date": "2026-04-22",
    "place_of_supply": "27",
    "hsn_code": "85044090",
    "taxable_value": 200000,
    "cgst": 18000,
    "sgst": 18000,
    "igst": 0,
    "cess": 0,
    "total_value": 236000,
    "tax_rate": 18,
    "confidence": 0.93,
}


def portal_2b(*, include_the_purchase: bool = True) -> bytes:
    """The GSTR-2B the portal would hand back for April 2026.

    ``include_the_purchase=False`` is the case the whole product exists for:
    the business has the invoice and the supplier never declared it, so the
    credit is at risk.
    """
    suppliers = []
    if include_the_purchase:
        suppliers.append(
            {
                "ctin": SUPPLIER_GSTIN_OTHER_STATE,
                "trdnm": "Northwind Supplies",
                "inv": [
                    {
                        "inum": "INV-2026-0042",
                        "dt": "15-04-2026",
                        "val": 531000.00,
                        "itcavl": "Y",
                        "items": [{"rt": 18, "txval": 450000.00, "igst": 81000.00}],
                    }
                ],
            }
        )
    else:
        # A different supplier's invoice, so the file is a valid 2B with
        # content rather than an empty one the import would refuse.
        suppliers.append(
            {
                "ctin": SUPPLIER_GSTIN_SAME_STATE,
                "trdnm": "Mehta Electricals",
                "inv": [
                    {
                        "inum": "ME/771",
                        "dt": "09-04-2026",
                        "val": 11800.00,
                        "itcavl": "Y",
                        "items": [
                            {"rt": 18, "txval": 10000.00, "cgst": 900.00, "sgst": 900.00}
                        ],
                    }
                ],
            }
        )

    return json.dumps(
        {"data": {"rtnprd": "042026", "docdata": {"b2b": suppliers}}}
    ).encode()


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------

def register(client) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "gstin": BUSINESS_GSTIN,
            "legal_name": "Umang Traders Private Limited",
            "trade_name": "Umang Traders",
            "full_name": "Umang Shah",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def upload(client, model, *, text: str, extraction: dict, invoice_type: str, name: str) -> dict:
    """Upload one document and return the invoice row the API answered with."""
    model.clear()
    model.update(extraction)
    response = client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, io.BytesIO(text.encode()), "text/plain")},
        data={"invoice_type": invoice_type},
    )
    assert response.status_code == 201, response.text
    return response.json()["invoice"]


def import_2b(client, content: bytes) -> dict:
    response = client.post(
        "/api/v1/reconciliation/gstr2b/import",
        files={"file": ("gstr2b.json", content, "application/json")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def reconcile(client, period: str) -> dict:
    response = client.post("/api/v1/reconciliation/run", json={"period": period})
    assert response.status_code == 201, response.text
    return response.json()


def money(value) -> Decimal:
    return Decimal(str(value))


@pytest.fixture()
def signed_in(client):
    """A client carrying a fresh business's bearer token.

    Deliberately not ``auth_client``: a journey starts before the account
    exists, and the sign-up is one of the steps under test.
    """
    client.headers.update({"Authorization": f"Bearer {register(client)}"})
    return client


# ---------------------------------------------------------------------------
# The path the product is for
# ---------------------------------------------------------------------------

class TestABusinessSignsUpAndFilesItsFirstReturn:
    def test_the_whole_journey(self, client, stub_openrouter):
        # --- Before there is an account -----------------------------------
        assert client.get("/api/v1/health/live").json()["status"] == "alive"
        assert client.get("/api/v1/health/ready").status_code == 200

        # The sign-up form validates the GSTIN before it will submit, and it
        # has no token to do it with.
        lookup = client.get(f"/api/v1/meta/gstin/{BUSINESS_GSTIN}")
        assert lookup.status_code == 200
        assert lookup.json() == {
            "gstin": BUSINESS_GSTIN,
            "valid": True,
            "state_code": "27",
            "state_name": "Maharashtra",
            "pan": BUSINESS_GSTIN[2:12],
        }

        # --- Sign up ------------------------------------------------------
        token = register(client)
        client.headers.update({"Authorization": f"Bearer {token}"})

        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["business"]["gstin"] == BUSINESS_GSTIN
        # Registration returns a usable token, so there is no second login
        # round trip — but logging in again must produce one that works too.
        # Form-encoded, not JSON: the endpoint is the OAuth2 password flow,
        # which is what puts the Authorize button in the docs.
        again = client.post(
            "/api/v1/auth/login",
            data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert again.status_code == 200
        assert (
            client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {again.json()['access_token']}"},
            ).status_code
            == 200
        )

        # --- Upload the month's documents ---------------------------------
        purchase = upload(
            client,
            stub_openrouter,
            text=PURCHASE_TEXT,
            extraction=PURCHASE_EXTRACTION,
            invoice_type="purchase",
            name="northwind-0042.txt",
        )
        assert purchase["status"] == "parsed"
        assert purchase["counterparty_gstin"] == SUPPLIER_GSTIN_OTHER_STATE
        # The period is derived from the invoice date, and every later step
        # keys off it. This is the handoff the rest of the journey rests on.
        assert purchase["period"] == PERIOD
        assert money(purchase["igst"]) == Decimal("81000.00")

        sale = upload(
            client,
            stub_openrouter,
            text=SALES_TEXT,
            extraction=SALES_EXTRACTION,
            invoice_type="sales",
            name="ut-0101.txt",
        )
        assert sale["status"] == "parsed"
        assert sale["period"] == PERIOD
        assert money(sale["cgst"]) == money(sale["sgst"]) == Decimal("18000.00")

        listed = client.get("/api/v1/invoices", params={"period": PERIOD})
        assert listed.status_code == 200
        assert {row["id"] for row in listed.json()["items"]} == {purchase["id"], sale["id"]}

        # --- Import the portal's 2B and reconcile -------------------------
        imported = import_2b(client, portal_2b())
        # The period the import derived from the file, not one the client
        # supplied: a mismatch here is how a month reconciles against the
        # wrong statement and reports everything missing.
        assert imported["period"] == PERIOD
        assert imported["invoice_count"] == 1

        run = reconcile(client, PERIOD)
        assert run["status"] == "completed"
        assert run["matched_count"] == 1
        assert run["missing_in_2b_count"] == 0
        assert run["mismatched_count"] == 0
        assert money(run["itc_at_risk"]) == Decimal("0.00")

        # The run is retrievable afterwards by id and as "the latest for this
        # period" — the two ways the UI reaches it.
        by_id = client.get(f"/api/v1/reconciliation/{run['id']}")
        assert by_id.status_code == 200
        latest = client.get("/api/v1/reconciliation/latest", params={"period": PERIOD})
        assert latest.status_code == 200
        assert latest.json()["id"] == run["id"]

        # --- What credit is actually safe to claim ------------------------
        itc = client.get("/api/v1/itc", params={"period": PERIOD}).json()
        assert itc["reconciled"] is True
        assert money(itc["available"]["igst"]) == Decimal("81000.00")
        assert money(itc["itc_at_risk"]) == Decimal("0.00")
        assert money(itc["output_tax"]["cgst"]) == Decimal("18000.00")
        assert money(itc["output_tax"]["sgst"]) == Decimal("18000.00")

        # The point of the whole month: ₹81,000 of IGST credit against
        # ₹36,000 of CGST+SGST liability leaves nothing to pay in cash.
        set_off = itc["set_off"]
        assert money(set_off["total_cash"]) == Decimal("0.00")
        assert money(set_off["credit_carried_forward"]["total"]) == Decimal("45000.00")

        # --- The supplier this created ------------------------------------
        suppliers = client.get("/api/v1/suppliers").json()
        assert [s["gstin"] for s in suppliers["items"]] == [SUPPLIER_GSTIN_OTHER_STATE]
        supplier = suppliers["items"][0]
        assert supplier["risk_level"] == "low"

        detail = client.get(f"/api/v1/suppliers/{supplier['id']}", params={"period": PERIOD})
        assert detail.status_code == 200
        assert detail.json()["gstin"] == SUPPLIER_GSTIN_OTHER_STATE

        # --- File ---------------------------------------------------------
        validation = client.get(
            "/api/v1/filing/validate", params={"period": PERIOD, "invoice_type": "sales"}
        ).json()
        assert validation["period"] == PERIOD
        assert validation["error_count"] == 0
        assert validation["ok"] is True

        gstr1 = client.get("/api/v1/filing/gstr1", params={"period": PERIOD}).json()
        assert gstr1["validation"]["ok"] is True
        assert gstr1["document"]["gstin"] == BUSINESS_GSTIN
        assert gstr1["document"]["fp"] == "042026"
        b2b_counterparties = {block["ctin"] for block in gstr1["document"]["b2b"]}
        assert b2b_counterparties == {SUPPLIER_GSTIN_SAME_STATE}

        gstr3b = client.get("/api/v1/filing/gstr3b", params={"period": PERIOD}).json()
        assert gstr3b["document"]["gstin"] == BUSINESS_GSTIN
        assert gstr3b["document"]["ret_period"] == "042026"

        # --- Download it --------------------------------------------------
        export = client.get("/api/v1/filing/export/gstr1.json", params={"period": PERIOD})
        assert export.status_code == 200
        assert "attachment" in export.headers["content-disposition"]
        assert BUSINESS_GSTIN in export.headers["content-disposition"]
        # Byte-for-byte the document the preview showed. A user approves the
        # preview and files the download; if they can differ, the approval
        # was of something else.
        assert json.loads(export.content) == gstr1["document"]

        # --- The screen they land on next month ---------------------------
        dashboard = client.get("/api/v1/dashboard", params={"period": PERIOD}).json()
        assert dashboard["period"] == PERIOD
        assert dashboard["counts"]["total"] == 2
        assert dashboard["counts"]["sales"] == dashboard["counts"]["purchase"] == 1
        assert money(dashboard["purchase"]["igst"]) == Decimal("81000.00")
        assert money(dashboard["sales"]["cgst"]) == Decimal("18000.00")
        assert dashboard["last_reconciliation"]["id"] == run["id"]
        assert dashboard["last_reconciliation"]["matched"] == 1
        assert money(dashboard["itc_at_risk"]) == Decimal("0.00")
        assert dashboard["business_gstin"] == BUSINESS_GSTIN


# ---------------------------------------------------------------------------
# The path the product is actually for
# ---------------------------------------------------------------------------

class TestASupplierWhoDidNotFile:
    """The invoice is in the books and not in the portal's 2B.

    This is the leak GSTBot exists to find, and it has to be visible from
    every screen a user might be on — not only from the reconciliation report
    that discovered it.
    """

    def test_the_risk_reaches_every_screen(self, client, stub_openrouter):
        client.headers.update({"Authorization": f"Bearer {register(client)}"})
        purchase = upload(
            client,
            stub_openrouter,
            text=PURCHASE_TEXT,
            extraction=PURCHASE_EXTRACTION,
            invoice_type="purchase",
            name="northwind-0042.txt",
        )

        import_2b(client, portal_2b(include_the_purchase=False))
        run = reconcile(client, PERIOD)

        assert run["matched_count"] == 0
        assert run["missing_in_2b_count"] == 1
        assert money(run["itc_at_risk"]) == Decimal("81000.00")

        # The finding names the invoice, not just a count — the user has to
        # be able to go and chase this specific supplier.
        detail = client.get(f"/api/v1/reconciliation/{run['id']}").json()
        findings = detail["report"]["findings"]
        at_risk = [f for f in findings if f["category"] == "missing_in_2b"]
        assert len(at_risk) == 1
        assert at_risk[0]["invoice_number"] == purchase["invoice_number"]

        itc = client.get("/api/v1/itc", params={"period": PERIOD}).json()
        assert money(itc["itc_at_risk"]) == Decimal("81000.00")

        dashboard = client.get("/api/v1/dashboard", params={"period": PERIOD}).json()
        assert money(dashboard["itc_at_risk"]) == Decimal("81000.00")

        # And the supplier carries it, so the next purchase from them is a
        # decision made with this in hand.
        supplier = client.get("/api/v1/suppliers").json()["items"][0]
        assert supplier["gstin"] == SUPPLIER_GSTIN_OTHER_STATE
        assert supplier["risk_level"] in {"medium", "high"}
        assert supplier["compliance_score"] < 100

    def test_the_credit_appears_when_the_supplier_files_late(self, client, stub_openrouter):
        """Re-importing a corrected 2B must move the credit, not double it.

        Runs accumulate rather than overwrite, so this is the case where a
        second run over the same period has to supersede the first one's
        conclusion while leaving its record intact.
        """
        client.headers.update({"Authorization": f"Bearer {register(client)}"})
        upload(
            client,
            stub_openrouter,
            text=PURCHASE_TEXT,
            extraction=PURCHASE_EXTRACTION,
            invoice_type="purchase",
            name="northwind-0042.txt",
        )

        import_2b(client, portal_2b(include_the_purchase=False))
        first = reconcile(client, PERIOD)
        assert money(first["itc_at_risk"]) == Decimal("81000.00")

        # The supplier files. The portal now has the invoice.
        again = import_2b(client, portal_2b())
        assert again["replaced_previous"] is True

        second = reconcile(client, PERIOD)
        assert second["id"] != first["id"]
        assert second["matched_count"] == 1
        assert money(second["itc_at_risk"]) == Decimal("0.00")

        # Both runs are still on file — "what did we know, and when" is the
        # question an ITC reversal turns on months later.
        history = client.get("/api/v1/reconciliation", params={"period": PERIOD}).json()
        assert [row["id"] for row in history["items"]] == [second["id"], first["id"]]

        # And the latest is what every other screen now reads.
        assert money(
            client.get("/api/v1/itc", params={"period": PERIOD}).json()["itc_at_risk"]
        ) == Decimal("0.00")


# ---------------------------------------------------------------------------
# Two businesses on one deployment
# ---------------------------------------------------------------------------

class TestASaleTheExtractorCouldNotPlace:
    """The one blocking error a reviewer fixes by typing, start to finish.

    "Place of supply is missing and cannot be derived from a GSTIN" is raised
    per invoice and blocks the whole period, and it is the only error on that
    list with no second source to fall back on: a B2B sale gets the state off
    the buyer's GSTIN, and a B2C one has nothing. So this is the loop the
    invoice screen's place-of-supply field exists to close — validate, correct,
    validate again, file — and it crosses three modules that are otherwise
    tested apart.

    What makes it worth a journey rather than a unit test is what the export
    does *while* the period is blocked. ``gstr1`` does not refuse an invoice it
    cannot place; it falls back to the business's own state, so an unfixed sale
    is not missing from the return — it is in it, declared in the wrong state,
    under a heading that contradicts its own tax. The error is the only thing
    standing between that and the portal.
    """

    # Its own document rather than ``SALES_TEXT``: the parser fills anything
    # the model left out from what it can read off the page, so an extraction
    # claiming no CGST over a page printing some comes back with the page's
    # figures and three validation errors instead of the one under test.
    UNPLACEABLE_TEXT = f"""\
UMANG TRADERS PRIVATE LIMITED
GSTIN: {BUSINESS_GSTIN}
Andheri East, Mumbai, Maharashtra 400069

TAX INVOICE

Invoice No: UT/2026/0102
Invoice Date: 24/04/2026

Bill To: Cash sale

HSN Code: 85044090
Power adapters   600 x 500.00 = 300,000.00

Taxable Value:  300000.00
IGST @ 18%:      54000.00
Grand Total:    354000.00
"""

    # No buyer GSTIN, so there is no state to derive: an over-the-counter sale
    # to an unregistered customer. Inter-state, and above the B2CL threshold,
    # so where it lands in the return turns entirely on the missing field.
    UNPLACEABLE_SALE = {
        "supplier_gstin": BUSINESS_GSTIN,
        "supplier_name": "Umang Traders Private Limited",
        "buyer_gstin": None,
        "buyer_name": "Walk-in customer",
        "invoice_number": "UT/2026/0102",
        "invoice_date": "2026-04-24",
        "place_of_supply": None,
        "hsn_code": "85044090",
        "taxable_value": 300000,
        "cgst": 0,
        "sgst": 0,
        "igst": 54000,
        "cess": 0,
        "total_value": 354000,
        "tax_rate": 18,
        "confidence": 0.71,
    }

    def sale(self, client, model) -> dict:
        return upload(
            client,
            model,
            text=self.UNPLACEABLE_TEXT,
            extraction=self.UNPLACEABLE_SALE,
            invoice_type="sales",
            name="ut-2026-0102.txt",
        )

    def test_the_period_is_blocked_until_the_sale_is_placed(self, signed_in, stub_openrouter):
        sale = self.sale(signed_in, stub_openrouter)
        assert sale["place_of_supply"] is None

        blocked = signed_in.get(
            "/api/v1/filing/validate", params={"period": PERIOD, "invoice_type": "sales"}
        ).json()
        assert blocked["ok"] is False
        assert blocked["error_count"] == 1
        [issue] = [i for i in blocked["issues"] if i["severity"] == "error"]
        assert issue["field"] == "place_of_supply"
        # Named, not counted. The reviewer has to be able to open the one
        # invoice out of the month's sales that is holding the return up.
        assert issue["invoice_id"] == sale["id"]
        assert issue["invoice_number"] == "UT/2026/0102"

        # --- Correct it, which is the only fix there is -------------------
        patched = signed_in.patch(
            f"/api/v1/invoices/{sale['id']}", json={"place_of_supply": "29"}
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["place_of_supply"] == "29"

        cleared = signed_in.get(
            "/api/v1/filing/validate", params={"period": PERIOD, "invoice_type": "sales"}
        ).json()
        assert cleared["ok"] is True
        assert cleared["error_count"] == 0

    def test_the_corrected_state_is_what_the_return_declares(
        self, signed_in, stub_openrouter
    ):
        """The correction has to reach ``pos``, not just clear the error."""
        sale = self.sale(signed_in, stub_openrouter)

        # Before: placed in the seller's own state by the fallback, which puts
        # a ₹3.54 lakh inter-state supply into the summary block for small
        # local ones — carrying IGST under a heading that says INTRA.
        before = signed_in.get("/api/v1/filing/gstr1", params={"period": PERIOD}).json()
        assert before["validation"]["ok"] is False
        # An empty block is left out of the document rather than sent empty,
        # so "not in b2cl" is spelt as the key being absent.
        assert "b2cl" not in before["document"]
        [misplaced] = before["document"]["b2cs"]
        assert misplaced["pos"] == "27"
        assert misplaced["sply_ty"] == "INTRA"
        assert money(misplaced["iamt"]) == Decimal("54000.00")

        signed_in.patch(f"/api/v1/invoices/{sale['id']}", json={"place_of_supply": "29"})

        after = signed_in.get("/api/v1/filing/gstr1", params={"period": PERIOD}).json()
        assert after["validation"]["ok"] is True
        # Now an inter-state supply above the threshold: listed invoice by
        # invoice under Karnataka rather than summarised under Maharashtra.
        assert "b2cs" not in after["document"]
        [block] = after["document"]["b2cl"]
        assert block["pos"] == "29"
        assert [inv["inum"] for inv in block["inv"]] == ["UT/2026/0102"]

        # And the file a user downloads is that document, not a second render
        # of it from the pre-correction state.
        export = signed_in.get("/api/v1/filing/export/gstr1.json", params={"period": PERIOD})
        assert json.loads(export.content) == after["document"]

    def test_a_state_code_the_council_never_issued_is_refused(self, signed_in, stub_openrouter):
        """The picker cannot send this; a script and a stale client can.

        Worth refusing at the API rather than only in the form, because the
        portal rejects the whole return over one bad ``pos`` — there is no
        partial acceptance to fall back on.
        """
        sale = self.sale(signed_in, stub_openrouter)

        response = signed_in.patch(
            f"/api/v1/invoices/{sale['id']}", json={"place_of_supply": "45"}
        )

        assert response.status_code == 422
        assert "45" in response.text


class TestOneTenantsJourneyIsInvisibleToAnother:
    def test_no_read_endpoint_leaks_across_the_boundary(self, client, stub_openrouter):
        # Tenant A does the whole journey.
        client.headers.update({"Authorization": f"Bearer {register(client)}"})
        purchase = upload(
            client,
            stub_openrouter,
            text=PURCHASE_TEXT,
            extraction=PURCHASE_EXTRACTION,
            invoice_type="purchase",
            name="northwind-0042.txt",
        )
        import_2b(client, portal_2b())
        run = reconcile(client, PERIOD)
        supplier_id = client.get("/api/v1/suppliers").json()["items"][0]["id"]

        # Tenant B signs up on the same deployment.
        other = client.post(
            "/api/v1/auth/register",
            json={
                "email": "rival@example.com",
                "password": "anothersecret123",
                "gstin": SUPPLIER_GSTIN_SAME_STATE,
                "legal_name": "Mehta Electricals",
            },
        )
        assert other.status_code == 201, other.text
        client.headers.update(
            {"Authorization": f"Bearer {other.json()['access_token']}"}
        )

        # Nothing of A's is listed.
        assert client.get("/api/v1/invoices").json()["items"] == []
        assert client.get("/api/v1/suppliers").json()["items"] == []
        assert client.get("/api/v1/reconciliation").json()["items"] == []
        empty = client.get("/api/v1/dashboard", params={"period": PERIOD}).json()
        assert empty["counts"]["total"] == 0
        assert empty["last_reconciliation"] is None

        # And nothing of A's is reachable by id. 404 rather than 403 on every
        # one of them: a 403 confirms the row exists, which is enough to probe
        # a competitor's invoice volume by walking the ids.
        for path in (
            f"/api/v1/invoices/{purchase['id']}",
            f"/api/v1/reconciliation/{run['id']}",
            f"/api/v1/suppliers/{supplier_id}",
        ):
            assert client.get(path).status_code == 404, path

        # Including the writes.
        assert client.patch(
            f"/api/v1/invoices/{purchase['id']}", json={"invoice_number": "STOLEN-1"}
        ).status_code == 404
        assert client.delete(f"/api/v1/invoices/{purchase['id']}").status_code == 404

        # B's own 2B import for the same period does not see A's statement.
        assert client.get("/api/v1/reconciliation/gstr2b/periods").json() == []
        assert (
            client.post("/api/v1/reconciliation/run", json={"period": PERIOD}).status_code
            == 409
        )


# ---------------------------------------------------------------------------
# What the user downloads
# ---------------------------------------------------------------------------

class TestTheExportsAUserActuallyOpens:
    @pytest.fixture()
    def filed(self, client, stub_openrouter):
        client.headers.update({"Authorization": f"Bearer {register(client)}"})
        upload(
            client,
            stub_openrouter,
            text=PURCHASE_TEXT,
            extraction=PURCHASE_EXTRACTION,
            invoice_type="purchase",
            name="northwind-0042.txt",
        )
        upload(
            client,
            stub_openrouter,
            text=SALES_TEXT,
            extraction=SALES_EXTRACTION,
            invoice_type="sales",
            name="ut-0101.txt",
        )
        import_2b(client, portal_2b())
        reconcile(client, PERIOD)
        return client

    @pytest.mark.parametrize("return_type", ["gstr1", "gstr3b"])
    def test_the_json_download_is_the_preview_verbatim(self, filed, return_type):
        preview = filed.get(f"/api/v1/filing/{return_type}", params={"period": PERIOD})
        download = filed.get(
            f"/api/v1/filing/export/{return_type}.json", params={"period": PERIOD}
        )

        assert download.status_code == 200
        assert json.loads(download.content) == preview.json()["document"]

    @pytest.mark.parametrize("return_type", ["gstr1", "gstr3b", "purchases"])
    def test_the_csv_download_opens_in_a_spreadsheet(self, filed, return_type):
        response = filed.get(
            f"/api/v1/filing/export/{return_type}.csv", params={"period": PERIOD}
        )
        assert response.status_code == 200

        body = response.content.decode("utf-8")
        # Excel reads a plain UTF-8 CSV as Latin-1 and mangles every trade
        # name with a rupee sign in it, so the BOM is load-bearing.
        assert body.startswith("﻿")

        rows = list(csv.reader(io.StringIO(body.lstrip("﻿"))))
        assert len(rows) >= 2, "a header and at least one invoice"
        assert all(len(row) == len(rows[0]) for row in rows), "ragged CSV"

    def test_a_purchase_register_has_no_portal_json_shape(self, filed):
        # The government's offline utility has no import for this; offering a
        # .json would produce a file that only looks like it can be filed.
        assert (
            filed.get(
                "/api/v1/filing/export/purchases.json", params={"period": PERIOD}
            ).status_code
            == 400
        )


# ---------------------------------------------------------------------------
# The request as an operator sees it
# ---------------------------------------------------------------------------

class TestOneRequestIsTraceableEndToEnd:
    def test_the_id_a_user_reports_is_the_id_on_every_response(self, client, stub_openrouter):
        client.headers.update({"Authorization": f"Bearer {register(client)}"})

        # An id supplied by the caller survives, so a trace that starts in the
        # frontend or at Caddy stays one trace through the upload and the
        # parse it triggers.
        supplied = "e2e0000000000001"
        stub_openrouter.update(PURCHASE_EXTRACTION)
        response = client.post(
            "/api/v1/invoices/upload",
            files={"file": ("northwind.txt", io.BytesIO(PURCHASE_TEXT.encode()), "text/plain")},
            data={"invoice_type": "purchase"},
            headers={"X-Request-ID": supplied},
        )

        assert response.status_code == 201
        assert response.headers["X-Request-ID"] == supplied
        assert response.headers["X-Correlation-ID"] == supplied

    def test_a_failure_carries_the_same_id_into_the_body(self, client):
        client.headers.update({"Authorization": f"Bearer {register(client)}"})

        response = client.get("/api/v1/invoices/999999")

        assert response.status_code == 404
        body = response.json()
        # Support gets a screenshot; this is what turns it into a log query.
        assert body["correlation_id"] == response.headers["X-Request-ID"]
        assert body["error"]["code"] == "not_found"
