"""Reading a GSTR-2B into something reconcilable.

GSTR-2B is the static ITC statement the portal generates for a buyer on the
14th of each month. It is the authoritative answer to "what have my suppliers
actually declared about me", and it is the right-hand side of every match this
product makes.

Two shapes arrive in practice and both are supported:

* **The portal JSON.** Downloaded from Returns > GSTR-2B > Download. The real
  envelope is ``{"data": {"docdata": {"b2b": [...]}}}``, with a supplier-level
  wrapper (``ctin``, ``trdnm``, ``supfildt``) holding a list of invoices, each
  holding a list of rate-wise ``items``. Abbreviated keys throughout.
* **The CSV/Excel export.** One flat row per rate line, with human column
  headings. Businesses forward this far more often than the JSON because it is
  what opens in Excel.

Everything is flattened to one :class:`GSTR2BRecord` per *invoice* — rate-wise
items are summed — because an invoice is the unit a buyer books, disputes and
claims credit on. The rate breakdown is kept on the record for display.

Nothing here touches the database: this module turns bytes into records, and
:mod:`app.services.reconciliation` decides what they mean.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.services import gst_calendar
from app.services import gstin as gstin_service
from app.services.invoice_parser import to_date, to_decimal, to_money

logger = logging.getLogger(__name__)

ZERO = Decimal("0.00")


class GSTR2BParseError(ValueError):
    """The uploaded file is not a GSTR-2B we can read."""


@dataclass
class GSTR2BRecord:
    """One invoice as the supplier declared it, normalised.

    ``itc_available`` carries the portal's ``itcavl`` flag: the supplier filed
    the invoice, but the portal may still mark the credit unavailable (a
    time-barred invoice, or a place of supply that makes it ineligible). A
    record can therefore be matched and still yield no credit, which is a
    different conversation with the supplier than a missing invoice.
    """

    supplier_gstin: str | None = None
    supplier_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    period: str | None = None
    place_of_supply: str | None = None

    taxable_value: Decimal = ZERO
    cgst: Decimal = ZERO
    sgst: Decimal = ZERO
    igst: Decimal = ZERO
    cess: Decimal = ZERO
    total_value: Decimal = ZERO

    itc_available: bool = True
    reverse_charge: bool = False
    # "R" regular, "C" credit note, "D" debit note, "ISD", "IMPG"...
    document_type: str = "R"
    supplier_filing_date: date | None = None
    supplier_filing_period: str | None = None
    rate_items: list[dict] = field(default_factory=list)
    # The period of the statement this arrived in, which is not necessarily the
    # invoice's own period: a 2B carries late filings from earlier months. Only
    # the portal JSON declares it; a CSV export does not carry it.
    statement_period: str | None = None

    @property
    def total_tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst + self.cess

    @property
    def is_credit_note(self) -> bool:
        """Whether this document *takes credit away* rather than granting it.

        The portal states the amounts on a credit note as positive figures and
        leaves the sign to ``document_type``, so a reader that goes by the money
        alone reads a reduction as a second supply. Only "C" reverses: a debit
        note ("D") raises the supplier's charge and the buyer's credit with it,
        which is the same direction as an invoice.
        """
        return self.document_type.strip().upper().startswith("C")

    def as_dict(self) -> dict:
        """JSON-safe form, for storing on the return row."""
        return {
            "supplier_gstin": self.supplier_gstin,
            "supplier_name": self.supplier_name,
            "invoice_number": self.invoice_number,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "period": self.period,
            "place_of_supply": self.place_of_supply,
            "taxable_value": str(self.taxable_value),
            "cgst": str(self.cgst),
            "sgst": str(self.sgst),
            "igst": str(self.igst),
            "cess": str(self.cess),
            "total_value": str(self.total_value),
            "total_tax": str(self.total_tax),
            "itc_available": self.itc_available,
            "reverse_charge": self.reverse_charge,
            "document_type": self.document_type,
            "supplier_filing_date": (
                self.supplier_filing_date.isoformat() if self.supplier_filing_date else None
            ),
            "supplier_filing_period": self.supplier_filing_period,
            "rate_items": self.rate_items,
            "statement_period": self.statement_period,
        }


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _flag(value: object, *, default: bool = False) -> bool:
    """Read the portal's ``Y``/``N`` flags, and the words a CSV export uses."""
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().upper()
    if text in {"Y", "YES", "TRUE", "1"}:
        return True
    if text in {"N", "NO", "FALSE", "0"}:
        return False
    return default


