"""GSTR-2B files that are not the file the happy path assumes.

tests/test_gstr2b.py reads a well-formed portal download. This covers what
arrives instead: exports whose period is written the other way round, sections
holding nulls where objects were promised, CSVs with no headings, and the
question of what period a statement belongs to when nothing in it says.

The reason these matter more than usual is that a 2B is the *authority* in
reconciliation — it is what the tenant's own books are judged against. A file
half-read is worse than a file rejected, because the invoices it silently
dropped come back as "missing from the portal", which reads as a supplier who
failed to file and is the finding an accountant acts on.
"""
from __future__ import annotations

import json

import pytest

from app.services import gstr2b
from app.services.gstr2b import GSTR2BParseError, parse_csv, parse_json, period_from_portal
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE
from tests.test_gstr2b import portal_json
from tests.test_reconciliation import PERIOD, upload_2b

# --------------------------------------------------------------------------
# The portal's flags and periods
# --------------------------------------------------------------------------

class TestTheYesNoFlags:
    """`itcavl` and `rev` decide whether credit is claimable at all."""

    def test_a_real_boolean_from_a_json_export_is_used_as_is(self):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"][0]["itcavl"] = False
        assert gstr2b.parse_json(payload)[0].itc_available is False

    @pytest.mark.parametrize("raw", ["Y", "yes", "TRUE", "1", " y "])
    def test_the_spellings_an_export_uses_for_yes(self, raw):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"][0]["itcavl"] = raw
        assert gstr2b.parse_json(payload)[0].itc_available is True

    @pytest.mark.parametrize("raw", ["N", "no", "FALSE", "0"])
    def test_the_spellings_an_export_uses_for_no(self, raw):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"][0]["itcavl"] = raw
        assert gstr2b.parse_json(payload)[0].itc_available is False

    def test_an_unrecognised_word_falls_back_rather_than_guessing(self):
        # "Available"/"Blocked" style text from a hand-edited export. Guessing
        # wrong here either invents credit or destroys it, so the field's
        # documented default is what stands.
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"][0]["itcavl"] = "Partially"
        assert gstr2b.parse_json(payload)[0].itc_available is True

    def test_reverse_charge_defaults_to_off_when_the_word_is_unrecognised(self):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"][0]["rev"] = "maybe"
        assert gstr2b.parse_json(payload)[0].reverse_charge is False


class TestPeriodFormats:
    def test_the_portals_mmyyyy_is_converted(self):
        assert period_from_portal("042026") == "2026-04"

    def test_an_export_that_writes_yyyymm_instead_is_still_read(self):
        # Both are six digits, so the only way to tell them apart is that one
        # of the two readings has a month in 1..12. 202604 has no month 26.
        assert period_from_portal("202604") == "2026-04"

    def test_a_period_already_in_the_internal_form_passes_through(self):
        assert period_from_portal("2026-04") == "2026-04"

    @pytest.mark.parametrize("raw", ["", None, "13-2026", "2026", "abcdef", "992026", "20261"])
    def test_anything_unreadable_becomes_none_rather_than_a_wrong_month(self, raw):
        assert period_from_portal(raw) is None

    def test_an_ambiguous_six_digits_prefers_the_portals_own_convention(self):
        # 012026 reads as MMYYYY (Jan 2026) and as YYYYMM only if year 0120.
        # MMYYYY is what the portal emits, so it wins.
        assert period_from_portal("012026") == "2026-01"

    # The YYYYMM fallback has its own 1..12 test, and the cases above only
    # reach it with a month of 04 — comfortably inside the range. Both ends of
    # a filing year go down this branch in practice: an annual export names
    # January and March, and a quarterly filer's is December.
    @pytest.mark.parametrize(
        "raw,period",
        [("202601", "2026-01"), ("202612", "2026-12"), ("202603", "2026-03")],
    )
    def test_the_yyyymm_fallback_accepts_both_ends_of_the_year(self, raw, period):
        assert period_from_portal(raw) == period

    @pytest.mark.parametrize("raw", ["132026", "002026", "202600", "202613"])
    def test_a_month_outside_the_year_is_refused_under_either_reading(self, raw):
        """Neither reading may be stretched to accept a thirteenth month.

        A period that parses to `2026-13` is worse than one that fails: it
        becomes a filing period no return can ever be filed for, and the
        invoices booked against it silently leave the reconciliation.
        """
        assert period_from_portal(raw) is None

    @pytest.mark.parametrize("raw", ["2026-13", "2026-00", "2026-99"])
    def test_the_passthrough_branch_checks_the_month_too(self, raw):
        """The six-digit readings both range-checked the month; this one did not.

        It matched on shape alone, so a hand-edited statement naming
        ``2026-13`` was accepted verbatim — and this is the one path by which
        a period reaches the database without passing a route's validation.
        Stored, it becomes a filing period no return can ever be filed for.
        """
        assert period_from_portal(raw) is None


