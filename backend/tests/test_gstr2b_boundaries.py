"""The edges the other GSTR-2B files read *through* rather than at.

tests/test_gstr2b.py reads a well-formed download, test_gstr2b_edges.py the
malformed ones, test_gstr2b_notes.py the documents that move credit backwards.
All three arrive at their assertions along a path that crosses a boundary
without ever standing on it: the row a header search gives up at, the character
a document type is cut to, the rupee a statement is refused above, the cell a
footer's label lands in.

A boundary nothing stands on is a boundary nothing is holding, and the first
test here exists because one of them was already wrong. A GSTR-2B is the
authority reconciliation judges a tenant's books against, so a figure this
reader invents is not a display bug — it is credit the business is told it has.
"""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.models.mixins import MONEY_MAX
from app.services import gstr2b
from app.services.gstr2b import GSTR2BParseError, GSTR2BRecord
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE

HEADER = (
    "GSTIN of supplier,Trade/Legal name,Invoice number,Invoice Date,"
    "Invoice Value(Rs),Place of supply,Supply Attract Reverse Charge,"
    "Note type,Rate(%),Taxable Value(Rs),Integrated Tax(Rs),Cess(Rs)"
)


def csv_export(*rows: str) -> str:
    return HEADER + "\n" + "".join(row + "\n" for row in rows)


def row(
    *,
    gstin: str = SUPPLIER_GSTIN_OTHER_STATE,
    name: str = "Northwind Supplies",
    number: str = "INV-1",
    date: str = "15-04-2026",
    value: str = "1180",
    pos: str = "27",
    reverse: str = "N",
    note_type: str = "",
    rate: str = "18",
    taxable: str = "1000",
    igst: str = "180",
    cess: str = "0",
) -> str:
    return ",".join(
        [gstin, name, number, date, value, pos, reverse, note_type, rate, taxable, igst, cess]
    )


def portal_statement(*invoices: dict) -> bytes:
    """A JSON download carrying *invoices* under one supplier."""
    return json.dumps(
        {
            "data": {
                "gstin": BUSINESS_GSTIN,
                "rtnprd": "042026",
                "docdata": {"b2b": [{"ctin": SUPPLIER_GSTIN_OTHER_STATE, "inv": list(invoices)}]},
            }
        }
    ).encode()


# ---------------------------------------------------------------------------
# The rows under the table
# ---------------------------------------------------------------------------

class TestAFooterIsNotADocument:
    """The row a section's own figures are repeated on, read as a supplier.

    The guard here tested for two blank cells, which catches a trailing blank
    row and the wrong shape of footer. The one exports actually carry puts the
    label in the first column — which is the supplier GSTIN column — and
    ``normalize`` deliberately does not judge what it is handed, so "Total"
    became supplier "TOTAL" and the section totals were added to the statement
    a second time.

    Nothing downstream could have caught it. The phantom carries no invoice
    number, so reconciliation reports it as a portal document missing from the
    books; the period's totals are exactly doubled, which is not a number that
    looks wrong; and the business is told it has twice the credit it has.
    """

    def test_a_total_row_is_not_read_as_a_supplier(self):
        records = gstr2b.parse_csv(
            csv_export(
                row(number="INV-1", taxable="1000", igst="180"),
                row(number="INV-2", taxable="2000", igst="360"),
                "Total,,,,,,,,,3000,540,",
            )
        )
        assert [r.invoice_number for r in records] == ["INV-1", "INV-2"]

    def test_the_statement_totals_are_not_doubled_by_it(self):
        records = gstr2b.parse_csv(
            csv_export(
                row(number="INV-1", taxable="1000", igst="180"),
                row(number="INV-2", taxable="2000", igst="360"),
                "Total,,,,,,,,,3000,540,",
            )
        )
        assert sum((r.taxable_value for r in records), Decimal("0")) == Decimal("3000.00")
        assert sum((r.igst for r in records), Decimal("0")) == Decimal("540.00")

    @pytest.mark.parametrize("label", ["Total", "Grand Total", "Sub-total", "Total:"])
    def test_the_words_a_footer_labels_itself_with(self, label):
        records = gstr2b.parse_csv(csv_export(row(), f"{label},,,,,,,,,3000,540,"))
        assert len(records) == 1

    def test_a_document_with_a_number_is_kept_however_its_supplier_reads(self):
        # The other half of the rule. A hand-corrected export with a typo in
        # the GSTIN still describes a real purchase, and dropping it would
        # report the supplier as having never filed.
        (record,) = gstr2b.parse_csv(csv_export(row(gstin="27AAGCB7383J1Z9")))
        assert record.invoice_number == "INV-1"

    def test_a_document_with_a_real_supplier_and_no_number_is_kept(self):
        # An unnumbered row from a live registration is a document the reader
        # cannot key but must not lose: it is still credit in the statement.
        (record,) = gstr2b.parse_csv(csv_export(row(number="")))
        assert record.taxable_value == Decimal("1000.00")

    def test_a_row_that_is_neither_is_still_dropped(self):
        records = gstr2b.parse_csv(csv_export(row(), ",,,,,,,,,,,"))
        assert len(records) == 1


