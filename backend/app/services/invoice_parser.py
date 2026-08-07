"""Turn an uploaded invoice into the structured fields GST filing needs.

Two extractors, tried in order:

1. **The model.** An OpenRouter free model reads the invoice text — or the
   image itself, via a free vision model — and returns JSON.
2. **Heuristics.** Regexes for the fields that have a fixed shape on an Indian
   tax invoice: the GSTIN (checksummed, so a hit is almost never a false one),
   the invoice number, the date, the tax amounts.

The heuristic pass is not only a fallback. It runs *after* a successful model
call too, to fill fields the model left blank and to overrule a GSTIN it
hallucinated — a 15-character string either passes the mod-36 check digit or
it does not, and that is a stronger signal than the model's confidence. What
comes back is a :class:`ParsedInvoice` with a confidence the caller can route
on, never an exception: a free-tier rate limit must not lose someone's invoice.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.core.config import settings
from app.models.mixins import MONEY_MAX
from app.services import document_text, gst_calendar
from app.services import gstin as gstin_service
from app.services.openrouter_client import OpenRouterError, chat_json, image_data_url, is_configured

logger = logging.getLogger(__name__)

# The rates GST actually levies, and the one definition of them. An extracted
# rate outside this set is a misread — most often a total mistaken for a
# percentage — and there is no 15% or 20% slab to be generous about.
#
# This module owns the list because it is the lowest one that needs it, and
# ``app.services.filing`` imports it rather than keeping a second copy. It had
# a second copy, and the two disagreed: filing knew about 0.1%, 1%, 1.5%, 6%
# and 7.5% and the parser did not, so every invoice on one of those slabs had
# its rate discarded here as impossible and reached filing with nothing in the
# field. That is not a cosmetic loss — filing's "tax does not match rate x
# taxable value" check is skipped when there is no rate to apply, so precisely
# the invoices whose rate the product could not read were also the ones whose
# arithmetic it never verified.
#
# 1.5% is the affordable-housing rate and 0.1% is the merchant-export one;
# both are printed on real invoices, halved into CGST and SGST, and both now
# survive the round trip.
VALID_TAX_RATES = (
    Decimal("0"),
    Decimal("0.1"),
    Decimal("0.25"),
    Decimal("1"),
    Decimal("1.5"),
    Decimal("3"),
    Decimal("5"),
    Decimal("6"),
    Decimal("7.5"),
    Decimal("12"),
    Decimal("18"),
    Decimal("28"),
)

# A number with optional Indian digit grouping and up to two decimals.
_NUMBER_PATTERN = re.compile(r"-?\d[\d,]*(?:\.\d{1,2})?")

# An exponent immediately after such a match, which means the match is only the
# mantissa of a number the pattern above cannot express.
#
# The pattern is deliberately narrow — an invoice does not print ``2E5`` — but
# narrow is not the same as safe, because ``search`` returns a *prefix* rather
# than nothing. ``"1E+100"`` matched ``"1"``, so the ceiling in :func:`to_money`
# was handed the figure one and agreed with it: an amount a hundred orders of
# magnitude out did not fail a bound, it silently became a rupee. ``"1.5E+30"``
# became one rupee fifty.
#
# It is reachable from both directions. A model asked for JSON emits ``1e300``
# as a bare float — caught — but ``"1.2e5"`` as a string when it decides to
# quote its numbers, and a spreadsheet exported to CSV writes any wide column
# in exactly this form.
#
# So a truncated match is refused rather than used. Refusing leaves a zero and,
# on the model path, a warning naming what was dropped; using the mantissa
# leaves a plausible small number with nothing to show it was ever anything
# else. The first is a tax box a reviewer can see is empty, and the second is a
# figure nobody has any reason to look at twice.
_EXPONENT_SUFFIX = re.compile(r"[eE][+-]?\d")

_EXTRACTION_SCHEMA = """{
  "supplier_gstin": "15-char GSTIN of the party who issued the invoice, or null",
  "supplier_name": "legal or trade name of the issuer, or null",
  "buyer_gstin": "15-char GSTIN of the recipient, or null",
  "buyer_name": "name of the recipient, or null",
  "invoice_number": "the invoice/bill number exactly as printed, or null",
  "invoice_date": "YYYY-MM-DD, or null",
  "place_of_supply": "2-digit state code, or null",
  "hsn_code": "HSN/SAC of the main line item, or null",
  "taxable_value": "number, total value before tax",
  "cgst": "number, 0 if absent",
  "sgst": "number, 0 if absent",
  "igst": "number, 0 if absent",
  "cess": "number, 0 if absent",
  "total_value": "number, invoice grand total including tax",
  "tax_rate": "number as a percentage, e.g. 18, or null if the invoice mixes rates",
  "reverse_charge": "true only if the invoice says reverse charge applies",
  "line_items": [{"description": "string", "hsn_code": "string or null",
                  "quantity": "number or null", "taxable_value": "number",
                  "tax_rate": "number or null"}],
  "confidence": "number 0-1, how sure you are of the fields above"
}"""

_SYSTEM_PROMPT = (
    "You extract structured data from Indian GST tax invoices. "
    "You reply with one JSON object and nothing else — no prose, no markdown fence. "
    "Copy values exactly as printed; never invent a GSTIN, an invoice number or an amount. "
    "Use null for anything the document does not show. "
    "Amounts are plain numbers without currency symbols, commas or spaces. "
    "On an intra-state invoice tax is split into CGST and SGST and IGST is 0; "
    "on an inter-state invoice the whole tax is IGST and CGST/SGST are 0."
)


@dataclass
class ParsedInvoice:
    """What the extractors agreed on, plus how it was obtained."""

    supplier_gstin: str | None = None
    supplier_name: str | None = None
    buyer_gstin: str | None = None
    buyer_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    place_of_supply: str | None = None
    hsn_code: str | None = None
    taxable_value: Decimal = Decimal("0.00")
    cgst: Decimal = Decimal("0.00")
    sgst: Decimal = Decimal("0.00")
    igst: Decimal = Decimal("0.00")
    cess: Decimal = Decimal("0.00")
    total_value: Decimal = Decimal("0.00")
    tax_rate: Decimal | None = None
    reverse_charge: bool = False
    line_items: list[dict] = field(default_factory=list)

    raw_text: str = ""
    parsed_with: str = "heuristic"
    confidence: float = 0.0
    # Human-readable problems: an unbalanced total, an invalid GSTIN, a rate
    # that is not a real GST rate. Shown to the user, never a reason to drop
    # the invoice — a flagged invoice can be corrected, a rejected one is
    # retyped from paper.
    warnings: list[str] = field(default_factory=list)

    @property
    def total_tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst + self.cess

    @property
    def period(self) -> str | None:
        """Filing period as ``YYYY-MM``."""
        return self.invoice_date.strftime("%Y-%m") if self.invoice_date else None

    def as_dict(self) -> dict:
        """JSON-safe view, for storing on the invoice row."""
        return {
            "supplier_gstin": self.supplier_gstin,
            "supplier_name": self.supplier_name,
            "buyer_gstin": self.buyer_gstin,
            "buyer_name": self.buyer_name,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "place_of_supply": self.place_of_supply,
            "hsn_code": self.hsn_code,
            "taxable_value": str(self.taxable_value),
            "cgst": str(self.cgst),
            "sgst": str(self.sgst),
            "igst": str(self.igst),
            "cess": str(self.cess),
            "total_value": str(self.total_value),
            "tax_rate": str(self.tax_rate) if self.tax_rate is not None else None,
            "reverse_charge": self.reverse_charge,
            "line_items": self.line_items,
            "confidence": self.confidence,
            "parsed_with": self.parsed_with,
            "warnings": self.warnings,
        }


# --------------------------------------------------------------------------
# Coercion helpers — everything below tolerates whatever a model or an OCR
# pass produced, because the alternative is a 500 on a blurry photograph.
# --------------------------------------------------------------------------

def to_decimal(value: object, default: Decimal | None = Decimal("0.00")) -> Decimal | None:
    """Coerce a model/OCR value to Decimal, or *default* if it is not a number.

    Handles the Indian digit grouping (``1,23,456.00``) and stray currency
    symbols, both of which appear constantly in extracted text.
    """
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, Decimal):
        return value if value.is_finite() else default
    if isinstance(value, int | float):
        # ``Decimal(str(inf))`` is ``Decimal('Infinity')``, which is a Decimal
        # and is not a number anything here can do arithmetic with. It is
        # reachable: ``json.loads`` accepts the bare ``Infinity`` and ``NaN``
        # tokens by default, so a portal export or a model response containing
        # one arrives as a float and would be coerced rather than rejected.
        coerced = Decimal(str(value))
        return coerced if coerced.is_finite() else default
    # Match the number rather than stripping non-digits: stripping leaves the
    # full stop in "Rs. 1000.50" behind, and ".1000.50" is not a Decimal.
    text = str(value)
    match = _NUMBER_PATTERN.search(text)
    if match is None:
        return default
    # Only the mantissa of a scientific-notation number was matched, so the
    # digits in hand are not the figure. See :data:`_EXPONENT_SUFFIX`.
    if _EXPONENT_SUFFIX.match(text, match.end()):
        return default
    try:
        return Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return default


def to_money(value: object, default: Decimal | None = Decimal("0.00")) -> Decimal | None:
    """Coerce *value* to an amount a money column can hold, or *default*.

    :func:`to_decimal` answers "is this a number"; this answers "is this an
    amount", and the two are not the same question. ``Numeric(16, 2)`` holds
    fourteen digits before the point, and nothing above that is a figure any
    invoice carries — but every door into this product would take one. A model
    asked for JSON can emit ``1e300``; a hand-edited GSTR-2B can carry a run of
    forty digits; ``json.loads`` will hand over a bare ``Infinity``.

    What made it worth a check of its own is where the failure lands. The write
    succeeds — Postgres refuses the INSERT, but SQLite keeps whatever it was
    handed, so the two backends disagree about whether there is a problem at
    all — and the *read* is what breaks. Every figure in this product is
    quantized to the paisa on its way out, and ``Decimal.quantize`` raises
    ``InvalidOperation`` rather than rounding once a result needs more than the
    context's 28 significant digits. So one overlarge amount is not a wrong
    number on one screen: it is a 500 on the dashboard, the ITC summary and the
    GSTR-3B preview, for as long as the row is there, caused by a write that
    answered 200.

    Out of range is discarded rather than clamped. Clamping invents a figure of
    ninety-nine thousand crore and files it; discarding leaves the field at
    zero where a reviewer can see it is missing, which is the same trade the
    parser already makes for a GSTIN it cannot believe.
    """
    coerced = to_decimal(value, default=None)
    if coerced is None or not coerced.is_finite() or abs(coerced) > MONEY_MAX:
        return default
    return coerced


# What a document, a portal export or a model says for "no" — and for "yes".
# Kept as sets rather than as a regex because these are whole answers, not
# substrings: "not applicable" must not be read as the "applicable" inside it.
_TRUE_WORDS = frozenset({"Y", "YES", "TRUE", "1", "APPLICABLE", "T"})
_FALSE_WORDS = frozenset(
    {"N", "NO", "FALSE", "0", "F", "NA", "N/A", "NOT APPLICABLE", "NONE", "NIL", "-"}
)


def to_flag(value: object, *, default: bool = False) -> bool:
    """Read a yes/no answer, whoever wrote it, or *default* if it is neither.

    ``bool()`` is not this function. It says a non-empty string is true, and
    the strings that arrive here are overwhelmingly the *word* for false:
    "reverse charge: Not Applicable" is printed on a large share of Indian tax
    invoices, and a model asked to copy what the document says copies that.
    Read with ``bool()``, every one of those invoices came back flagged reverse
    charge — which is not a cosmetic mislabel. It moves the tax to table 3.1(d)
    of GSTR-3B as a liability the business must settle in cash, takes the
    invoice's credit out of the pool it belongs in, and on a *sale* prints
    ``rchrg: "Y"`` in the buyer's GSTR-2B, telling a customer they owe tax the
    supplier has already charged them.

    An answer that is neither falls back to *default* rather than guessing,
    which is how the portal's own ``itcavl`` flag keeps defaulting to "credit
    is available" while ``rev`` keeps defaulting to "no".
    """
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float | Decimal):
        return bool(value)
    text = re.sub(r"\s+", " ", str(value)).strip().upper()
    if text in _TRUE_WORDS:
        return True
    if text in _FALSE_WORDS:
        return False
    return default


def to_date(value: object) -> date | None:
    """Parse the date formats that appear on Indian invoices.

    ``DD/MM/YYYY`` is the local convention and ``MM/DD/YYYY`` is what a model
    trained mostly on US documents may emit, so an ambiguous ``03/04/2026`` is
    read day-first. It is the right call more often here, and the day-vs-month
    ambiguity only ever shifts the filing period by a month rather than
    corrupting the amount.
    """
    # datetime subclasses date, so it has to be narrowed first — the other
    # order makes this branch unreachable and returns the datetime unchanged,
    # which is not what the signature promises and puts a time on a column
    # that has no room for one.
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    text = str(value).strip()
    formats = (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
        "%d-%m-%y", "%d/%m/%y", "%d-%b-%Y", "%d %b %Y", "%d %B %Y",
        "%Y/%m/%d",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _clean_str(value: object, max_length: int = 255) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text or text.lower() in {"null", "none", "n/a", "na", "-"}:
        return None
    return text[:max_length]


def normalize_rate(value: object) -> Decimal | None:
    """Coerce a tax rate, dropping anything that is not a real GST rate.

    Public because :mod:`app.services.filing` reads the same rates back off a
    stored ``line_items`` breakdown when it builds a return, and "what counts as
    a rate" must not be answered twice.

    A model asked for "18" sometimes answers "0.18", so a value below 1 is
    read as a fraction and scaled — but only when it is not already a rate in
    its own right. Scaling first made the sub-1% slabs unreachable: 0.25 is a
    real GST rate, it sits in :data:`VALID_TAX_RATES` a few lines above, and it
    was multiplied into 25 — which is not a slab at all — and then discarded.
    An invoice on rough diamonds could therefore never carry its own rate,
    however plainly the document printed it.

    Reading the literal first is unambiguous rather than merely safer, because
    the two readings never both land on a slab. 0.25 as a fraction is 25%, and
    0.1 as a fraction is 10%; neither is a rate GST levies, so preferring the
    literal costs nothing anywhere it does not gain a real one.
    """
    rate = to_decimal(value, default=None)
    if rate is None:
        return None
    if rate in VALID_TAX_RATES:
        return rate
    if Decimal("0") < rate < Decimal("1"):
        rate = rate * 100
    return rate if rate in VALID_TAX_RATES else None


# --------------------------------------------------------------------------
# Heuristic extractor
# --------------------------------------------------------------------------

# "Invoice No.: INV-001" and the dozen other ways a document says the same
# thing. Two details are load-bearing, both learned from the same failure.
#
# The separator is a *run* rather than one character. Invoices write "No.:",
# "No :-", "NO. : " and a bare space, and a pattern accepting exactly one
# punctuation mark matched none of them. That alone would only lose the number
# — but losing it here is not what happened, because `search` does not stop at
# a label that failed. It slid down the line and matched the `inv` alternative
# against the *value*: "Invoice No.: INV-001" found "INV", took the hyphen as
# its separator, and returned "001". The number was not missing, it was
# silently wrong, and a wrong invoice number is the one field that cannot be
# caught downstream — it files into GSTR-1 as the customer's evidence, it is
# what reconciliation matches a GSTR-2B row on, and it is what duplicate
# detection keys on. All three fail quietly and separately.
#
# So the bare hyphen is only a separator *after* an explicit "no"/"number"/
# "#" token, which is what establishes that a label was read at all. Without
# one, "INV-001" standing alone in the text no longer parses as the number
# "001" — it does not parse, and an empty field with a warning on it is a
# reviewable state in a way that a plausible wrong number is not.
#
# That same token is what makes a *one-character* number safe, and the two
# branches below differ only in whether they allow one. "Invoice No: 7" is how
# a business in its first month of trading prints an invoice, and a single
# minimum length of two characters dropped the number from every one of them —
# silently, because there is nothing to see afterwards. A missing invoice
# number is not a cosmetic loss: it files into GSTR-1 as ``inum: ""``, which
# the portal rejects; it is what reconciliation matches a GSTR-2B row on; and
# it is half the natural key duplicate detection uses. All three fail
# separately.
#
# The bare-separator branch keeps the two-character floor, because there the
# label was never confirmed and a single stray character after a full stop is
# noise rather than a document number.
_INVOICE_NO_PATTERN = re.compile(
    r"(?:tax\s+invoice|invoice|inv|bill)[\s.]*"
    r"(?:"
    r"(?:no|number|num|#)[\s:.\-#]*([A-Za-z0-9][A-Za-z0-9\-/]{0,29})"
    r"|"
    r"[:.#][\s:.\-#]*([A-Za-z0-9][A-Za-z0-9\-/]{1,29})"
    r")",
    re.IGNORECASE,
)


def _invoice_number_in(text: str) -> str | None:
    """The document number the text labels, or ``None``.

    The pattern has two value groups — see :data:`_INVOICE_NO_PATTERN` — and
    exactly one of them is filled on any match, so the caller should not have
    to know which branch fired.
    """
    match = _INVOICE_NO_PATTERN.search(text)
    if match is None:
        return None
    return _clean_str(match.group(1) or match.group(2), 64)
# A date, in any of the shapes :func:`to_date` knows how to read.
_DATE_VALUE = r"(\d{1,4}[-/.\s][A-Za-z0-9]{1,9}[-/.\s]\d{2,4})"

# Two patterns rather than one, tried in this order, because an invoice prints
# more than one date and only one of them decides the filing period.
#
# A bare "date" label matches "Due Date" as happily as "Invoice Date" — and a
# payment due date is normally printed *above* the invoice date, so the
# leftmost match is the wrong one. The invoice then files under the month it
# has to be paid in rather than the month it was issued in: one period late,
# in a return that has already been filed by the time anyone reconciles it.
#
# So an explicit invoice-date label wins wherever the document carries one, and
# the loose label is the fallback for documents that only say "Date:". The
# separator is a run for the same reason as in the invoice number above —
# "Date.:" and "DATE. : " are both printed.
_DATE_PATTERN = re.compile(
    r"(?:invoice\s*date|date\s+of\s+invoice|bill\s*date)[\s:.\-]*" + _DATE_VALUE,
    re.IGNORECASE,
)
_LOOSE_DATE_PATTERN = re.compile(
    r"(?:dated|date)[\s:.\-]*" + _DATE_VALUE,
    re.IGNORECASE,
)
_AMOUNT = r"([0-9][0-9,]*\.?\d{0,2})"
# Whole-word labels, matched per line. Anchored on ``\b`` so "GSTIN" can never
# be read as a tax line, and kept separate from the amount so that the rate in
# "IGST @ 18%: 81000.00" cannot be mistaken for the amount — which is what
# happens to any pattern that simply takes the first number after the label.
_TAX_LABELS = {
    "cgst": re.compile(r"\bCGST\b", re.IGNORECASE),
    "sgst": re.compile(r"\bSGST\b", re.IGNORECASE),
    "igst": re.compile(r"\bIGST\b", re.IGNORECASE),
    "cess": re.compile(r"\bCESS\b", re.IGNORECASE),
}
_PERCENT_PATTERN = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*%")
_TAXABLE_PATTERN = re.compile(
    rf"(?:taxable\s*(?:value|amount)|sub\s*-?\s*total|net\s*amount)\s*[:.\-]?\s*(?:INR|Rs\.?|₹)?\s*{_AMOUNT}",
    re.IGNORECASE,
)
_TOTAL_PATTERN = re.compile(
    rf"(?:grand\s*total|total\s*(?:invoice\s*)?(?:value|amount)|amount\s*payable|invoice\s*total)"
    rf"\s*[:.\-]?\s*(?:INR|Rs\.?|₹)?\s*{_AMOUNT}",
    re.IGNORECASE,
)
_HSN_PATTERN = re.compile(r"\b(?:HSN|SAC)(?:\s*/\s*SAC)?\s*(?:code)?\s*[:.\-]?\s*(\d{4,8})\b",
                          re.IGNORECASE)
# "Whether the tax is payable on reverse charge basis" is required on the face
# of every tax invoice by rule 46(p), so the answer is printed on essentially
# all of them — and reading it backwards is expensive in both directions. A
# false yes moves the tax into GSTR-3B table 3.1(d) as a liability that must be
# settled in cash, takes the invoice's credit out of the pool, and on a *sale*
# prints ``rchrg: "Y"`` into the customer's GSTR-2B, telling them they owe tax
# the supplier has already charged. A false no leaves a real liability
# undeclared, with interest running from the due date.
#
# The label and the answer are therefore matched as separate things, because
# the words overlap. "Applicable" is an answer in "Reverse Charge: Applicable"
# and part of the *label* in "Reverse Charge Applicable: No" — and the previous
# pattern, which made the label word optional and then looked for an
# affirmative, could not tell them apart. Failing to match "No", it simply
# backtracked, gave the optional group up, and matched the label's own
# "Applicable" as the answer. So "Reverse Charge Applicable: No" — one of the
# commonest ways an Indian invoice prints this, along with "Whether Reverse
# Charge Applicable: No" — came back flagged reverse charge, which is precisely
# the reading :func:`to_flag` was written to stop and which survived here
# because the answer never reached it.
#
# The label parts are matched possessively, so they cannot be given back to be
# re-read as the answer. A label with no answer after it therefore matches
# nothing at all, which is the right outcome: an unanswered heading is not a
# declaration, and the whole module prefers an empty field a reviewer can see
# to a plausible wrong one.
#
# The answer itself is whatever word follows, negatives included, and
# :func:`to_flag` decides what it means — the same vocabulary that reads the
# model's answer and the portal's flags, rather than a third opinion here. That
# also picks up the affirmatives the old pattern could not reach: "Reverse
# Charge (Y/N): Y" required a separator it had no room for, so an invoice that
# genuinely was reverse charge read as one that was not.
_REVERSE_CHARGE_PATTERN = re.compile(
    r"reverse\s*charge"
    r"(?:\s*\(\s*y\s*/\s*n\s*\))?+"  # "Reverse Charge (Y/N)"
    r"(?:\s+(?:is\s+)?applicable|\s+basis)?+"  # label words, never the answer
    r"\s*[:\-]?\s*"
    r"(not\s+applicable|n\s*/\s*a|yes|no|true|false|applicable|y|n)\b",
    re.IGNORECASE,
)


def _amount_on_line(line: str, *, after: int = 0) -> Decimal | None:
    """The monetary amount on a tax line, ignoring any rate printed on it.

    Invoices put the amount last — ``IGST @ 18%    81,000.00`` — so the last
    number wins, and percentages are removed first so an 18 cannot stand in
    for an 81,000.

    *after* narrows the search to the part of the line beyond a column, which
    is what lets one line carry two heads: see :func:`_tax_amounts_on_line`.
    A column with no number beyond it falls back to the whole line, because
    ``9,000.00 CGST`` prints the amount first and is still one head's figure.

    The cut happens *before* the percentages come out, and the order is the
    whole of it. ``after`` is an offset into the line the caller measured, and
    removing a rate shortens the line ahead of it: strip first and every column
    on the line slides left by as much text as the rates before it occupied,
    while ``after`` goes on pointing at where the label used to be. On
    ``CGST @ 6.00 % 1,111.11 SGST @ 6.00 % 2,222.22 CESS @ 12.00 % 3,333.33``
    that drift is ten characters by the time it reaches the cess column, enough
    to land inside the figure rather than before it — the cut fell after the
    ``3,`` and the head was read as ₹333.33 rather than ₹3,333.33, an order of
    magnitude of cess, silently, on a line that parses perfectly otherwise.
    """
    for candidate in (line[after:], line) if after else (line,):
        numbers = _NUMBER_PATTERN.findall(_PERCENT_PATTERN.sub(" ", candidate))
        if numbers:
            return to_money(numbers[-1], default=None)
    return None


def _tax_amounts_on_line(line: str) -> dict[str, Decimal]:
    """Which tax head each figure on one line belongs to.

    Tax is read a line at a time because the label, the rate and the amount sit
    on one line and only their order tells them apart. What that missed is that
    a line can name *two* heads, and the two ways it does are opposites.

    A line may lay the heads out side by side — ``CGST 9% 9,000.00  SGST 9%
    9,000.00`` — where each head has its own figure and both should be read.
    Reading each head from its own column is what makes that work; taking the
    last number on the line for both is right only by the accident that CGST
    and SGST are always equal.

    Or a line may *combine* them: ``Total Tax (CGST + SGST): 18,000.00``, the
    ordinary way an invoice summarises an intra-state supply. There is one
    figure and it is the total of both heads. Read per label, that ₹18,000
    became ₹18,000 of CGST *and* ₹18,000 of SGST — the tax on the invoice
    doubled, silently, at the moment of extraction.

    Doubled tax is not a display problem in either direction. On a purchase it
    doubles the credit claimed, which is over-claimed ITC with interest and a
    penalty on it. On a sale it doubles the output tax the business is told to
    pay. And it survives review, because every screen shows the same doubled
    figure and the arithmetic on the invoice is not re-derived anywhere a
    reviewer looks.

    The two are told apart by counting: as many figures as heads means a figure
    per head, and fewer means the figure is a combined one that belongs to no
    single head. A combined line is therefore left unread rather than split —
    the split would be a guess, and this module prefers an empty field a
    reviewer can see to a plausible wrong one. What it leaves behind is
    visible: ``validate_period`` reports the total against taxable value plus
    tax and says the figures do not foot.
    """
    found = [
        (match.start(), attr)
        for attr, label in _TAX_LABELS.items()
        if (match := label.search(line))
    ]
    if not found:
        return {}

    stripped = _PERCENT_PATTERN.sub(" ", line)
    if len(_NUMBER_PATTERN.findall(stripped)) < len(found):
        return {}

    found.sort()
    amounts: dict[str, Decimal] = {}
    for index, (start, attr) in enumerate(found):
        # Up to the next head's label, so a column cannot reach past its own
        # into the neighbouring one's figure.
        end = found[index + 1][0] if index + 1 < len(found) else len(line)
        amount = _amount_on_line(line[:end], after=start)
        if amount is not None:
            amounts[attr] = amount
    return amounts


def _rate_on_line(line: str) -> Decimal | None:
    match = _PERCENT_PATTERN.search(line)
    return to_decimal(match.group(1), default=None) if match else None


def parse_heuristic(text: str) -> ParsedInvoice:
    """Extract what can be found by shape alone. Never raises."""
    result = ParsedInvoice(raw_text=text, parsed_with="heuristic")
    if not text:
        return result

    gstins = gstin_service.find_gstins(text)
    if gstins:
        # First GSTIN on an invoice is the issuer's, in the letterhead; the
        # buyer's appears lower, in the "Bill To" block.
        result.supplier_gstin = gstins[0]
        if len(gstins) > 1:
            result.buyer_gstin = gstins[1]

    result.invoice_number = _invoice_number_in(text)
    if match := (_DATE_PATTERN.search(text) or _LOOSE_DATE_PATTERN.search(text)):
        result.invoice_date = to_date(match.group(1))
    if match := _HSN_PATTERN.search(text):
        result.hsn_code = match.group(1)

    # Tax amounts are read line by line, because the label, the rate and the
    # amount all sit on one line and only their order distinguishes them.
    rates: dict[str, Decimal] = {}
    for line in text.splitlines():
        amounts = _tax_amounts_on_line(line)
        for attr, label in _TAX_LABELS.items():
            if not label.search(line):
                continue
            amount = amounts.get(attr)
            if amount is not None and not getattr(result, attr):
                setattr(result, attr, amount)
            rate = _rate_on_line(line)
            if rate is not None and attr not in rates:
                rates[attr] = rate

    if match := _TAXABLE_PATTERN.search(text):
        result.taxable_value = to_money(match.group(1)) or Decimal("0.00")
    if match := _TOTAL_PATTERN.search(text):
        result.total_value = to_money(match.group(1)) or Decimal("0.00")

    # An 18% invoice is printed as 9% CGST + 9% SGST, so the invoice's rate is
    # the sum of the two halves — reporting 9 here would understate every
    # intra-state invoice by half.
    if "igst" in rates:
        result.tax_rate = normalize_rate(rates["igst"])
    elif "cgst" in rates:
        result.tax_rate = normalize_rate(rates["cgst"] + rates.get("sgst", rates["cgst"]))

    # The document's own answer, read by the same reader as the model's and the
    # portal's. ``bool()`` on the match is what this used to be, and it could
    # only ever say yes — see :data:`_REVERSE_CHARGE_PATTERN`.
    if match := _REVERSE_CHARGE_PATTERN.search(text):
        result.reverse_charge = to_flag(match.group(1))

    # Confidence here is coverage, not certainty: how many of the fields that
    # decide whether an invoice can be filed were actually found.
    found = sum(
        1
        for value in (
            result.supplier_gstin,
            result.invoice_number,
            result.invoice_date,
            result.total_value or None,
            result.taxable_value or None,
        )
        if value
    )
    result.confidence = round(found / 5 * 0.6, 2)  # Capped: shape is not comprehension.
    return result


# --------------------------------------------------------------------------
# Model extractor
# --------------------------------------------------------------------------

def _text_messages(text: str) -> list[dict]:
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Extract this GST invoice into exactly this JSON shape:\n{_EXTRACTION_SCHEMA}\n\n"
                f"INVOICE TEXT:\n{text[:12000]}"
            ),
        },
    ]


def _vision_messages(content: bytes, content_type: str) -> list[dict]:
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Read this GST invoice image and extract it into exactly this "
                        f"JSON shape:\n{_EXTRACTION_SCHEMA}"
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": image_data_url(content, content_type)},
                },
            ],
        },
    ]


def _from_model_payload(payload: dict, text: str, model: str) -> ParsedInvoice:
    """Coerce a model's JSON into a :class:`ParsedInvoice`."""
    result = ParsedInvoice(raw_text=text, parsed_with=f"openrouter:{model}")

    result.supplier_name = _clean_str(payload.get("supplier_name"))
    result.buyer_name = _clean_str(payload.get("buyer_name"))
    result.invoice_number = _clean_str(payload.get("invoice_number"), 64)
    result.invoice_date = to_date(payload.get("invoice_date"))
    result.hsn_code = _clean_str(payload.get("hsn_code"), 8)
    result.reverse_charge = to_flag(payload.get("reverse_charge"))

    # A GSTIN is kept only if it checksums. The model is reading blurry text
    # and a plausible-looking 15-character string is the one field where a
    # confident wrong answer is worse than no answer: it silently attributes
    # the invoice to a different taxpayer.
    for key, attr in (("supplier_gstin", "supplier_gstin"), ("buyer_gstin", "buyer_gstin")):
        candidate = gstin_service.normalize(str(payload.get(key) or ""))
        if candidate and gstin_service.is_valid(candidate):
            setattr(result, attr, candidate)
        elif candidate:
            result.warnings.append(f"Discarded invalid {key.replace('_', ' ')}: {candidate}")

    for attr in ("taxable_value", "cgst", "sgst", "igst", "cess", "total_value"):
        raw = payload.get(attr)
        amount = to_money(raw, default=None)
        if amount is None and str(raw if raw is not None else "").strip():
            # The model put something in this box and it is not an amount.
            # Said out loud, beside the zero it is being left as, because a
            # reviewer looking at a blank tax box needs to know the extractor
            # saw something there and refused it.
            #
            # Keyed on "was the field filled in" rather than on "did it parse
            # as a number", because the two most interesting refusals are not
            # numbers by the time they get here: ``"1E+100"`` is a mantissa the
            # number pattern cannot spell, and ``Infinity`` is not finite. A
            # guard asking ``to_decimal`` first fell silent on exactly those.
            #
            # The wording distinguishes the two, since they mean different
            # things to whoever reads the screen: a figure too large to be
            # money says the extraction found the right box and misread the
            # magnitude, and anything else says it did not find the box.
            kind = "out-of-range" if to_decimal(raw, default=None) is not None else "invalid"
            result.warnings.append(
                f"Discarded an {kind} {attr.replace('_', ' ')}: {str(raw)[:40]}"
            )
        setattr(result, attr, amount or Decimal("0.00"))
    result.tax_rate = normalize_rate(payload.get("tax_rate"))

    pos = _clean_str(payload.get("place_of_supply"), 2)
    if pos and pos.isdigit() and pos.zfill(2) in gstin_service.STATE_CODES:
        result.place_of_supply = pos.zfill(2)

    items = payload.get("line_items")
    if isinstance(items, list):
        result.line_items = [item for item in items if isinstance(item, dict)][:100]

    confidence = to_decimal(payload.get("confidence"), default=None)
    result.confidence = float(min(max(confidence or Decimal("0.7"), Decimal("0")), Decimal("1")))
    return result


