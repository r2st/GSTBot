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
from app.services import document_text
from app.services import gstin as gstin_service
from app.services.openrouter_client import OpenRouterError, chat_json, image_data_url, is_configured

logger = logging.getLogger(__name__)

# The rates GST actually uses. An extracted rate outside this set is a
# misread — most often a total mistaken for a percentage.
VALID_TAX_RATES = (Decimal("0"), Decimal("0.25"), Decimal("3"), Decimal("5"),
                   Decimal("12"), Decimal("18"), Decimal("28"))

# A number with optional Indian digit grouping and up to two decimals.
_NUMBER_PATTERN = re.compile(r"-?\d[\d,]*(?:\.\d{1,2})?")

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
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    # Match the number rather than stripping non-digits: stripping leaves the
    # full stop in "Rs. 1000.50" behind, and ".1000.50" is not a Decimal.
    match = _NUMBER_PATTERN.search(str(value))
    if match is None:
        return default
    try:
        return Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
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


def _normalize_rate(value: object) -> Decimal | None:
    """Coerce a tax rate, dropping anything that is not a real GST rate.

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

_INVOICE_NO_PATTERN = re.compile(
    r"(?:invoice|inv|bill|tax\s+invoice)\s*(?:no|number|#|num)?\s*[:.\-#]\s*([A-Za-z0-9\-/]{2,30})",
    re.IGNORECASE,
)
_DATE_PATTERN = re.compile(
    r"(?:invoice\s*date|date|dated)\s*[:.\-]?\s*"
    r"(\d{1,4}[-/.\s][A-Za-z0-9]{1,9}[-/.\s]\d{2,4})",
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
_REVERSE_CHARGE_PATTERN = re.compile(
    r"reverse\s*charge\s*[:\-]?\s*(?:applicable\s*[:\-]?\s*)?(yes|y|true|applicable)\b",
    re.IGNORECASE,
)


def _amount_on_line(line: str) -> Decimal | None:
    """The monetary amount on a tax line, ignoring any rate printed on it.

    Invoices put the amount last — ``IGST @ 18%    81,000.00`` — so the last
    number wins, and percentages are removed first so an 18 cannot stand in
    for an 81,000.
    """
    numbers = _NUMBER_PATTERN.findall(_PERCENT_PATTERN.sub(" ", line))
    return to_decimal(numbers[-1], default=None) if numbers else None


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

    if match := _INVOICE_NO_PATTERN.search(text):
        result.invoice_number = _clean_str(match.group(1), 64)
    if match := _DATE_PATTERN.search(text):
        result.invoice_date = to_date(match.group(1))
    if match := _HSN_PATTERN.search(text):
        result.hsn_code = match.group(1)

    # Tax amounts are read line by line, because the label, the rate and the
    # amount all sit on one line and only their order distinguishes them.
    rates: dict[str, Decimal] = {}
    for line in text.splitlines():
        for attr, label in _TAX_LABELS.items():
            if not label.search(line):
                continue
            amount = _amount_on_line(line)
            if amount is not None and not getattr(result, attr):
                setattr(result, attr, amount)
            rate = _rate_on_line(line)
            if rate is not None and attr not in rates:
                rates[attr] = rate

    if match := _TAXABLE_PATTERN.search(text):
        result.taxable_value = to_decimal(match.group(1)) or Decimal("0.00")
    if match := _TOTAL_PATTERN.search(text):
        result.total_value = to_decimal(match.group(1)) or Decimal("0.00")

    # An 18% invoice is printed as 9% CGST + 9% SGST, so the invoice's rate is
    # the sum of the two halves — reporting 9 here would understate every
    # intra-state invoice by half.
    if "igst" in rates:
        result.tax_rate = _normalize_rate(rates["igst"])
    elif "cgst" in rates:
        result.tax_rate = _normalize_rate(rates["cgst"] + rates.get("sgst", rates["cgst"]))

    result.reverse_charge = bool(_REVERSE_CHARGE_PATTERN.search(text))

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
    result.reverse_charge = bool(payload.get("reverse_charge"))

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
        setattr(result, attr, to_decimal(payload.get(attr)) or Decimal("0.00"))
    result.tax_rate = _normalize_rate(payload.get("tax_rate"))

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