# ---------------------------------------------------------------------------
# Where the headings are looked for
# ---------------------------------------------------------------------------

class TestTheHeaderSearchWindow:
    """Thirty rows, and what happens on the thirty-first.

    The portal opens its CSV with title and legend rows, and how many depends
    on the section and on whether the file has been through a spreadsheet. The
    window is a guess at "more than any export has"; both of its edges matter,
    because past it the search returns row 0 and every heading is wrong.
    """

    def _with_preamble(self, count: int) -> str:
        preamble = "".join("GSTR-2B statement,,,,,,,,,,,\n" for _ in range(count))
        return preamble + csv_export(row())

    def test_a_header_thirty_rows_down_is_still_found(self):
        (record,) = gstr2b.parse_csv(self._with_preamble(29))
        assert record.invoice_number == "INV-1"

    def test_a_header_past_the_window_is_refused_rather_than_misread(self):
        # Refused, not silently read against row 0's headings — which name no
        # columns at all, so every figure would come out zero and the period
        # would report a statement with no credit in it.
        with pytest.raises(GSTR2BParseError, match="No supplier GSTIN column"):
            gstr2b.parse_csv(self._with_preamble(30))


# ---------------------------------------------------------------------------
# The document type cell
# ---------------------------------------------------------------------------

class TestTheDocumentTypeCell:
    def test_a_spelled_out_credit_note_is_cut_to_its_class(self):
        # Four characters, because that is what separates "CRED" from "DEBI"
        # and keeps every spelling of one class keying to one record.
        (record,) = gstr2b.parse_csv(csv_export(row(number="CN-1", note_type="Credit note")))
        assert record.document_type == "CRED"

    def test_and_still_takes_credit_away(self):
        (record,) = gstr2b.parse_csv(csv_export(row(number="CN-1", note_type="Credit note")))
        assert record.is_credit_note is True

    def test_two_suppliers_sharing_an_invoice_number_stay_two_documents(self):
        # Invoice numbers are unique per supplier, never across them, and every
        # small business in India numbers its first invoice of the year 1.
        # Merged, one supplier's figures would be added to the other's and both
        # reconciliations would be wrong.
        records = gstr2b.parse_csv(
            csv_export(
                row(gstin=SUPPLIER_GSTIN_OTHER_STATE, number="1"),
                row(gstin="27AACCM6094J1Z3", number="1"),
            )
        )
        assert len(records) == 2


# ---------------------------------------------------------------------------
# The figures a row does not state
# ---------------------------------------------------------------------------