# --------------------------------------------------------------------------
# JSON that is shaped wrong
# --------------------------------------------------------------------------

class TestMalformedJsonStructures:
    def test_a_json_array_is_rejected_with_a_readable_message(self):
        # A hand-built export sometimes ships just the b2b list.
        with pytest.raises(GSTR2BParseError, match="must be an object"):
            parse_json(json.dumps([{"ctin": SUPPLIER_GSTIN_OTHER_STATE}]))

    @pytest.mark.parametrize("junk", [None, "a string", 42, ["a", "list"]])
    def test_a_non_object_supplier_entry_is_skipped_not_fatal(self, junk):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"].append(junk)
        # The good supplier beside it must survive; dropping the whole file
        # over one bad row loses every invoice in it.
        assert len(parse_json(payload)) == 1

    @pytest.mark.parametrize("junk", [None, "INV-1", 7, []])
    def test_a_non_object_invoice_entry_is_skipped_not_fatal(self, junk):
        payload = portal_json()
        payload["data"]["docdata"]["b2b"][0]["inv"].append(junk)
        assert len(parse_json(payload)) == 1

    def test_an_invoice_with_no_items_block_still_becomes_a_record(self):
        # Some exports omit the rate-wise lines entirely and give only the
        # invoice total. The invoice still has to appear, or it reconciles as
        # missing from the portal.
        payload = portal_json()
        del payload["data"]["docdata"]["b2b"][0]["inv"][0]["items"]
        records = parse_json(payload)
        assert len(records) == 1
        assert records[0].invoice_number == "INV-2026-0042"

    def test_items_under_the_abbreviated_key_are_read_too(self):
        payload = portal_json()
        invoice = payload["data"]["docdata"]["b2b"][0]["inv"][0]
        invoice["itms"] = invoice.pop("items")
        assert parse_json(payload)[0].igst == pytest.approx(81000.00)

    def test_items_nested_under_itm_det_are_flattened(self):
        payload = portal_json()
        invoice = payload["data"]["docdata"]["b2b"][0]["inv"][0]
        invoice["items"] = [{"num": 1, "itm_det": {"rt": 18, "txval": 450000.00,
                                                   "igst": 81000.00}}]
        assert parse_json(payload)[0].igst == pytest.approx(81000.00)

    def test_a_section_holding_null_instead_of_a_list_is_tolerated(self):
        payload = portal_json()
        payload["data"]["docdata"]["cdnr"] = None
        assert len(parse_json(payload)) == 1


# --------------------------------------------------------------------------
# CSV exports that are not quite exports
# --------------------------------------------------------------------------

