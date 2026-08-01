"""Input cleaning applied at the edge, before a value reaches a query or a file.

None of this is SQL-injection defence — every query in the product is built
through SQLAlchemy and passes user values as bound parameters, so a quote in a
supplier name is data and never syntax. What is left after that is a different
and real set of problems:

* **LIKE metacharacters.** ``%`` and ``_`` in a search box are not injection,
  but ``%`` alone turns an indexed prefix search into a full scan of a tenant's
  invoices, and a page of them is a cheap way to make the database work hard.
* **Control characters.** A ``\\r\\n`` in a value that is later logged, or put
  in a ``Content-Disposition`` header, is header and log injection.
* **Filenames.** An uploaded name reaches a filesystem path and a download
  header, and neither should ever see ``../``.
"""
from __future__ import annotations

import re
import unicodedata

# Everything in the Unicode "C" (control/format/surrogate/unassigned) classes,
# minus the whitespace that is legitimately typed into a text field.
_KEEP_CONTROL = {"\t", "\n"}

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._ -]")
_MULTI_DOT = re.compile(r"\.{2,}")


def strip_control_chars(value: str, *, keep_newlines: bool = False) -> str:
    """Drop control and format characters, which no user field needs.

    Also removes bidirectional-override characters: a right-to-left override in
    a supplier name renders a reviewed invoice differently from the one that
    was approved, which is a spoof rather than a formatting quirk.
    """
    keep = _KEEP_CONTROL if keep_newlines else set()
    return "".join(
        ch for ch in value if ch in keep or unicodedata.category(ch) not in ("Cc", "Cf", "Cs", "Co")
    )


def clean_text(value: str | None, *, max_length: int = 500) -> str | None:
    """Normalise a free-text field: NFC, no control characters, trimmed, bounded.

    NFC because the same GSTIN-holder's name can arrive decomposed from one
    device and composed from another, and two spellings of one name defeat both
    deduplication and search.
    """
    if value is None:
        return None
    cleaned = strip_control_chars(unicodedata.normalize("NFC", value)).strip()
    # Collapse runs of whitespace — a name pasted out of a PDF often carries
    # them, and they make an otherwise identical counterparty look distinct.
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned[:max_length] or None


def escape_like(term: str, escape: str = "\\") -> str:
    """Escape LIKE wildcards so a search term matches itself literally.

    The escape character must be declared on the comparison too:
    ``column.ilike(f"%{escape_like(term)}%", escape="\\\\")``.
    """
    out = term.replace(escape, escape + escape)
    for wildcard in ("%", "_"):
        out = out.replace(wildcard, escape + wildcard)
    return out


def search_pattern(term: str | None, *, max_length: int = 100) -> str | None:
    """A bounded, wildcard-safe ``%term%`` pattern, or ``None`` for no filter."""
    cleaned = clean_text(term, max_length=max_length)
    if not cleaned:
        return None
    return f"%{escape_like(cleaned)}%"


def safe_filename(value: str | None, *, fallback: str = "upload", max_length: int = 120) -> str:
    """Reduce an uploaded name to something safe to store and to echo back.

    Path separators, traversal sequences and control characters are removed
    rather than rejected: the name is cosmetic here (the stored file is named
    after a UUID), and refusing an upload because a phone titled the photo
    oddly would be the wrong trade.
    """
    if not value:
        return fallback
    # Take the last path component under either separator, so "../../etc/passwd"
    # and "..\\..\\windows\\x" both reduce to their leaf.
    leaf = value.replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = _FILENAME_SAFE.sub("_", strip_control_chars(leaf)).strip(" .")
    cleaned = _MULTI_DOT.sub(".", cleaned)
    return cleaned[:max_length] or fallback


def safe_extension(filename: str | None, *, max_length: int = 10) -> str:
    """The dotted extension of *filename*, if it is a plain alphanumeric one.

    Anything else returns "" — the stored file keeps its UUID name and the
    content type is what the parser dispatches on anyway.
    """
    if not filename or "." not in filename:
        return ""
    suffix = filename.rsplit(".", 1)[-1][:max_length]
    return f".{suffix.lower()}" if suffix.isalnum() else ""