class TestTheTotalTheStatementDidNotState:
    def test_a_stated_total_is_kept_even_when_the_lines_disagree(self):
        # The portal's figure is the portal's figure. Recomputing it would hide
        # a rounding difference the supplier's own return carries, and that
        # difference is exactly what reconciliation exists to surface.
        (record,) = gstr2b.parse_csv(csv_export(row(value="9999", taxable="1000", igst="180")))
        assert record.total_value == Decimal("9999")

    def test_a_missing_total_is_derived_from_the_lines(self):
        (record,) = gstr2b.parse_csv(csv_export(row(value="", taxable="1000", igst="180")))
        assert record.total_value == Decimal("1180.00")


class TestCessIsTax:
    """Cess is the head nothing else re-derives, so a dropped one is silent."""

    def test_cess_is_part_of_the_tax_a_document_carries(self):
        (record,) = gstr2b.parse_csv(csv_export(row(igst="180", cess="55")))
        assert record.total_tax == Decimal("235.00")

    def test_a_csv_sums_cess_across_the_rate_lines_of_one_invoice(self):
        (record,) = gstr2b.parse_csv(
            csv_export(
                row(number="MULTI-1", rate="18", cess="55"),
                row(number="MULTI-1", rate="5", cess="20"),
            )
        )
        assert record.cess == Decimal("75.00")

    def test_a_json_download_sums_cess_the_same_way(self):
        records = gstr2b.parse_json(
            json.loads(
                portal_statement(
                    {
                        "inum": "J-1",
                        "dt": "15-04-2026",
                        "items": [
                            {"rt": 18, "txval": 1000, "igst": 180, "cess": 25},
                            {"rt": 18, "txval": 500, "igst": 90, "cess": 15},
                        ],
                    }
                )
            )
        )
        assert records[0].cess == Decimal("40.00")


class TestThePlaceOfSupplyCell:
    """Two characters of it, which is the state code the tax split turns on."""

    def test_a_cell_that_names_the_state_is_cut_to_its_code(self):
        records = gstr2b.parse_json(
            json.loads(
                portal_statement(
                    {"inum": "J-1", "dt": "15-04-2026", "pos": "27-Maharashtra", "items": []}
                )
            )
        )
        assert records[0].place_of_supply == "27"

    def test_a_blank_place_of_supply_is_absent_rather_than_empty(self):
        # "" and None reach reconciliation differently: one is a state code
        # that matches nothing, the other is a question the record does not
        # answer and the buyer's own registration settles.
        (record,) = gstr2b.parse_csv(csv_export(row(pos="")))
        assert record.place_of_supply is None

    def test_a_csv_rate_line_with_no_rate_carries_an_empty_rate(self):
        (record,) = gstr2b.parse_csv(csv_export(row(rate="")))
        assert record.rate_items[0]["rate"] == ""

    def test_a_json_rate_line_with_no_rate_carries_an_empty_rate_too(self):
        # Not "None" and not "0". The rate items are stored as strings and
        # shown back as the rate-wise breakdown of a document, where a literal
        # "None" is a rendered word and "0" is a claim the supply was exempt.
        records = gstr2b.parse_json(
            json.loads(
                portal_statement(
                    {"inum": "J-1", "dt": "15-04-2026", "items": [{"txval": 1000, "igst": 180}]}
                )
            )
        )
        assert records[0].rate_items[0]["rate"] == ""


class TestWhatACsvRowCarriesThrough:
    def test_the_supplier_name_reaches_the_record(self):
        # The only human-readable thing on a reconciliation screen: an
        # accountant chases "Northwind Supplies", not 29AAGCB7383J1Z4.
        (record,) = gstr2b.parse_csv(csv_export(row(name="Northwind Supplies")))
        assert record.supplier_name == "Northwind Supplies"

    def test_an_unreadable_reverse_charge_cell_is_read_as_off(self):
        # Guessing yes moves the liability onto the buyer for a supply the
        # supplier has already charged tax on, and the credit is claimed twice.
        (record,) = gstr2b.parse_csv(csv_export(row(reverse="perhaps")))
        assert record.reverse_charge is False