def period_from_portal(value: object) -> str | None:
    """``"042026"`` (the portal's ``MMYYYY``) -> ``"2026-04"``.

    Also accepts a period already in ``YYYY-MM``, so a hand-built fixture and a
    real download go down the same path.
    """
    text = str(value or "").strip()
    # Validated rather than merely shaped: this is the one path by which a
    # period enters the database without passing a route's validation, and a
    # hand-edited statement claiming ``2026-13`` would be stored and then
    # reconciled against arithmetic that assumes the month exists.
    #
    # The assembled candidates go back through the same check rather than
    # trusting the month digits alone. ``129999`` is six digits with a real
    # month in front, and it used to be accepted and stored as ``9999-12`` — a
    # statement filed under a year whose due date ``date()`` will not construct,
    # so every screen scoped to that period answered 500 from then on. The
    # month was the only half of the field anyone was looking at.
    if gst_calendar.is_period(text):
        return text
    if re.fullmatch(r"\d{6}", text):
        for candidate in (
            f"{text[2:]}-{text[:2]}",  # MMYYYY, what the portal writes
            f"{text[:4]}-{text[4:]}",  # YYYYMM, what some exports write
        ):
            if gst_calendar.is_period(candidate):
                return candidate
    return None


def _period_of(record: GSTR2BRecord, fallback: str | None) -> str | None:
    """The filing period an invoice belongs to.

    The invoice date decides, not the statement it arrived in: a 2B for May
    routinely carries April invoices that the supplier filed late, and booking
    those against May would compare them with the wrong month's purchases.
    """
    if record.invoice_date:
        return record.invoice_date.strftime("%Y-%m")
    return fallback


def _money(value: object) -> Decimal:
    # ``to_money`` rather than ``to_decimal``: a statement is a file someone
    # uploads, so nothing in it is trusted to be an amount a money column can
    # hold. ``json.loads`` accepts the bare ``Infinity`` token, and one of those
    # in a ``txval`` used to be summed into the stored statement, committed, and
    # only *then* refused by the response model — a 500 for the caller over a
    # row that is already there, and every later read of that period the same.
    return to_money(value) or ZERO


# ---------------------------------------------------------------------------
# Portal JSON
# ---------------------------------------------------------------------------

# Sections of ``docdata`` that describe an inward supply against a GSTIN.
# Credit and debit notes live in ``cdnr`` and carry ``nt`` rather than ``inv``.
_INVOICE_SECTIONS = ("b2b", "b2ba")
_NOTE_SECTIONS = ("cdnr", "cdnra")


def _unwrap_docdata(payload: dict) -> dict:
    """Find the ``docdata`` block, wherever this particular export buried it.

    Callers validate that *payload* is an object before getting here.
    """
    for candidate in (
        payload.get("data", {}).get("docdata") if isinstance(payload.get("data"), dict) else None,
        payload.get("docdata"),
        payload.get("data") if isinstance(payload.get("data"), dict) else None,
        payload,
    ):
        if isinstance(candidate, dict) and any(
            key in candidate for key in _INVOICE_SECTIONS + _NOTE_SECTIONS
        ):
            return candidate
    raise GSTR2BParseError(
        "No b2b or cdnr section found. Expected a GSTR-2B download from the GST portal."
    )


def _statement_period(payload: dict) -> str | None:
    for holder in (payload.get("data") if isinstance(payload.get("data"), dict) else None, payload):
        if isinstance(holder, dict):
            found = period_from_portal(holder.get("rtnprd"))
            if found:
                return found
    return None


def _addressed_to(payload: dict) -> str | None:
    """The buyer GSTIN the portal stamped on the statement, if it carries one.

    A GSTR-2B is not a generic document: the portal generates one per
    registration, and ``gstin`` at the top of the envelope says whose inward
    supplies these are. Sitting beside ``rtnprd`` and read the same way, since
    exports differ on whether the envelope is wrapped in ``data``.

    ``None`` when the field is absent or unreadable, which is the ordinary case
    for a CSV export — those have no envelope at all, only the table. The
    caller decides what an unknown addressee means; it is not this module's
    place to refuse a file the portal plainly produced.
    """
    for holder in (payload.get("data") if isinstance(payload.get("data"), dict) else None, payload):
        if isinstance(holder, dict):
            found = gstin_service.normalize(str(holder.get("gstin") or ""))
            if found:
                return found
    return None


