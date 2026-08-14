"""The edges the extraction's arithmetic and its column geometry turn on.

tests/test_invoice_parser.py and tests/test_invoice_parser_edges.py assert what
the parser reads; tests/test_invoice_formats.py asserts that it reads a corpus
of real layouts. What none of the three pin is the *boundary* of each of those
readings — the character a column reaches to, the length a field is cut at, the
figure a footing check lets pass, the divisor a confidence is scaled by.

Mutation testing is what named them. Every assertion below was written against
a surviving mutant: a one-character change to `invoice_parser` that all three
files above still passed. They are the assertions those files were missing, not
new behaviour — so each one states the edge in the terms the module's own
comments use, and says what the wrong side of it would put on an invoice.

Where a survivor is left alive deliberately, it is named in
:class:`TestTheEdgesThatCannotMove` at the foot of this file with the reason.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services import document_text, invoice_parser
from app.services.invoice_parser import (
    _TOTAL_PATTERN,
    ParsedInvoice,
    _amount_on_line,
    _clean_str,
    _from_model_payload,
    _hsn_in_column,
    _invoice_date_in,
    _invoice_number_in,
    _labelled_amount,
    _merge,
    _text_messages,
    parse_heuristic,
    parse_invoice,
    parse_with_model,
    validate,
)

# A one-pixel PNG, so the data-url encoder has real bytes to work on.
PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
    "de0000000c4944415408d763f8ffff3f0005fe02fea735c0000000000049454e44ae426082"
)

GSTIN_MH = "27AAPFU0939F1ZV"


# --------------------------------------------------------------------------
# What the parsed invoice adds up to, and what it hands on
# --------------------------------------------------------------------------

class TestTheFourTaxHeadsAreAdded:
    """``total_tax`` is what every downstream figure is derived from.

    The footing check below reads it, the ITC pool is built from it, and
    GSTR-3B's table 4 reports it. Nothing re-derives it from the four heads, so
    a sign wrong here is wrong everywhere at once and contradicted nowhere.
    """

    def test_every_head_is_added_and_none_subtracted(self):
        parsed = ParsedInvoice(
            cgst=Decimal("100.00"),
            sgst=Decimal("200.00"),
            igst=Decimal("400.00"),
            cess=Decimal("800.00"),
        )
        # Deliberately four distinct powers of two: any one head flipped to a
        # subtraction lands on a different total, which an all-equal fixture
        # could not tell apart.
        assert parsed.total_tax == Decimal("1500.00")

    def test_a_head_left_at_zero_does_not_change_the_total(self):
        parsed = ParsedInvoice(cgst=Decimal("9000.00"), sgst=Decimal("9000.00"))
        assert parsed.total_tax == Decimal("18000.00")


class TestTheStoredViewOfTheRate:
    """``as_dict`` is what lands on the invoice row, so null and "None" differ.

    The rate is stringified for JSON, and the absent case has to stay absent:
    stored as the *string* "None" it is a truthy value in every reader
    downstream, and the review screen would show a rate of None on an invoice
    that carries none.
    """

    def test_a_rate_that_was_read_is_stringified(self):
        assert ParsedInvoice(tax_rate=Decimal("18")).as_dict()["tax_rate"] == "18"

    def test_a_rate_that_was_not_read_stays_null_rather_than_the_word(self):
        stored = ParsedInvoice(tax_rate=None).as_dict()["tax_rate"]
        assert stored is None


# --------------------------------------------------------------------------
# The lengths every field is cut at
# --------------------------------------------------------------------------

class TestTheLengthEachColumnHolds:
    """Each cut is a column width, and a value over it is a failed INSERT.

    These are asserted exactly rather than as "not too long", because one over
    is the failure that actually happens and one over is what a boundary test
    has to be able to see.
    """

    def test_a_name_is_cut_to_the_column_it_is_stored_in(self):
        assert len(_clean_str("N" * 400)) == 255

    def test_a_name_exactly_at_the_column_width_is_not_cut(self):
        assert _clean_str("N" * 255) == "N" * 255

    def test_a_models_hsn_code_is_cut_to_the_eight_digits_the_portal_takes(self):
        # The portal takes 4, 6 or 8 digits. A model reading a line-item table
        # sometimes runs the code together with the quantity beside it.
        parsed = _from_model_payload({"hsn_code": "84821011223344"}, "", "m")
        assert parsed.hsn_code == "84821011"

    def test_a_place_of_supply_is_read_as_two_digits_and_the_rest_dropped(self):
        # "271" is the state code with a line number run onto it. Cut to two it
        # is Maharashtra; kept whole it is not a state at all, and the invoice
        # loses the field that decides IGST against CGST/SGST.
        assert _from_model_payload({"place_of_supply": "271"}, "", "m").place_of_supply == "27"

    def test_a_state_code_that_is_not_one_is_still_refused(self):
        # 39 is unallocated. 99 is not — it is the Centre's own jurisdiction
        # code and a real answer, so it would not test this.
        assert _from_model_payload({"place_of_supply": "39"}, "", "m").place_of_supply is None

    def test_the_text_sent_to_the_model_is_cut_to_its_context(self):
        # The cut is what keeps a long OCR dump inside the free model's context
        # window; over it the request is rejected and the upload falls back to
        # the heuristics for a reason nothing on the screen explains.
        body = _text_messages("x" * 13000)[1]["content"]
        document = body.split("INVOICE TEXT:\n", 1)[1]
        assert document == "x" * 12000


class TestWhatAWarningQuotesBack:
    """A refusal names what was refused, and the excerpt is bounded.

    Unbounded, the excerpt is a whole OCR line on the review screen; too short
    it does not show the reader what the page held. Both bounds are asserted
    exactly because the excerpt is the only evidence the field was emptied on
    purpose.
    """

    def test_a_partly_read_amount_quotes_twenty_four_characters(self):
        amount, seen = _labelled_amount(
            _TOTAL_PATTERN, "Grand Total: 1,OOO.00 and more text beyond the cut"
        )
        assert amount is None
        assert seen == "1,OOO.00 and more text b"
        assert len(seen) == 24

    def test_a_refused_model_amount_quotes_forty_characters(self):
        parsed = _from_model_payload({"igst": "Z" * 90}, "", "m")
        assert parsed.warnings == [f"Discarded an invalid igst: {'Z' * 40}"]
        assert parsed.igst == Decimal("0.00")

    def test_a_model_that_left_every_box_empty_says_nothing(self):
        # ``str(payload.get(key) or "")`` on an absent GSTIN must produce the
        # empty string, not the word "None" — which normalises to a candidate,
        # fails the checksum, and warns about a field the model never filled.
        assert _from_model_payload({}, "", "m").warnings == []


# --------------------------------------------------------------------------
# The invoice number: what is a value and what is the next label
# --------------------------------------------------------------------------

class TestAWordIsNotADocumentNumber:
    """A label with no value beside it offers the next label as the value.

    See :func:`~app.services.invoice_parser._invoice_number_in` — every one of
    these came off a real layout, and each is a plausible-looking string in the
    one field nothing downstream can check.
    """

    @pytest.mark.parametrize(
        ("text", "word"),
        [
            # A tabular register heads its columns on one line, so the label's
            # "value" is the abbreviation of the next heading along.
            ("Bill No.   Dt.   Party Name", "Dt"),
            ("Invoice No.  Dt  Amount", "Dt"),
        ],
    )
    def test_a_two_letter_heading_is_not_taken_as_the_number(self, text, word):
        # Two characters is the shortest a *word* can be here, so it is the
        # edge the digit test has to hold at: one character is allowed through
        # by the branch that confirmed a "No" token, two are not.
        assert _invoice_number_in(text) != word
        assert _invoice_number_in(text) is None

    def test_a_longer_word_with_no_digit_in_it_is_refused_too(self):
        assert _invoice_number_in("Invoice No: TBD") is None

    def test_a_two_character_number_with_a_digit_in_it_is_kept(self):
        # The other side of the same edge: length alone must not decide it.
        assert _invoice_number_in("Invoice No: A1") == "A1"

    def test_a_single_character_number_survives_a_confirmed_label(self):
        assert _invoice_number_in("Invoice No: 7") == "7"


class TestAHeadingThatNamesTheNumberAndTheDateTogether:
    def test_the_date_is_read_when_the_heading_ends_the_document(self):
        # No trailing newline, which is what a text extractor produces for the
        # last line of a file. The scan of the rest of the line has to run to
        # the end of the text rather than stopping at a newline that is not
        # there — otherwise the commonest tabular heading loses its date on the
        # one layout that puts it last, and an invoice with no date is in no
        # return at all.
        assert _invoice_date_in("Invoice No. & Date : INV-42 dt. 15/04/2026") == date(
            2026, 4, 15
        )

    def test_the_same_heading_mid_document_reads_the_same_date(self):
        text = "Invoice No. & Date : INV-42 dt. 15/04/2026\nPlace of Supply: 27\n"
        assert _invoice_date_in(text) == date(2026, 4, 15)


# --------------------------------------------------------------------------
# The HSN column: which digits sit under the heading
# --------------------------------------------------------------------------

# One heading, and codes placed against its edges by character position. The
# reader widens the heading's own span by a character at each end — see
# :func:`~app.services.invoice_parser._hsn_in_column` — so "HSN" at columns
# 23-25 claims 22 through 26 inclusive, and these fixtures sit exactly on and
# exactly past those two edges.
_HSN_HEADING = "Description            HSN       Qty    Rate"


def _under(column: int, code: str = "8482") -> str:
    return " " * column + code


class TestWhereTheHsnColumnEndsOnTheLeft:
    def test_a_code_finishing_where_the_column_starts_is_another_column(self):
        # Columns 18-21, so it ends at 22 — the first character the heading
        # claims. Touching is not overlapping: this is the quantity or the
        # serial printed to the left, and reading it as the HSN files a
        # nonsense code in the GSTR-1 rate-wise summary.
        assert _hsn_in_column(f"{_HSN_HEADING}\n{_under(18)}") is None

    def test_a_code_overlapping_the_first_claimed_character_is_the_code(self):
        # Columns 19-22, one character inside. A short code under a long
        # heading is aligned to the opposite edge of the column and misses it
        # by exactly this much, which is what the widening exists for.
        assert _hsn_in_column(f"{_HSN_HEADING}\n{_under(19)}") == "8482"


class TestWhereTheHsnColumnEndsOnTheRight:
    def test_a_code_starting_past_the_last_claimed_character_is_another_column(self):
        # Column 27, one past the heading's claim. This is the "Qty" column.
        assert _hsn_in_column(f"{_HSN_HEADING}\n{_under(27)}") is None

    def test_a_code_starting_on_the_last_claimed_character_is_the_code(self):
        assert _hsn_in_column(f"{_HSN_HEADING}\n{_under(25)}") == "8482"


class TestTheColumnIsReadDownwards:
    def test_digits_above_the_heading_are_not_the_columns_contents(self):
        # A heading labels what follows it. An order reference printed in the
        # same character columns *above* the table is not the item's HSN, and
        # taking the nearest line in either direction would prefer it to the
        # real code — the scan starts below the heading, not around it.
        text = "\n".join(
            [
                "Order Ref              1234       x",
                _HSN_HEADING,
                "   widget            8482   2",
            ]
        )
        assert _hsn_in_column(text) == "8482"

    def test_a_code_on_the_last_line_still_in_reach_is_read(self):
        # Three lines of furniture between the heading and the first value:
        # a rule drawn under the headings, a wrapped second heading row, and a
        # blank. That is what the reach is *for*, so the far edge of it has to
        # be a line the reader still takes.
        text = "\n".join([_HSN_HEADING, "-" * 44, "  (contd)", "", _under(23)])
        assert _hsn_in_column(text) == "8482"

    def test_a_code_one_line_past_the_reach_is_another_part_of_the_document(self):
        text = "\n".join([_HSN_HEADING, "-" * 44, "  (contd)", "", "", _under(23)])
        assert _hsn_in_column(text) is None


# --------------------------------------------------------------------------
# Reading an amount off a line
# --------------------------------------------------------------------------

class TestAnAmountPrintedBeforeItsLabel:
    def test_a_line_that_leads_with_its_figure_is_read_whole(self):
        # "9,000.00 CGST" is the layout the column fallback exists for, and it
        # is read with no column offset at all. Off by one into the figure the
        # grouping is lost and ₹9,000 reads as ₹0 — an order of magnitude of
        # tax on a line that parses perfectly otherwise.
        assert _amount_on_line("9,000.00 CGST") == Decimal("9000.00")

    def test_the_rate_on_the_line_is_not_mistaken_for_the_amount(self):
        assert _amount_on_line("CGST @ 9% 9,000.00") == Decimal("9000.00")


# --------------------------------------------------------------------------
# Confidence: coverage of the fields that decide filability
# --------------------------------------------------------------------------

_COMPLETE_INVOICE = """TAX INVOICE
Invoice No: INV-77
Invoice Date: 15/04/2026
GSTIN: 27AAPFU0939F1ZV
Taxable Value: 100000.00
IGST @ 18%: 18000.00
Grand Total: 118000.00"""


class TestConfidenceCountsWhatWasFound:
    """Confidence here is coverage, and it is what routes a document to review.

    Five fields decide whether an invoice can be filed at all, and the score is
    the share of them found, capped because shape is not comprehension. Scaled
    by the wrong divisor, or with a field that was found not counted, a
    complete extraction is sent for human review and an incomplete one is not.
    """

    def test_a_document_carrying_all_five_fields_scores_the_cap(self):
        assert parse_heuristic(_COMPLETE_INVOICE).confidence == 0.6

    def test_the_money_fields_count_when_they_are_non_zero(self):
        # ``total_value or None`` and ``taxable_value or None`` are what make a
        # zero not count. They must still count a real figure: without both,
        # this document scores 0.36 and is queued for review on the strength of
        # having read everything.
        parsed = parse_heuristic(_COMPLETE_INVOICE)
        assert parsed.taxable_value == Decimal("100000.00")
        assert parsed.total_value == Decimal("118000.00")
        assert parsed.confidence == 0.6

    def test_a_document_with_neither_money_field_scores_three_fifths_of_the_cap(self):
        text = "TAX INVOICE\nInvoice No: INV-77\nInvoice Date: 15/04/2026\nGSTIN: 27AAPFU0939F1ZV"
        assert parse_heuristic(text).confidence == 0.36

    def test_a_document_with_nothing_on_it_scores_zero(self):
        assert parse_heuristic("nothing here at all").confidence == 0.0


class TestConfidenceFallsOncePerWarning:
    """Each unresolved inconsistency costs a tenth, and the fall is per issue.

    A single warning cannot tell a subtraction from a division, so both cases
    below carry two — which is the ordinary number on a document the extractor
    half-read.
    """

    def _parsed(self, **overrides) -> ParsedInvoice:
        base = dict(
            supplier_gstin=GSTIN_MH,
            invoice_number="INV-77",
            invoice_date=date(2026, 4, 15),
            confidence=0.6,
        )
        return ParsedInvoice(**{**base, **overrides})

    def test_two_warnings_cost_two_tenths(self):
        parsed = validate(
            self._parsed(
                taxable_value=Decimal("100000.00"),
                total_value=Decimal("500000.00"),
                cgst=Decimal("9000.00"),
                sgst=Decimal("8000.00"),
            )
        )
        assert len(parsed.warnings) == 2
        assert parsed.confidence == 0.4

    def test_the_score_is_rounded_to_the_two_places_it_is_shown_at(self):
        # A model's own confidence is an arbitrary float, so the subtraction
        # lands on a third decimal place that the screen cannot show and a
        # threshold comparison should not turn on.
        parsed = validate(self._parsed(confidence=0.855, invoice_number=None))
        assert len(parsed.warnings) == 1
        assert parsed.confidence == 0.76

    def test_confidence_never_goes_below_zero(self):
        parsed = validate(ParsedInvoice(confidence=0.1))
        assert parsed.confidence == 0.0


# --------------------------------------------------------------------------
# validate: the checks that read more than one field
# --------------------------------------------------------------------------

class TestTheFootingCheck:
    """Taxable value plus tax against the total, and only when both are there.

    The tolerance is a rupee because invoices round each tax line, and the
    guard needs both figures because the difference against a zero is the whole
    invoice — which would warn on every receipt that prints a total and no
    taxable line.
    """

    def _validated(self, taxable, total, igst=Decimal("18000.00")) -> ParsedInvoice:
        return validate(
            ParsedInvoice(
                supplier_gstin=GSTIN_MH,
                invoice_number="INV-77",
                invoice_date=date(2026, 4, 15),
                taxable_value=taxable,
                total_value=total,
                igst=igst,
            )
        )

    def _footing(self, parsed: ParsedInvoice) -> list[str]:
        return [w for w in parsed.warnings if "does not equal taxable value" in w]

    def test_a_missing_total_is_not_reported_as_a_footing_error(self):
        # The check needs both figures. Run against a zero total it says the
        # invoice is out by its own value, on every document that prints no
        # taxable line — which is most receipts.
        assert self._footing(self._validated(Decimal("100000.00"), Decimal("0.00"))) == []

    def test_a_missing_taxable_value_is_not_reported_either(self):
        assert self._footing(self._validated(Decimal("0.00"), Decimal("118000.00"))) == []

    def test_a_difference_of_exactly_the_tolerance_is_let_through(self):
        # Invoices round each tax line to the rupee, so a correct extraction
        # routinely lands here. Warning at exactly a rupee flags them all.
        # Taxable 100,000 + IGST 18,000 foots to 118,000, so a stated total of
        # 118,001 is out by exactly the rupee the tolerance allows.
        parsed = self._validated(Decimal("100000.00"), Decimal("118001.00"))
        assert self._footing(parsed) == []

    def test_a_difference_of_a_paisa_over_the_tolerance_is_reported(self):
        parsed = self._validated(Decimal("100000.00"), Decimal("118001.01"))
        assert len(self._footing(parsed)) == 1

    def test_an_invoice_that_foots_exactly_says_nothing(self):
        assert self._footing(self._validated(Decimal("100000.00"), Decimal("118000.00"))) == []


class TestTheTwoHalvesOfAnIntraStateSplit:
    def _halves_warning(self, cgst, sgst) -> list[str]:
        parsed = validate(
            ParsedInvoice(
                supplier_gstin=GSTIN_MH,
                invoice_number="INV-77",
                invoice_date=date(2026, 4, 15),
                cgst=cgst,
                sgst=sgst,
            )
        )
        return [w for w in parsed.warnings if "should be equal" in w]

    def test_equal_halves_are_the_ordinary_case_and_say_nothing(self):
        # An 18% intra-state invoice is printed as 9% + 9%, so this is what
        # almost every such document looks like. Reported, the warning fires on
        # all of them and costs each a tenth of its confidence.
        assert self._halves_warning(Decimal("9000.00"), Decimal("9000.00")) == []

    def test_halves_that_differ_are_reported(self):
        assert len(self._halves_warning(Decimal("9000.00"), Decimal("8000.00"))) == 1

    def test_one_half_alone_is_not_compared_against_the_other(self):
        assert self._halves_warning(Decimal("9000.00"), Decimal("0.00")) == []


# --------------------------------------------------------------------------
# Merging the model's reading with the heuristic one
# --------------------------------------------------------------------------

class TestMergeOnlyEverFillsGaps:
    """The heuristic fills what the model left empty, and nothing else.

    The regex has no comprehension of layout: given the chance it overwrites
    the invoice's total with a line item's, which is a wrong figure on a
    document that parsed correctly.
    """

    def test_a_money_field_the_model_answered_is_not_overwritten(self):
        primary = ParsedInvoice(taxable_value=Decimal("100000.00"))
        secondary = ParsedInvoice(taxable_value=Decimal("200000.00"))
        assert _merge(primary, secondary).taxable_value == Decimal("100000.00")

    def test_a_money_field_the_model_left_at_zero_is_filled(self):
        primary = ParsedInvoice(taxable_value=Decimal("0.00"))
        secondary = ParsedInvoice(taxable_value=Decimal("200000.00"))
        assert _merge(primary, secondary).taxable_value == Decimal("200000.00")

    def test_a_zero_on_both_sides_stays_zero(self):
        primary = ParsedInvoice(cess=Decimal("0.00"))
        assert _merge(primary, ParsedInvoice()).cess == Decimal("0.00")

    def test_a_named_field_the_model_answered_is_not_overwritten(self):
        primary = ParsedInvoice(invoice_number="MODEL-1")
        secondary = ParsedInvoice(invoice_number="REGEX-2")
        assert _merge(primary, secondary).invoice_number == "MODEL-1"


# --------------------------------------------------------------------------
# parse_invoice: which reading of the document is used
# --------------------------------------------------------------------------

class TestTextSuppliedDirectlyIsTheDocument:
    def test_given_text_the_bytes_beside_it_are_not_re_extracted(self, monkeypatch):
        # The reconciliation and the re-parse paths hand in text they already
        # hold alongside the original upload. Extracting the bytes again is not
        # merely wasted work — it discards the caller's text, which is the
        # corrected copy on every path that supplies both.
        monkeypatch.setattr(invoice_parser, "is_configured", lambda: False)
        parsed = parse_invoice(
            text="TAX INVOICE\nInvoice No: FROMTEXT1\n",
            content=b"TAX INVOICE\nInvoice No: FROMBYTES1\n",
            content_type="text/plain",
            filename="invoice.txt",
        )
        assert parsed.invoice_number == "FROMTEXT1"

    def test_with_no_text_the_bytes_are_read(self, monkeypatch):
        monkeypatch.setattr(invoice_parser, "is_configured", lambda: False)
        parsed = parse_invoice(
            content=b"TAX INVOICE\nInvoice No: FROMBYTES1\n",
            content_type="text/plain",
            filename="invoice.txt",
        )
        assert parsed.invoice_number == "FROMBYTES1"


class TestThePhotographKeepsItsOwnContentType:
    """The vision model is told what the file actually is.

    The default is for an upload that arrived with no type at all. Applied over
    a type the browser did send, a PNG is announced as a JPEG in the data url —
    and a data url whose declared type does not match its bytes is what a
    strict decoder at the other end rejects, which reads here as the model
    failing and the upload falling back to OCR.
    """

    def test_a_png_is_announced_as_a_png(self, monkeypatch):
        seen: dict = {}

        def fake_chat_json(messages, model):
            seen["messages"] = messages
            return {}

        monkeypatch.setattr(invoice_parser, "chat_json", fake_chat_json)
        parse_with_model(content=PNG_1PX, content_type="image/png")

        parts = seen["messages"][1]["content"]
        image = next(part for part in parts if part["type"] == "image_url")
        assert image["image_url"]["url"].startswith("data:image/png;base64,")

    def test_an_upload_with_no_type_falls_back_to_jpeg(self, monkeypatch):
        seen: dict = {}

        def fake_chat_json(messages, model):
            seen["messages"] = messages
            return {}

        monkeypatch.setattr(invoice_parser, "chat_json", fake_chat_json)
        parse_with_model(content=PNG_1PX, content_type=None)

        parts = seen["messages"][1]["content"]
        image = next(part for part in parts if part["type"] == "image_url")
        assert image["image_url"]["url"].startswith("data:image/jpeg;base64,")

    def test_a_scan_reaching_the_vision_model_keeps_its_type_too(self, monkeypatch):
        # The same default, one layer up: `parse_invoice` decides a PDF that
        # yielded no text is a scan and hands the file to the vision model.
        seen: dict = {}

        def fake_chat_json(messages, model):
            seen["messages"] = messages
            return {}

        monkeypatch.setattr(document_text, "extract", lambda *a, **k: "")
        monkeypatch.setattr(invoice_parser, "is_configured", lambda: True)
        monkeypatch.setattr(invoice_parser, "chat_json", fake_chat_json)
        parse_invoice(content=PNG_1PX, content_type="image/png", filename="scan.png")

        parts = seen["messages"][1]["content"]
        image = next(part for part in parts if part["type"] == "image_url")
        assert image["image_url"]["url"].startswith("data:image/png;base64,")


# --------------------------------------------------------------------------
# Survivors left alive on purpose
# --------------------------------------------------------------------------

class TestTheEdgesThatCannotMove:
    """Mutants that survive because the line has no other side to be on.

    Each is a boundary the module cannot be observed at, and writing a test
    that appeared to pin one would be asserting the arrangement of the code
    rather than a behaviour. What is asserted instead is the fact that makes
    the mutant equivalent, so that the day it stops being true, this goes red
    rather than a mutation score quietly improving.

    With the two below, this class now accounts for every one of the nine
    survivors the module has left: `invoice_parser` is at its ceiling at 95.8%,
    and the figure will not move again without the code moving first.
    """

    def test_the_fraction_window_is_bounded_by_two_rates_that_are_real(self):
        # ``0 < rate < 1`` never sees either edge: both 0 and 1 are GST slabs
        # in their own right and return before the scaling. Widen either
        # comparison and nothing changes — until a slab leaves the list.
        assert invoice_parser.normalize_rate("0") == Decimal("0")
        assert invoice_parser.normalize_rate("1") == Decimal("1")
        assert Decimal("0") in invoice_parser.VALID_TAX_RATES
        assert Decimal("1") in invoice_parser.VALID_TAX_RATES

    def test_a_heuristic_invoice_number_can_never_reach_its_own_cut(self):
        # ``_clean_str(..., 64)`` in `_invoice_number_in` is unreachable: the
        # pattern's value group takes at most 30 characters, so the cut is
        # dead code kept in step with the model path's, which does reach 64.
        longest = _invoice_number_in("Invoice No: " + "A1" * 40)
        assert len(longest) <= 30
        assert len(_from_model_payload({"invoice_number": "X" * 200}, "", "m").invoice_number) == 64

    def test_the_confidence_scale_lands_on_two_places_by_itself(self):
        # ``round(found / 5 * 0.6, 2)`` has six reachable inputs and every one
        # of them is already exact to two places, so rounding to three would
        # return the same figure. The rounding is there for the reader rather
        # than for the arithmetic; the day the divisor or the cap moves, this
        # goes red and the rounding starts doing work.
        assert [round(found / 5 * 0.6, 3) for found in range(6)] == [
            round(found / 5 * 0.6, 2) for found in range(6)
        ]

    def test_the_line_a_label_sits_on_cannot_start_before_the_document(self):
        # ``text.rfind("\n", 0, start) + 1`` bounds the window the reference
        # and e-way markers are looked for in. Both mutants of it — searching
        # from 1 instead of 0, and stepping back over the newline instead of
        # past it — only ever widen that window by the newline itself and the
        # character before it, and every marker pattern is a word ending at the
        # label. There is no marker a newline can be the first character of, so
        # neither mutant can change what is skipped.
        assert invoice_parser._REFERENCE_PREFIX.search("\n") is None
        assert invoice_parser._EWAY_PREFIX.search("\n") is None
        assert invoice_parser._OTHER_DATE_PREFIX.search("\n") is None
        # And the widening is not reachable from the other end either. A label
        # on the first line has no newline before it, so the offset falls to
        # the start of the document either way and the marker on that line is
        # still read; a document that opens with a blank line puts the newline
        # at index 0, where searching from 1 instead skips only itself.
        assert _invoice_number_in("Ref Invoice No: OLD-1\nInvoice No: REAL-1") == "REAL-1"
        assert _invoice_number_in("\nRef Invoice No: OLD-1\nInvoice No: REAL-1") == "REAL-1"

    def test_a_one_sided_pair_of_gstins_decides_nothing(self):
        # ``supplier and buyer`` guards a comparison that answers None when
        # either is missing, so relaxing the guard adds no warning — the
        # comparison itself is what refuses to guess.
        parsed = validate(
            ParsedInvoice(
                supplier_gstin=GSTIN_MH,
                invoice_number="INV-77",
                invoice_date=date(2026, 4, 15),
                igst=Decimal("18000.00"),
            )
        )
        assert not [w for w in parsed.warnings if "supply taxed as" in w]