class TestMalformedCsv:
    def test_an_entirely_empty_file_is_rejected(self):
        with pytest.raises(GSTR2BParseError, match="empty"):
            parse_csv("")

    def test_a_file_of_only_blank_lines_is_rejected(self):
        # Excel "save as CSV" on an empty sheet produces exactly this.
        with pytest.raises(GSTR2BParseError, match="empty"):
            parse_csv("\n\n,,,\n   \n")

    def test_a_file_whose_heading_row_is_only_punctuation_is_rejected(self):
        # Headings squash to alphanumerics before they are matched, so a rule
        # of dashes is non-blank to the reader and empty to the matcher. The
        # message has to say "no headings" rather than "no GSTIN column",
        # which would send someone looking for a column that is not missing.
        with pytest.raises(GSTR2BParseError, match="headings"):
            parse_csv("-,--,-\n1,2,3\n")

    def test_bytes_are_decoded_and_a_bom_is_stripped(self):
        # Excel writes UTF-8 with a BOM, which otherwise glues itself to the
        # first heading and makes the GSTIN column unfindable.
        csv_text = (
            "GSTIN of Supplier,Invoice Number,Invoice Date,Taxable Value,IGST,CGST,SGST\n"
            f"{SUPPLIER_GSTIN_OTHER_STATE},INV-1,15-04-2026,1000,180,0,0\n"
        )
        records = parse_csv(("﻿" + csv_text).encode("utf-8"))
        assert records[0].supplier_gstin == SUPPLIER_GSTIN_OTHER_STATE

    def test_undecodable_bytes_do_not_raise(self):
        # A latin-1 export. Replacement characters in a trade name are far
        # better than refusing the file.
        csv_text = (
            "GSTIN of Supplier,Supplier Name,Invoice Number,Invoice Date,Taxable Value,IGST\n"
            f"{SUPPLIER_GSTIN_OTHER_STATE},Caf\xe9 Supplies,INV-1,15-04-2026,1000,180\n"
        ).encode("latin-1")
        assert parse_csv(csv_text)[0].supplier_gstin == SUPPLIER_GSTIN_OTHER_STATE


# --------------------------------------------------------------------------
# The import endpoint's remaining branches
# --------------------------------------------------------------------------

class TestTheImportEndpointRefusals:
    def test_a_file_over_the_size_limit_is_refused_with_413(self, auth_client):
        from app.core.config import settings

        oversized = b"[" + b"0" * (settings.max_upload_mb * 1024 * 1024) + b"]"
        response = upload_2b(auth_client, content=oversized)

        assert response.status_code == 413
        assert str(settings.max_upload_mb) in response.json()["detail"]

    def test_a_valid_2b_containing_no_invoices_is_refused(self, auth_client):
        # Parses cleanly, and yields nothing — a period with no inward
        # supplies, or the wrong download. Importing it would silently mark
        # every booked invoice as missing from the portal.
        payload = portal_json()
        payload["data"]["docdata"]["b2b"] = []
        response = upload_2b(auth_client, content=json.dumps(payload).encode())

        assert response.status_code == 422
        assert "No invoices found" in response.json()["detail"]


class TestWhichPeriodAStatementBelongsTo:
    def test_an_explicit_period_on_the_form_wins(self, auth_client):
        response = upload_2b(auth_client, period="2026-05")
        assert response.status_code in (200, 201)
        assert response.json()["period"] == "2026-05"

    def test_otherwise_the_period_the_portal_stamped_is_used(self, auth_client):
        assert upload_2b(auth_client).json()["period"] == PERIOD

    def test_with_no_stamp_the_commonest_invoice_period_is_inferred(self, auth_client):
        # A file with no rtnprd at all. Two invoices in April, one in March,
        # so the statement is April's.
        payload = portal_json()
        del payload["data"]["rtnprd"]
        supplier = payload["data"]["docdata"]["b2b"][0]
        supplier["supprd"] = ""
        invoice = supplier["inv"][0]
        supplier["inv"] = [
            {**invoice, "inum": "INV-A", "dt": "15-04-2026"},
            {**invoice, "inum": "INV-B", "dt": "20-04-2026"},
            {**invoice, "inum": "INV-C", "dt": "10-03-2026"},
        ]

        body = upload_2b(auth_client, content=json.dumps(payload).encode()).json()
        assert body["period"] == "2026-04"

    def test_a_tie_breaks_toward_the_later_month(self, auth_client):
        # Late filings drag earlier months in, and the statement is about the
        # newest of them. Left to dict ordering this would depend on which
        # invoice happened to be read first.
        payload = portal_json()
        del payload["data"]["rtnprd"]
        supplier = payload["data"]["docdata"]["b2b"][0]
        supplier["supprd"] = ""
        invoice = supplier["inv"][0]
        supplier["inv"] = [
            {**invoice, "inum": "INV-MAR", "dt": "10-03-2026"},
            {**invoice, "inum": "INV-APR", "dt": "15-04-2026"},
        ]

        body = upload_2b(auth_client, content=json.dumps(payload).encode()).json()
        assert body["period"] == "2026-04"

    def test_a_file_whose_period_cannot_be_determined_is_refused(self, auth_client):
        # No stamp and no readable invoice date. Guessing would file the
        # statement against the wrong month, which is worse than asking.
        payload = portal_json()
        del payload["data"]["rtnprd"]
        supplier = payload["data"]["docdata"]["b2b"][0]
        supplier["supprd"] = ""
        supplier["inv"][0]["dt"] = ""

        response = upload_2b(auth_client, content=json.dumps(payload).encode())
        assert response.status_code == 422
        assert "period" in response.json()["detail"].lower()


