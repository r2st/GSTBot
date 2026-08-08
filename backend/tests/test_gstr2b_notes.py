"""Credit and debit notes, which move credit the opposite way from an invoice.

A note is the one document in a GSTR-2B whose *sign* is carried outside its
figures: the portal states every amount as a positive number and leaves the
direction to the document type. Read the type wrong, or lose it, and the money
moves twice in the wrong direction — the credit that should have gone is kept
and the credit that should never have arrived is added.

Three ways that happened, all of them on files the portal itself produces:

* A CSV holding both registers, where a supplier's invoice 001 and credit note
  001 were merged into a single record.
* A JSON note declaring its type in ``ntty`` rather than ``typ``, which left a
  *debit* note being read as a credit note.
* A JSON note dated with ``ntdt`` rather than ``nt_dt``, which left it with no
  date and so filed under the month the supplier caught up rather than the
  month it was issued.
"""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.services import reconciliation
from app.services.gstr2b import parse_csv, parse_json

SUPPLIER = "27AAGCB7383J1Z4"


def note_json(*, number="CN-1", date_key="ntdt", type_key="ntty", type_value="C"):
    """A ``cdnr`` section written the way an export that is not the raw
    download writes one: the GSTR-1 spelling of the note's own fields."""
    document = {
        "ntnum": number,
        date_key: "20-04-2026",
        type_key: type_value,
        "val": 1180,
        "items": [{"rt": 18, "txval": 1000, "igst": 180}],
    }
    return json.dumps(
        {
            "data": {
                # The statement is May's: this note was declared late.
                "rtnprd": "052026",
                "docdata": {"cdnr": [{"ctin": SUPPLIER, "nt": [document]}]},
            }
        }
    )


class TestANoteInTheJSONDownload:
    def test_a_note_dated_with_ntdt_keeps_the_month_it_was_issued_in(self):
        """Otherwise it lands in the month the supplier finally filed.

        The fallback is the statement's own period, which for a late filing is
        a different month — so the reversal came off a period that never held
        the supply it reverses.
        """
        (record,) = parse_json(note_json())
        assert record.invoice_date is not None
        assert record.period == "2026-04"

    def test_the_underscored_spelling_still_reads(self):
        (record,) = parse_json(note_json(date_key="nt_dt"))
        assert record.period == "2026-04"

    def test_an_invoice_date_is_still_read_from_dt(self):
        payload = json.dumps(
            {
                "data": {
                    "rtnprd": "052026",
                    "docdata": {
                        "b2b": [
                            {
                                "ctin": SUPPLIER,
                                "inv": [
                                    {
                                        "inum": "INV-1",
                                        "dt": "10-04-2026",
                                        "val": 11800,
                                        "items": [{"txval": 10000, "igst": 1800}],
                                    }
                                ],
                            }
                        ]
                    },
                }
            }
        )
        (record,) = parse_json(payload)
        assert record.period == "2026-04"

    def test_a_debit_note_declaring_itself_in_ntty_is_not_read_as_a_credit_note(self):
        """A debit note raises the supplier's charge, and the buyer's credit.

        Read as a credit note it was subtracted instead of added, so the pool
        moved by twice the note's tax in the wrong direction.
        """
        (record,) = parse_json(note_json(number="DN-1", type_value="D"))
        assert record.document_type == "D"
        assert record.is_credit_note is False

    def test_a_credit_note_declaring_itself_in_ntty_still_reverses(self):
        (record,) = parse_json(note_json())
        assert record.is_credit_note is True

    def test_typ_wins_when_a_file_carries_both_spellings(self):
        payload = json.loads(note_json(type_value="D"))
        document = payload["data"]["docdata"]["cdnr"][0]["nt"][0]
        document["typ"] = "C"
        (record,) = parse_json(json.dumps(payload))
        assert record.document_type == "C"

    def test_a_note_with_no_type_at_all_is_still_treated_as_reversing(self):
        """The conservative direction: it understates credit rather than
        inventing it, and a ``cdnr`` section is mostly credit notes."""
        payload = json.loads(note_json())
        del payload["data"]["docdata"]["cdnr"][0]["nt"][0]["ntty"]
        (record,) = parse_json(json.dumps(payload))
        assert record.is_credit_note is True


# --------------------------------------------------------------------------
# The CSV export, where both registers can sit in one table
# --------------------------------------------------------------------------

HEADER = (
    "GSTIN of supplier,Trade/Legal name,Invoice number,Invoice Date,"
    "Invoice Value,Note Type,Rate,Taxable Value,Integrated Tax\r\n"
)


def csv_of(*rows):
    return HEADER + "".join(f"{row}\r\n" for row in rows)