def recipient_gstin(content: bytes, filename: str | None = None) -> str | None:
    """Whose GSTR-2B this file is, or ``None`` when the file does not say.

    Separate from :func:`parse` rather than carried on every record: this is a
    fact about the statement, not about any invoice in it, and putting it on
    fifteen hundred records would invite a reader to think it could differ
    between them.

    A 2B is addressed to one registration, and importing one addressed to
    another is the mistake a practice with several clients on one login is
    exactly placed to make — three browser tabs, three downloads, one of them
    dropped into the wrong tenant. Nothing downstream notices: every purchase
    in the books reconciles as missing from the statement, every document in
    the statement as missing from the books, and the screen reports the whole
    period's credit at risk. That reads as a catastrophic supplier failure and
    is a mis-click, and there is nothing on the screen to tell the two apart.
    """
    if not content:
        return None
    text = content.decode("utf-8-sig", errors="replace").lstrip()
    if not (text.startswith(("{", "[")) or (filename or "").lower().endswith(".json")):
        return None
    try:
        payload = json.loads(text)
    except ValueError:
        # Not readable as JSON, so :func:`parse` is about to say so properly.
        return None
    return _addressed_to(payload) if isinstance(payload, dict) else None


def _items_of(document: dict) -> list[dict]:
    """The rate-wise lines of an invoice or note, whichever key holds them."""
    for key in ("items", "itms"):
        value = document.get(key)
        if isinstance(value, list):
            # b2b items are flat dicts; some exports nest them under "itm_det".
            return [
                {**item.get("itm_det", {}), **{k: v for k, v in item.items() if k != "itm_det"}}
                if isinstance(item, dict)
                else {}
                for item in value
            ]
    return []


def _record_from_document(
    document: dict, supplier: dict, *, is_note: bool, fallback_period: str | None
) -> GSTR2BRecord:
    items = _items_of(document)
    record = GSTR2BRecord(
        supplier_gstin=gstin_service.normalize(str(supplier.get("ctin") or "")) or None,
        supplier_name=(supplier.get("trdnm") or supplier.get("lgnm") or None),
        # ``inum`` on an invoice, ``nt_num`` on a credit/debit note.
        invoice_number=str(
            document.get("inum") or document.get("nt_num") or document.get("ntnum") or ""
        ).strip()
        or None,
        invoice_date=to_date(document.get("dt") or document.get("nt_dt")),
        place_of_supply=str(document.get("pos") or "").strip()[:2] or None,
        total_value=_money(document.get("val")),
        itc_available=_flag(document.get("itcavl"), default=True),
        reverse_charge=_flag(document.get("rev"), default=False),
        document_type=str(document.get("typ") or ("C" if is_note else "R")).strip().upper() or "R",
        supplier_filing_date=to_date(supplier.get("supfildt")),
        supplier_filing_period=period_from_portal(supplier.get("supprd")),
        statement_period=fallback_period,
    )

    for item in items:
        record.taxable_value += _money(item.get("txval"))
        record.cgst += _money(item.get("cgst"))
        record.sgst += _money(item.get("sgst"))
        record.igst += _money(item.get("igst"))
        record.cess += _money(item.get("cess"))
        record.rate_items.append(
            {
                "rate": str(to_decimal(item.get("rt"), default=None) or ""),
                "taxable_value": str(_money(item.get("txval"))),
                "cgst": str(_money(item.get("cgst"))),
                "sgst": str(_money(item.get("sgst"))),
                "igst": str(_money(item.get("igst"))),
                "cess": str(_money(item.get("cess"))),
            }
        )

    if not record.total_value:
        record.total_value = record.taxable_value + record.total_tax
    record.period = _period_of(record, fallback_period)
    return record