def parse_with_model(
    *,
    text: str = "",
    content: bytes | None = None,
    content_type: str | None = None,
) -> ParsedInvoice:
    """Extract with an OpenRouter free model. Raises :class:`OpenRouterError`.

    Uses the vision model when given image bytes and the text model otherwise.
    """
    if content is not None:
        model = settings.openrouter_vision_model
        messages = _vision_messages(content, content_type or "image/jpeg")
    else:
        if not text.strip():
            raise OpenRouterError("No text to extract from")
        model = settings.openrouter_model
        messages = _text_messages(text)

    payload = chat_json(messages, model=model)
    return _from_model_payload(payload, text, model)


# --------------------------------------------------------------------------
# Combination and validation
# --------------------------------------------------------------------------

def _merge(primary: ParsedInvoice, secondary: ParsedInvoice) -> ParsedInvoice:
    """Fill *primary*'s empty fields from *secondary*, in place.

    Only ever fills gaps — a field the model answered is left alone, because
    the regex has no comprehension of layout and would happily overwrite the
    supplier's total with a line item's.
    """
    for attr in (
        "supplier_gstin", "supplier_name", "buyer_gstin", "buyer_name",
        "invoice_number", "invoice_date", "place_of_supply", "hsn_code", "tax_rate",
    ):
        if getattr(primary, attr) is None and getattr(secondary, attr) is not None:
            setattr(primary, attr, getattr(secondary, attr))
    for attr in ("taxable_value", "cgst", "sgst", "igst", "cess", "total_value"):
        if not getattr(primary, attr) and getattr(secondary, attr):
            setattr(primary, attr, getattr(secondary, attr))
    return primary