class TestAPeriodTheCallerNames:
    """The form value is the only way an unreal month reaches the column.

    Every other period input in the product is checked against
    ``PERIOD_PATTERN``; this one was not, and it is the one that *writes* a
    period. The two the file itself can offer are derived — one from an invoice
    date, one from a validated portal field — so nothing else could put a month
    that does not exist on a stored statement.
    """

    @pytest.mark.parametrize(
        "period",
        [
            "2026-13",  # No thirteenth month; every later screen divides by it.
            "2026-00",  # Quietly aliased onto January.
            "2026-4",   # Unpadded: sorts and compares wrongly against stored ones.
            "202604",   # The portal's own MMYYYY, pasted the wrong way round.
            "April 2026",
        ],
    )
    def test_a_period_that_is_not_one_is_refused(self, auth_client, period):
        assert upload_2b(auth_client, period=period).status_code == 422

    def test_a_blank_field_still_means_read_it_from_the_file(self, auth_client):
        # A form input the user never touched submits as an empty string, and
        # FastAPI reads that as the field being absent rather than as a period
        # of "". Tightening the pattern must not turn the ordinary case — drop
        # the file in, name nothing — into a validation error.
        response = upload_2b(auth_client, period="")
        assert response.status_code == 201, response.text
        assert response.json()["period"] == PERIOD

    def test_a_period_too_long_for_the_column_is_refused(self, auth_client):
        # ``gstr_returns.period`` is VARCHAR(7). Postgres refuses anything
        # longer and the API reports the failure as a 500; SQLite has no width
        # at all and keeps the whole string, so the suite would have seen
        # nothing wrong. Refusing it here is what makes the two agree.
        assert upload_2b(auth_client, period="2026-04-15").status_code == 422

    def test_a_real_period_still_wins_over_the_file(self, auth_client):
        response = upload_2b(auth_client, period="2026-05")
        assert response.status_code == 201, response.text
        assert response.json()["period"] == "2026-05"


class TestListingRunsByPeriod:
    def test_the_listing_can_be_filtered_to_one_period(self, auth_client):
        upload_2b(auth_client)
        auth_client.post("/api/v1/reconciliation/run", json={"period": PERIOD})

        matching = auth_client.get("/api/v1/reconciliation", params={"period": PERIOD})
        assert matching.status_code == 200
        assert matching.json()["total"] >= 1
        assert all(row["period"] == PERIOD for row in matching.json()["items"])

    def test_a_period_with_no_runs_lists_nothing(self, auth_client):
        upload_2b(auth_client)
        auth_client.post("/api/v1/reconciliation/run", json={"period": PERIOD})

        empty = auth_client.get("/api/v1/reconciliation", params={"period": "2019-01"})
        assert empty.json()["total"] == 0
        assert empty.json()["items"] == []
