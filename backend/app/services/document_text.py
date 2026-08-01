"""Getting text out of an uploaded file, before anything tries to understand it.

The order is deliberate and it is a cost decision. A PDF exported from Tally
carries its text already; reading it is free, exact, and instant. Only when a
file has no extractable text — a photograph, a scan — does it become worth
spending a vision-model call or a Tesseract pass on it.
"""
from __future__ import annotations

import csv
import io
import logging

logger = logging.getLogger(__name__)

# Anything else is treated as an image and sent to the vision path.
TEXT_CONTENT_TYPES = {"text/plain", "text/csv", "application/csv"}
PDF_CONTENT_TYPES = {"application/pdf"}
EXCEL_CONTENT_TYPES = {
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}

# Below this, a PDF's "text" is page furniture — a header, a page number — and
# the document is really a scan. Measured in characters across the whole file.
_MIN_PDF_TEXT_CHARS = 40


def is_image(content_type: str | None, filename: str | None = None) -> bool:
    """Whether this upload should go down the vision/OCR path."""
    if content_type and content_type.lower() in IMAGE_CONTENT_TYPES:
        return True
    if filename:
        lowered = filename.lower()
        return lowered.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic"))
    return False


def from_pdf(content: bytes) -> str:
    """Extract embedded text from a PDF, or ``""`` if it has none."""
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - pypdf is a hard dependency
        logger.warning("pypdf is not installed; cannot read PDF text")
        return ""
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:  # noqa: BLE001 - a malformed PDF must not 500
        logger.warning("PDF text extraction failed: %s", exc)
        return ""
    text = "\n".join(pages).strip()
    return text if len(text) >= _MIN_PDF_TEXT_CHARS else ""


def from_excel(content: bytes) -> str:
    """Flatten a spreadsheet to tab-separated rows.

    Purchase registers arrive as Excel far more often than as anything else,
    and a flattened sheet is something the extraction prompt reads well.
    """
    try:
        from openpyxl import load_workbook
    except ImportError:  # pragma: no cover - openpyxl is a hard dependency
        logger.warning("openpyxl is not installed; cannot read spreadsheets")
        return ""
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 - a corrupt upload must not 500
        logger.warning("Spreadsheet read failed: %s", exc)
        return ""
    lines: list[str] = []
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if cell is None else str(cell) for cell in row]
            if any(cell.strip() for cell in cells):
                lines.append("\t".join(cells))
    workbook.close()
    return "\n".join(lines).strip()


def from_csv(content: bytes) -> str:
    """Normalise a CSV to tab-separated rows."""
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("latin-1", errors="replace")
    rows = list(csv.reader(io.StringIO(decoded)))
    return "\n".join("\t".join(row) for row in rows if any(cell.strip() for cell in row)).strip()


def ocr_image(content: bytes) -> str:
    """Run Tesseract over an image, or return ``""`` if it is unavailable.

    The fallback for when no vision model is reachable. Both the Python
    binding and the ``tesseract`` binary are optional at runtime: a deployment
    without them still ingests invoices, it just leans entirely on the vision
    model.
    """
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.info("pytesseract/Pillow not installed; skipping OCR fallback")
        return ""
    try:
        with Image.open(io.BytesIO(content)) as image:
            return str(pytesseract.image_to_string(image)).strip()
    except Exception as exc:  # noqa: BLE001 - a missing binary must not 500
        logger.warning("OCR failed: %s", exc)
        return ""


def extract(content: bytes, content_type: str | None, filename: str | None = None) -> str:
    """Best-effort text for an upload of any supported type.

    Returns ``""`` for images and for scans, which is the signal to the parser
    that this document needs the vision path.
    """
    kind = (content_type or "").lower()
    name = (filename or "").lower()

    if kind in PDF_CONTENT_TYPES or name.endswith(".pdf"):
        return from_pdf(content)
    if kind in EXCEL_CONTENT_TYPES or name.endswith((".xlsx", ".xlsm", ".xls")):
        return from_excel(content)
    if kind in {"text/csv", "application/csv"} or name.endswith(".csv"):
        return from_csv(content)
    if kind in TEXT_CONTENT_TYPES or name.endswith(".txt"):
        return content.decode("utf-8", errors="replace").strip()
    return ""