def validate(parsed: ParsedInvoice) -> ParsedInvoice:
    """Append warnings for anything internally inconsistent, in place.

    These are the checks that catch a bad extraction before it reaches a
    return. Every one of them is a warning rather than a rejection: the user
    can see the invoice, and a number they can correct beats a document the
    product refused to accept.
    """
    if not parsed.supplier_gstin:
        parsed.warnings.append("No valid supplier GSTIN found")
    if not parsed.invoice_number:
        parsed.warnings.append("No invoice number found")
    if not parsed.invoice_date:
        parsed.warnings.append("No invoice date found")
    elif not gst_calendar.is_filable_invoice_date(parsed.invoice_date):
        # A warning rather than a discard, per this function's rule — but it
        # has to be *a* warning, because this field alone decides which return
        # the invoice appears in. A year misread out of a scan puts it in a
        # month no return covers, and it then leaves the register, the
        # dashboard and the GSTR-1 together, with nothing downstream left to
        # notice: every check there is scoped to a period, and the invoice is
        # no longer in one. The lowered confidence is what routes it to the
        # reviewer who can see the paper.
        parsed.warnings.append(
            f"Invoice date {parsed.invoice_date.isoformat()} is outside the span a "
            "GST invoice can fall in; check the year"
        )

    # Tolerance of ₹1: invoices round each tax line to the rupee, so a
    # correctly-extracted invoice routinely misses by a few paise.
    tolerance = Decimal("1.00")
    if parsed.taxable_value and parsed.total_value:
        expected = parsed.taxable_value + parsed.total_tax
        if abs(expected - parsed.total_value) > tolerance:
            parsed.warnings.append(
                f"Total {parsed.total_value} does not equal taxable value + tax ({expected})"
            )

    # Both an intra-state and an inter-state split on one invoice is
    # impossible under GST — it means the extractor read a summary table wrong.
    if parsed.igst and (parsed.cgst or parsed.sgst):
        parsed.warnings.append("Invoice carries both IGST and CGST/SGST")

    if parsed.cgst and parsed.sgst and parsed.cgst != parsed.sgst:
        parsed.warnings.append(f"CGST {parsed.cgst} and SGST {parsed.sgst} should be equal")

    if parsed.supplier_gstin and parsed.buyer_gstin:
        interstate = gstin_service.is_interstate(parsed.supplier_gstin, parsed.buyer_gstin)
        if interstate is True and not parsed.igst and parsed.total_tax:
            parsed.warnings.append("Inter-state supply taxed as CGST/SGST instead of IGST")
        elif interstate is False and parsed.igst:
            parsed.warnings.append("Intra-state supply taxed as IGST instead of CGST/SGST")

    if parsed.warnings:
        # Each unresolved inconsistency is a reason to trust the whole
        # extraction less, which is what routes an invoice to human review.
        parsed.confidence = round(max(0.0, parsed.confidence - 0.1 * len(parsed.warnings)), 2)
    return parsed