class TestANoteNumberedLikeAnInvoice:
    """Both registers restart at 1 each year, so the collision is ordinary."""

    def test_the_invoice_and_the_note_stay_two_documents(self):
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,10-04-2026,11800,R,18,10000,1800",
                f"{SUPPLIER},Acme,001,20-04-2026,1180,C,18,1000,180",
            )
        )
        assert len(records) == 2
        invoice, note = records
        assert invoice.is_credit_note is False
        assert invoice.taxable_value == Decimal("10000")
        assert invoice.igst == Decimal("1800")
        assert note.is_credit_note is True
        assert note.taxable_value == Decimal("1000")
        assert note.igst == Decimal("180")

    def test_the_note_comes_off_the_pool_instead_of_being_added_to_it(self):
        """The figure the whole bug was about, end to end.

        Merged, the note's ₹180 was summed onto the invoice and the merged row
        was no longer a credit note at all — so the pool came out at ₹1,980
        rather than ₹1,620, over by twice the note's tax.
        """
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,10-04-2026,11800,R,18,10000,1800",
                f"{SUPPLIER},Acme,001,20-04-2026,1180,C,18,1000,180",
            )
        )
        result = reconciliation.summarise_records(records)
        assert result["total_igst"] == Decimal("1620")

    def test_the_note_leading_does_not_change_the_answer(self):
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,20-04-2026,1180,C,18,1000,180",
                f"{SUPPLIER},Acme,001,10-04-2026,11800,R,18,10000,1800",
            )
        )
        assert len(records) == 2
        assert reconciliation.summarise_records(records)["total_igst"] == Decimal("1620")

    def test_the_wording_of_the_type_does_not_split_a_document(self):
        """"Credit Note" and "C" are one class, not two."""
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,20-04-2026,1180,Credit Note,18,1000,180",
                f"{SUPPLIER},Acme,001,20-04-2026,1180,C,5,500,25",
            )
        )
        assert len(records) == 1
        assert records[0].is_credit_note is True
        assert records[0].igst == Decimal("205")

    def test_a_debit_note_is_its_own_document_too(self):
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,10-04-2026,11800,R,18,10000,1800",
                f"{SUPPLIER},Acme,001,20-04-2026,1180,D,18,1000,180",
            )
        )
        assert len(records) == 2
        assert [record.is_credit_note for record in records] == [False, False]
        # A debit note adds to the statement rather than taking from it.
        assert reconciliation.summarise_records(records)["total_igst"] == Decimal("1980")


class TestTheRateLinesOfOneDocumentStillMerge:
    """The fix must not split a document across its own rate lines."""

    def test_rate_lines_repeating_the_type_merge(self):
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,INV-9,10-04-2026,11800,R,18,10000,1800",
                f"{SUPPLIER},Acme,INV-9,10-04-2026,11800,R,5,2000,100",
            )
        )
        assert len(records) == 1
        assert records[0].taxable_value == Decimal("12000")
        assert records[0].igst == Decimal("1900")

    def test_a_continuation_line_that_leaves_the_type_blank_joins_its_document(self):
        """Exports differ on whether the type is repeated down the rate lines,
        and a blank cell is a continuation rather than a second document."""
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,CN-9,20-04-2026,1180,C,18,1000,180",
                f"{SUPPLIER},Acme,CN-9,20-04-2026,1180,,5,500,25",
            )
        )
        assert len(records) == 1
        assert records[0].is_credit_note is True
        assert records[0].igst == Decimal("205")

    def test_a_file_with_no_type_column_at_all_merges_exactly_as_before(self):
        records = parse_csv(
            "GSTIN of supplier,Invoice number,Invoice Date,Rate,Taxable Value,"
            "Integrated Tax\r\n"
            f"{SUPPLIER},INV-9,10-04-2026,18,10000,1800\r\n"
            f"{SUPPLIER},INV-9,10-04-2026,5,2000,100\r\n"
        )
        assert len(records) == 1
        assert records[0].taxable_value == Decimal("12000")
        assert records[0].document_type == "R"

    @pytest.mark.parametrize("first, second", [("", "R"), ("R", ""), ("", "")])
    def test_a_blank_and_an_explicit_regular_are_the_same_document(self, first, second):
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,INV-9,10-04-2026,11800,{first},18,10000,1800",
                f"{SUPPLIER},Acme,INV-9,10-04-2026,11800,{second},5,2000,100",
            )
        )
        assert len(records) == 1
        assert records[0].taxable_value == Decimal("12000")

    def test_a_deemed_export_still_merges_its_own_rate_lines(self):
        """It shares the debit notes' class — a grouping key, not a direction."""
        records = parse_csv(
            "GSTIN of supplier,Invoice number,Invoice Date,Invoice Type,Rate,"
            "Taxable Value,Integrated Tax\r\n"
            f"{SUPPLIER},INV-9,10-04-2026,Deemed exports,18,10000,1800\r\n"
            f"{SUPPLIER},INV-9,10-04-2026,Deemed exports,5,2000,100\r\n"
        )
        assert len(records) == 1
        assert records[0].is_credit_note is False
        assert records[0].taxable_value == Decimal("12000")

    def test_two_suppliers_numbering_alike_stay_apart(self):
        other = "29AAGCB7383J1Z4"
        records = parse_csv(
            csv_of(
                f"{SUPPLIER},Acme,001,10-04-2026,11800,R,18,10000,1800",
                f"{other},Beta,001,10-04-2026,11800,R,18,10000,1800",
            )
        )
        assert len(records) == 2