class TestTheDefaultsARecordStartsFrom:
    """A record built from a section that states nothing about a field.

    Both defaults are the conservative direction and neither is arbitrary:
    credit is available unless the statement withholds it, and reverse charge
    is off unless the statement declares it.
    """

    def test_reverse_charge_is_off_unless_the_statement_says_otherwise(self):
        assert GSTR2BRecord().reverse_charge is False

    def test_credit_is_available_unless_the_statement_withholds_it(self):
        assert GSTR2BRecord().itc_available is True

    def test_a_document_is_an_invoice_unless_it_says_it_is_a_note(self):
        assert GSTR2BRecord().document_type == "R"
        assert GSTR2BRecord().is_credit_note is False


# ---------------------------------------------------------------------------
# The rupee the statement is refused above
# ---------------------------------------------------------------------------

class TestTheFigureAtTheCeiling:
    """``MONEY_MAX`` is the last figure the column holds, not the first it refuses.

    tests/test_money_bounds.py stands either side of this — a figure well
    inside it, and five at the ceiling that add past it — so the paisa the
    refusal actually begins at was never asserted. A ceiling one rupee low
    refuses a real statement, and the import has nothing else to fall back on.
    """

    def test_an_invoice_at_the_ceiling_is_read_rather_than_refused(self):
        records = gstr2b.parse(
            portal_statement(
                {"inum": "INV-1", "dt": "15-04-2026", "items": [{"txval": str(MONEY_MAX)}]}
            ),
            "2b.json",
        )
        assert records[0].taxable_value == MONEY_MAX

    def test_a_statement_totalling_the_ceiling_is_read_too(self):
        # The second bound, which sums the records rather than reading a cell.
        # Split at a paisa each side quantizes exactly, so what is under test
        # is the comparison and not the arithmetic getting there.
        first = Decimal("49999999999999.99")
        second = MONEY_MAX - first
        records = gstr2b.parse(
            portal_statement(
                {"inum": "INV-1", "dt": "15-04-2026", "items": [{"txval": str(first)}]},
                {"inum": "INV-2", "dt": "16-04-2026", "items": [{"txval": str(second)}]},
            ),
            "2b.json",
        )
        assert sum((r.taxable_value for r in records), Decimal("0")) == MONEY_MAX

    def test_a_paisa_above_it_is_still_refused(self):
        with pytest.raises(GSTR2BParseError):
            gstr2b.parse(
                portal_statement(
                    {
                        "inum": "INV-1",
                        "dt": "15-04-2026",
                        "items": [{"txval": str(MONEY_MAX)}, {"txval": "0.01"}],
                    }
                ),
                "2b.json",
            )


# ---------------------------------------------------------------------------
# Whose statement it is
# ---------------------------------------------------------------------------

class TestTheAddresseeIsReadFromTheFileNotItsName:
    """The wrong-tenant check, on a file that has been renamed.

    Every existing test of it hands the reader a ``.json`` name, so the check
    was only ever asserted on files that still had one. Businesses rename
    downloads constantly — "2b (3).csv", "april.txt", or nothing at all when
    the upload arrives without a name — and a renamed file skipping the check
    is precisely the case the check was written for: a practice with several
    clients on one login, importing one client's statement into another's
    books, with nothing on any screen to tell the two apart.
    """

    def test_a_json_download_renamed_to_csv_is_still_checked(self):
        assert gstr2b.recipient_gstin(portal_statement(), "2b (3).csv") == BUSINESS_GSTIN

    def test_a_json_download_with_no_name_at_all_is_still_checked(self):
        assert gstr2b.recipient_gstin(portal_statement()) == BUSINESS_GSTIN

    def test_a_file_that_is_not_json_still_says_nothing(self):
        assert gstr2b.recipient_gstin(csv_export(row()).encode(), "2b.json") is None