def parse_invoice(
    *,
    content: bytes | None = None,
    content_type: str | None = None,
    filename: str | None = None,
    text: str | None = None,
) -> ParsedInvoice:
    """Extract an invoice from an upload, whatever form it arrived in.

    Never raises. Falls back through model → OCR → heuristics so that an
    upload always produces a row: an invoice the user can correct is worth far
    more than a failed request, since the paper is usually back in a file by
    the time they see the error.
    """
    body = text or ""
    if not body and content is not None:
        body = document_text.extract(content, content_type, filename)

    treat_as_image = content is not None and not body and (
        document_text.is_image(content_type, filename)
        or (content_type or "").lower() == "application/pdf"
    )

    parsed: ParsedInvoice | None = None
    if is_configured():
        try:
            if treat_as_image:
                # A PDF that yielded no text is a scan; the vision model reads
                # images, so hand it the file and let it render.
                parsed = parse_with_model(
                    content=content, content_type=content_type or "image/jpeg"
                )
            elif body:
                parsed = parse_with_model(text=body)
        except OpenRouterError as exc:
            logger.warning("Model extraction failed, falling back: %s", exc)

    if parsed is None and treat_as_image and content is not None:
        # No model, or the model failed: OCR the image so the heuristics have
        # something to read.
        ocr_text = document_text.ocr_image(content)
        if ocr_text:
            body = ocr_text
            if is_configured():
                try:
                    parsed = parse_with_model(text=body)
                    parsed.parsed_with = f"tesseract+{parsed.parsed_with}"
                except OpenRouterError as exc:
                    logger.warning("Model extraction after OCR failed: %s", exc)

    heuristic = parse_heuristic(body)
    if parsed is None:
        parsed = heuristic
        if not body:
            parsed.warnings.append(
                "No text could be read from this file and no AI model was available"
            )
    else:
        parsed.raw_text = body
        _merge(parsed, heuristic)

    return validate(parsed)