def parse_json(payload: dict | str | bytes) -> list[GSTR2BRecord]:
    """Every inward document in a portal GSTR-2B, as flat records."""
    if isinstance(payload, bytes | str):
        try:
            payload = json.loads(payload)
        except ValueError as exc:
            raise GSTR2BParseError(f"File is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise GSTR2BParseError("GSTR-2B JSON must be an object")

    docdata = _unwrap_docdata(payload)
    fallback_period = _statement_period(payload)
    records: list[GSTR2BRecord] = []

    for section in _INVOICE_SECTIONS + _NOTE_SECTIONS:
        is_note = section in _NOTE_SECTIONS
        for supplier in docdata.get(section) or []:
            if not isinstance(supplier, dict):
                continue
            documents = supplier.get("inv") or supplier.get("nt") or []
            for document in documents:
                if not isinstance(document, dict):
                    continue
                records.append(
                    _record_from_document(
                        document, supplier, is_note=is_note, fallback_period=fallback_period
                    )
                )
    return records


# ---------------------------------------------------------------------------
# CSV / Excel export
# ---------------------------------------------------------------------------

# Portal column headings -> record field. Matched on a squashed form of the
# heading (lower-cased, non-alphanumerics removed) so that the spacing,
# punctuation and casing drift between portal versions stops mattering.
_CSV_COLUMNS: dict[str, str] = {
    "gstinofsupplier": "supplier_gstin",
    "suppliergstin": "supplier_gstin",
    "gstin": "supplier_gstin",
    "ctin": "supplier_gstin",
    "tradelegalname": "supplier_name",
    "tradename": "supplier_name",
    "legalname": "supplier_name",
    "suppliername": "supplier_name",
    "invoicenumber": "invoice_number",
    "invoiceno": "invoice_number",
    "invoicedetailsinvoicenumber": "invoice_number",
    "documentnumber": "invoice_number",
    "notenumber": "invoice_number",
    "invoicedate": "invoice_date",
    "documentdate": "invoice_date",
    "notedate": "invoice_date",
    "invoicevalue": "total_value",
    "invoicevaluers": "total_value",
    "documentvalue": "total_value",
    "notevalue": "total_value",
    "placeofsupply": "place_of_supply",
    "supplyattractreversecharge": "reverse_charge",
    "reversecharge": "reverse_charge",
    "rate": "tax_rate",
    "ratepercent": "tax_rate",
    "taxablevalue": "taxable_value",
    "taxablevaluers": "taxable_value",
    "integratedtax": "igst",
    "integratedtaxrs": "igst",
    "igst": "igst",
    "centraltax": "cgst",
    "centraltaxrs": "cgst",
    "cgst": "cgst",
    "stateuttax": "sgst",
    "stateuttaxrs": "sgst",
    "sgst": "sgst",
    "cess": "cess",
    "cessrs": "cess",
    "itcavailability": "itc_available",
    "availabilityofitc": "itc_available",
    "gstr1filingdate": "supplier_filing_date",
    "gstr13bfilingdate": "supplier_filing_date",
    "gstr1gstr5filingdate": "supplier_filing_date",
    # The heading the portal actually ships, once IFF was folded in.
    "gstr1iffgstr5filingdate": "supplier_filing_date",
    "gstr1gstr5period": "supplier_filing_period",
    "gstr1iffgstr5period": "supplier_filing_period",
    "gstr1period": "supplier_filing_period",
    "invoicetype": "document_type",
    "documenttype": "document_type",
    "notetype": "document_type",
}

# Cells the portal uses for "no credit here", as opposed to a blank.
_ITC_UNAVAILABLE = {"NO", "N", "NOT AVAILABLE", "UNAVAILABLE"}


def _squash(heading: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (heading or "").lower())


def _find_header_row(rows: list[list[str]]) -> int:
    """Index of the header row.

    The portal's CSV opens with title and legend rows before the real headings,
    so the header is found by looking for the row that names a supplier GSTIN
    column rather than by assuming row 0.
    """
    for index, row in enumerate(rows[:30]):
        squashed = {_squash(cell) for cell in row}
        if squashed & {"gstinofsupplier", "suppliergstin", "ctin", "gstin"}:
            return index
    return 0


def parse_csv(content: str | bytes) -> list[GSTR2BRecord]:
    """Read a CSV export, summing its rate-wise rows back into invoices."""
    if isinstance(content, bytes):
        content = content.decode("utf-8-sig", errors="replace")
    rows = [row for row in csv.reader(io.StringIO(content)) if any(cell.strip() for cell in row)]
    if not rows:
        raise GSTR2BParseError("The file is empty")

    header_index = _find_header_row(rows)
    headings = [_squash(cell) for cell in rows[header_index]]
    if not any(headings):
        raise GSTR2BParseError("No column headings found")

    mapped = {index: _CSV_COLUMNS[key] for index, key in enumerate(headings) if key in _CSV_COLUMNS}
    if "supplier_gstin" not in mapped.values():
        raise GSTR2BParseError(
            "No supplier GSTIN column found. Expected a GSTR-2B export with a "
            "'GSTIN of supplier' column."
        )

    # Rate-wise rows of one invoice are merged, keyed the way the portal
    # identifies a document: supplier plus document number.
    merged: dict[tuple[str, str], GSTR2BRecord] = {}
    order: list[tuple[str, str]] = []

    for row in rows[header_index + 1 :]:
        values: dict[str, str] = {}
        for index, field_name in mapped.items():
            if index < len(row):
                values.setdefault(field_name, row[index].strip())

        supplier_gstin = gstin_service.normalize(values.get("supplier_gstin", "")) or None
        invoice_number = (values.get("invoice_number") or "").strip() or None
        if not supplier_gstin and not invoice_number:
            continue  # A total row, or trailing notes under the table.

        key = (supplier_gstin or "", invoice_number or "")
        record = merged.get(key)
        if record is None:
            record = GSTR2BRecord(
                supplier_gstin=supplier_gstin,
                supplier_name=values.get("supplier_name") or None,
                invoice_number=invoice_number,
                invoice_date=to_date(values.get("invoice_date")),
                place_of_supply=(values.get("place_of_supply") or "").strip()[:2] or None,
                total_value=_money(values.get("total_value")),
                reverse_charge=_flag(values.get("reverse_charge")),
                document_type=(values.get("document_type") or "R").strip().upper()[:4] or "R",
                supplier_filing_date=to_date(values.get("supplier_filing_date")),
                supplier_filing_period=period_from_portal(values.get("supplier_filing_period")),
            )
            merged[key] = record
            order.append(key)

        record.taxable_value += _money(values.get("taxable_value"))
        record.cgst += _money(values.get("cgst"))
        record.sgst += _money(values.get("sgst"))
        record.igst += _money(values.get("igst"))
        record.cess += _money(values.get("cess"))

        # One ineligible line makes the invoice's credit partial; treating it
        # as available would overstate the claim.
        if values.get("itc_available", "").strip().upper() in _ITC_UNAVAILABLE:
            record.itc_available = False

        record.rate_items.append(
            {
                "rate": (values.get("tax_rate") or "").strip(),
                "taxable_value": str(_money(values.get("taxable_value"))),
                "cgst": str(_money(values.get("cgst"))),
                "sgst": str(_money(values.get("sgst"))),
                "igst": str(_money(values.get("igst"))),
                "cess": str(_money(values.get("cess"))),
            }
        )

    records = [merged[key] for key in order]
    for record in records:
        if not record.total_value:
            record.total_value = record.taxable_value + record.total_tax
        record.period = _period_of(record, None)
    return records


def parse(content: bytes, filename: str | None = None) -> list[GSTR2BRecord]:
    """Parse a GSTR-2B upload, choosing the reader by content rather than name.

    The extension is only a tiebreaker: businesses rename these files freely,
    and a ``.txt`` holding portal JSON is common enough to be worth handling.
    """
    if not content:
        raise GSTR2BParseError("The uploaded file is empty")

    text = content.decode("utf-8-sig", errors="replace")
    stripped = text.lstrip()
    lowered = (filename or "").lower()

    if stripped.startswith(("{", "[")) or lowered.endswith(".json"):
        return parse_json(text)
    if lowered.endswith((".xlsx", ".xls", ".xlsm")):
        raise GSTR2BParseError(
            "Excel GSTR-2B files are not supported yet. Save the sheet as CSV, "
            "or upload the JSON download from the GST portal."
        )
    return parse_csv(text)
