"""Edge cases for the input cleaning applied at the edge.

The interesting inputs here are not "a name with an apostrophe" — SQLAlchemy
binds parameters and that was never a problem. They are the ones that turn a
value into something other than data: a wildcard that makes an indexed search a
full scan, a newline that forges a log line, a filename that walks out of the
upload directory.
"""
from __future__ import annotations

import pytest

from app.core.sanitize import (
    clean_text,
    escape_like,
    safe_extension,
    safe_filename,
    search_pattern,
    strip_control_chars,
)


class TestCleanText:
    def test_none_stays_none(self):
        assert clean_text(None) is None

    def test_a_field_of_only_whitespace_becomes_none(self):
        # Not "" — an empty string in a nullable column means "the user typed
        # nothing", which is what NULL already says, and two spellings of
        # absent break every downstream `is None` check.
        assert clean_text("   \t  ") is None

    def test_runs_of_whitespace_collapse(self):
        # Names pasted out of a PDF carry these, and "ACME  LIMITED" would
        # otherwise be a different counterparty from "ACME LIMITED".
        assert clean_text("ACME   \t  LIMITED") == "ACME LIMITED"

    def test_decomposed_and_composed_spellings_normalise_together(self):
        # The same name typed on two devices must dedupe to one supplier.
        composed = clean_text("Ünïted")
        decomposed = clean_text("Ünïted")
        assert composed == decomposed

    def test_a_bidi_override_is_removed(self):
        # A right-to-left override renders an invoice differently from the one
        # that was approved — a spoof, not a formatting quirk.
        assert clean_text("Acme‮DTL") == "AcmeDTL"

    def test_a_newline_cannot_survive_into_a_logged_value(self):
        assert "\n" not in (clean_text("Acme\nGSTIN: forged") or "")

    def test_a_zero_width_space_is_removed(self):
        assert clean_text("Ac​me") == "Acme"

    def test_length_is_bounded(self):
        assert len(clean_text("x" * 5000, max_length=100)) == 100

    def test_the_default_bound_is_the_one_the_columns_are_sized_for(self):
        """Every caller that omits `max_length` gets this number.

        Passing an explicit bound, as the test above does, leaves the default
        itself unasserted — and the default is what the model columns and the
        API schemas were sized against.
        """
        assert len(clean_text("x" * 5000)) == 500

    def test_truncation_that_leaves_nothing_gives_none(self):
        assert clean_text("    ", max_length=2) is None


class TestStripControlChars:
    def test_newlines_are_kept_when_asked(self):
        assert strip_control_chars("a\nb", keep_newlines=True) == "a\nb"

    def test_newlines_go_by_default(self):
        assert strip_control_chars("a\nb") == "ab"

    def test_a_null_byte_never_survives(self):
        # Reaches a filesystem call in the upload path, where it truncates the
        # path in the C layer.
        assert strip_control_chars("a\x00b", keep_newlines=True) == "ab"


class TestEscapeLike:
    def test_a_bare_wildcard_is_escaped(self):
        # Unescaped, this is a full scan of the tenant's invoices per keystroke.
        assert escape_like("%") == "\\%"

    def test_underscore_is_escaped(self):
        assert escape_like("a_b") == "a\\_b"

    def test_the_escape_character_itself_is_escaped_first(self):
        # If it were not, escaping "\%" would produce "\\%" — a literal
        # backslash followed by a live wildcard.
        assert escape_like("\\%") == "\\\\\\%"

    def test_ordinary_text_is_untouched(self):
        assert escape_like("Northwind Supplies") == "Northwind Supplies"


class TestSearchPattern:
    def test_none_and_blank_mean_no_filter(self):
        assert search_pattern(None) is None
        assert search_pattern("   ") is None

    def test_the_default_bound_keeps_a_pasted_page_out_of_a_like_clause(self):
        """A search term becomes `%term%` against an indexed column.

        The endpoint caps the query parameter at 100 too, but this function is
        the one that has to hold when it is called from anywhere else.
        """
        pattern = search_pattern("x" * 5000)
        assert pattern == "%" + "x" * 100 + "%"

    def test_a_term_is_wrapped_in_wildcards(self):
        assert search_pattern("acme") == "%acme%"

    def test_a_wildcard_in_the_term_is_neutralised(self):
        # The user's "%" must match a literal percent, not everything.
        assert search_pattern("50%") == "%50\\%%"


class TestSafeFilename:
    @pytest.mark.parametrize(
        "attack",
        [
            "../../etc/passwd",
            "..\\..\\windows\\system32\\config",
            "/etc/passwd",
            "....//....//etc/passwd",
        ],
    )
    def test_traversal_never_survives(self, attack):
        result = safe_filename(attack)
        assert "/" not in result
        assert "\\" not in result
        assert ".." not in result

    def test_a_leading_dot_is_stripped(self):
        # ".bashrc" written into a directory listing is at best confusing.
        assert not safe_filename(".bashrc").startswith(".")

    def test_a_normal_name_is_left_readable(self):
        # The point is not to mangle every file — the user has to recognise
        # their own invoice in the list.
        assert safe_filename("Invoice Apr-2024.pdf") == "Invoice Apr-2024.pdf"

    def test_a_newline_cannot_reach_a_content_disposition_header(self):
        assert "\n" not in safe_filename("in\nvoice.pdf")
        assert "\r" not in safe_filename("in\r\nvoice.pdf")

    def test_an_empty_or_missing_name_falls_back(self):
        assert safe_filename(None) == "upload"
        assert safe_filename("") == "upload"
        # Reduces to nothing after cleaning, which is the same case.
        assert safe_filename("...") == "upload"
        assert safe_filename("///") == "upload"

    def test_length_is_bounded(self):
        assert len(safe_filename("x" * 500)) == 120

    def test_unicode_is_replaced_rather_than_rejected(self):
        # A phone that titled the photo in Devanagari should not fail an
        # upload. The name is cosmetic — the stored file is a UUID — so each
        # character becoming "_" is the right trade against refusing the file.
        assert safe_filename("बिल.pdf") == "___.pdf"


class TestSafeExtension:
    def test_a_plain_extension_is_lowercased(self):
        assert safe_extension("INVOICE.PDF") == ".pdf"

    def test_no_extension_gives_empty(self):
        assert safe_extension("invoice") == ""
        assert safe_extension(None) == ""

    def test_a_non_alphanumeric_extension_is_refused(self):
        # ".php:jpg", ".tar.gz " and friends: the stored file keeps its UUID
        # name anyway, so "" is a safe answer rather than a lossy one.
        assert safe_extension("shell.php;jpg") == ""
        assert safe_extension("x.p df") == ""

    def test_a_double_extension_takes_only_the_last(self):
        assert safe_extension("invoice.pdf.exe") == ".exe"

    def test_an_absurdly_long_extension_is_bounded_rather_than_refused(self):
        """The extension is appended to a path, so its length is not cosmetic.

        Truncating keeps it alphanumeric, so the result is still a valid
        extension rather than the "" that a rejection would give.
        """
        assert safe_extension("invoice." + "a" * 400) == "." + "a" * 10
