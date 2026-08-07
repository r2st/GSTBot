"""Persisting invoices: storage, plan limits, dedup, and the parse write-back.

The router stays thin and this module owns the rules, because the same three
steps have to happen identically whether an invoice arrives from the upload
endpoint, an inbound email, or a WhatsApp photo.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import and_, case, func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.business import Business
from app.models.invoice import (
    UNREADABLE_STATUSES,
    Invoice,
    InvoiceSource,
    InvoiceStatus,
    InvoiceType,
)
from app.models.supplier import Supplier
from app.services import gst_calendar
from app.services import gstin as gstin_service
from app.services.invoice_parser import ParsedInvoice, parse_invoice

logger = logging.getLogger(__name__)


class PlanLimitExceeded(RuntimeError):
    """The tenant has used up their plan's invoices for the month."""


class DuplicateInvoice(RuntimeError):
    """This exact file, or this invoice number, is already on file."""

    def __init__(self, message: str, invoice_id: int) -> None:
        super().__init__(message)
        self.invoice_id = invoice_id


def month_of(moment: datetime | None = None) -> str:
    """The current filing period as ``YYYY-MM``, in India.

    This is the period the dashboard, the ITC screen and the filing endpoints
    fall back to when the caller names none, so it is a question about the
    Indian calendar and not about the server's. A box on UTC still reads last
    month until 05:30 IST on the 1st, which would open the new month's
    dashboard on the month that has just closed.

    An explicit *moment* is converted rather than read as-is, so a caller that
    passes a UTC instant gets the Indian date it fell on.
    """
    return gst_calendar.period_of(
        gst_calendar.ist_date(moment) if moment else gst_calendar.today_ist()
    )


def month_bounds(period: str) -> tuple[datetime, datetime]:
    """The instants a ``YYYY-MM`` period begins and ends, as UTC.

    The boundary is midnight *in India* — that is when a business's month rolls
    over and when their plan's allowance should reset — but it is returned in
    UTC because that is what the stored timestamps are.

    Converting rather than handing an IST-aware value straight to the query is
    load-bearing. On Postgres a ``timestamptz`` comparison normalises either
    one correctly; SQLAlchemy's SQLite type formats whatever wall clock the
    value carries and drops the offset, so an IST-aware bound would compare
    ``00:00`` against UTC-stored rows and be five and a half hours out — right
    in production, wrong in the suite, which is the split nothing catches.
    """
    year, month = (int(part) for part in period.split("-"))
    start = datetime(year, month, 1, tzinfo=gst_calendar.IST)
    end = (
        datetime(year + 1, 1, 1, tzinfo=gst_calendar.IST)
        if month == 12
        else datetime(year, month + 1, 1, tzinfo=gst_calendar.IST)
    )
    return start.astimezone(UTC), end.astimezone(UTC)


def monthly_usage(db: Session, business_id: int, period: str | None = None) -> int:
    """Invoices uploaded by this tenant in *period* (default: this month).

    Counts by upload month rather than by invoice date, because the plan sells
    processing capacity — a business catching up on last quarter's paperwork is
    using this month's capacity to do it.

    The month is the Indian one. Counted against UTC midnight instead, a
    business that used up October's allowance stays blocked until 05:30 IST on
    1 November — they are told to upgrade on a day their plan has already
    reset — and the invoices they upload in those hours are charged to the
    month that closed.
    """
    period = period or month_of()
    start, end = month_bounds(period)
    return int(
        db.scalar(
            select(func.count(Invoice.id)).where(
                Invoice.business_id == business_id,
                Invoice.deleted_at.is_(None),
                Invoice.created_at >= start,
                Invoice.created_at < end,
            )
        )
        or 0
    )


def plan_limit(business: Business) -> int:
    """Monthly invoice cap for this tenant's plan; 0 means unlimited."""
    return settings.plan_limits.get(str(business.plan.value), 0)


def check_plan_limit(db: Session, business: Business) -> None:
    """Raise :class:`PlanLimitExceeded` if the tenant is at their cap."""
    limit = plan_limit(business)
    if limit and monthly_usage(db, business.id) >= limit:
        raise PlanLimitExceeded(
            f"Plan '{business.plan.value}' allows {limit} invoices per month. "
            "Upgrade to continue uploading."
        )


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def store_upload(content: bytes, filename: str, business_id: int) -> str:
    """Write the upload to disk and return its path.

    Namespaced by tenant and prefixed with a UUID: two businesses both
    uploading "invoice.pdf" must not be able to reach each other's file, and
    the stored name must not be attacker-controlled.
    """
    directory = Path(settings.upload_dir) / str(business_id)
    directory.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename or "").suffix[:10]
    path = directory / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(content)
    return str(path)


def _discard_upload(path: str | None) -> None:
    """Remove a stored file whose row was never committed.

    Best effort, and deliberately silent about failure: this runs while an
    exception is already on its way up, and the caller is entitled to see that
    one rather than an unlink error raised on top of it. A file left behind
    because the volume went read-only is the same orphan as before, which is
    the state this is trying to improve on rather than guarantee.
    """
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as exc:  # noqa: BLE001 - the original failure is the story
        logger.warning("Could not remove the orphaned upload %s: %s", path, exc)


def find_duplicate(
    db: Session,
    business_id: int,
    *,
    digest: str | None = None,
    invoice_type: InvoiceType | None = None,
    counterparty_gstin: str | None = None,
    invoice_number: str | None = None,
) -> Invoice | None:
    """An existing invoice that this upload would duplicate, if any.

    Two ways to be a duplicate, checked in this order: the identical file
    (same SHA-256), or the same invoice number from the same counterparty.
    """
    if digest:
        existing = db.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.file_hash == digest,
                Invoice.deleted_at.is_(None),
            )
        )
        if existing:
            return existing
    if invoice_type and counterparty_gstin and invoice_number:
        return db.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.invoice_type == invoice_type,
                Invoice.counterparty_gstin == counterparty_gstin,
                Invoice.invoice_number == invoice_number,
                Invoice.deleted_at.is_(None),
            )
        )
    return None


def _find_supplier(db: Session, business_id: int, gstin: str) -> Supplier | None:
    """The live supplier row for *gstin*, without writing anything to get it.

    Autoflush is off for the same reason the caller flushes one row at a time:
    a plain query writes out everything the session has pending first, so a
    caller part-way through an edit of its own had that edit hit the database
    from inside a *lookup*. The supplier this reads is always already committed
    or already flushed by the insert below, so there is nothing pending this
    query needs to see.
    """
    with db.no_autoflush:
        return db.scalar(
            select(Supplier).where(
                Supplier.business_id == business_id,
                Supplier.gstin == gstin,
                Supplier.deleted_at.is_(None),
            )
        )


def _insert_supplier(db: Session, business_id: int, gstin: str, name: str | None) -> None:
    """INSERT one supplier row inside a SAVEPOINT of its own.

    Deliberately a Core INSERT on a connection-level SAVEPOINT rather than
    ``Session.begin_nested()`` around ``Session.add``. Releasing an *ORM*
    nested transaction flushes the whole session on the way out, so a caller
    part-way through an edit of its own — the invoice PATCH route sets its
    fields and then reaches this function to link the supplier — had that edit
    written from inside this SAVEPOINT. When the caller's change was the one
    the database refused, the handler below read a conflict that had nothing to
    do with any supplier as a lost race, re-queried a session whose transaction
    was already dead, and turned what should have been a 409 about the invoice
    into a ``PendingRollbackError`` and a 500.

    Narrowing the ORM flush was not enough: the flush that broke it came from
    releasing the savepoint, not from the ``add``. Going through the connection
    keeps the SAVEPOINT holding what it claims to hold — one INSERT, whose
    failure means exactly one thing — and leaves the caller's pending edits
    where they belong, unwritten and the caller's to commit or discard.
    """
    connection = db.connection()
    savepoint = connection.begin_nested()
    try:
        connection.execute(
            insert(Supplier).values(
                business_id=business_id,
                gstin=gstin,
                legal_name=name,
                state_code=gstin_service.state_code_of(gstin),
            )
        )
    except IntegrityError:
        savepoint.rollback()
        raise
    savepoint.commit()


def get_or_create_supplier(
    db: Session, business_id: int, gstin: str, name: str | None = None
) -> Supplier:
    """The supplier row for *gstin* under this tenant, creating it if new.

    Look-then-insert has a window in it, and this is the one place in the
    product that runs concurrently on the same key: a business uploading a
    folder of invoices from a supplier they have never bought from before has
    several workers reaching this line at once, each having looked and found
    nothing. One of them inserts; the rest hit ``uq_suppliers_business_gstin``.

    That is a lost race, not a failure, and it was being reported as neither.
    The insert happens inside the caller's transaction, so the integrity error
    surfaced up in :func:`process_invoice` — whose handler exists for the
    *invoice's* natural key and assumes any conflict is one. A perfectly good
    invoice was therefore marked ``failed`` and told the user "This invoice is
    already on file", which was false, named a document that does not exist, and
    dropped the invoice out of the filing pool over a row the other worker had
    already created correctly.

    The insert is wrapped in a SAVEPOINT so a conflict rolls back that statement
    alone and leaves the session usable, and the winner's row is then read back.
    Whoever inserts, both callers end up with the same supplier.

    Neither the lookup nor the insert writes anything else the session happens
    to have pending; see :func:`_find_supplier` and :func:`_insert_supplier` for
    why that matters to callers who are part-way through an edit of their own.
    """
    supplier = _find_supplier(db, business_id, gstin)
    if supplier is None:
        try:
            _insert_supplier(db, business_id, gstin, name)
        except IntegrityError:
            # Somebody else got there first. Their row is the one that exists.
            supplier = _find_supplier(db, business_id, gstin)
            if supplier is None:
                # The conflict was not the one this handles — a soft-deleted row
                # holding the GSTIN, say. Let it surface rather than pretending.
                raise
        else:
            # Read back rather than trusting the INSERT: the ORM object is what
            # callers hold, and this is the one place it enters the session.
            supplier = _find_supplier(db, business_id, gstin)
            if supplier is None:  # pragma: no cover - the row was just written
                raise RuntimeError(f"Supplier {gstin} vanished after insert")
    if name and not supplier.legal_name:
        supplier.legal_name = name
    return supplier


def create_pending_invoice(
    db: Session,
    business: Business,
    *,
    content: bytes,
    filename: str,
    content_type: str | None,
    invoice_type: InvoiceType,
    source: InvoiceSource = InvoiceSource.UPLOAD,
) -> Invoice:
    """Store an upload and record it as awaiting extraction.

    Committed before any parsing happens, so the file is durably ours the
    moment the request returns. Extraction can then run on a worker, fail, and
    be retried without the user needing the paper again.
    """
    check_plan_limit(db, business)

    digest = file_hash(content)
    duplicate = find_duplicate(db, business.id, digest=digest)
    if duplicate is not None:
        raise DuplicateInvoice(
            f"This file was already uploaded as invoice {duplicate.id}", duplicate.id
        )

    stored = store_upload(content, filename, business.id)
    invoice = Invoice(
        business_id=business.id,
        invoice_type=invoice_type,
        status=InvoiceStatus.UPLOADED,
        source=source,
        source_filename=filename,
        content_type=content_type,
        file_size=len(content),
        file_hash=digest,
        storage_path=stored,
    )
    db.add(invoice)
    try:
        db.commit()
    except Exception:
        # The bytes are on disk before the row that names them exists, and they
        # have to be: ``storage_path`` is a column on that row. So a commit
        # that fails leaves a file nothing in the database points at, and
        # nothing ever will — no query reads ``upload_dir``, the delete route
        # keeps stored files on purpose, and there is no sweeper. Every upload
        # that meets a full pool, a dropped connection or a constraint
        # therefore leaves a permanent orphan, on a volume sized for the rows
        # that exist rather than for the ones that failed to.
        #
        # Deleted here rather than swept later because this is the only moment
        # anything knows the path is unreferenced; after the rollback it is
        # indistinguishable from a file whose row was written by a request that
        # is still in flight.
        db.rollback()
        _discard_upload(stored)
        raise
    db.refresh(invoice)
    return invoice


def apply_parsed(db: Session, invoice: Invoice, parsed: ParsedInvoice) -> Invoice:
    """Write an extraction onto an invoice row and link its counterparty.

    Which party is "the counterparty" flips with direction: on a purchase we
    are the buyer and the supplier is the other side, on a sale it is the
    reverse. Getting this backwards would file our own GSTIN as the vendor on
    every purchase, so it is decided here once rather than at each call site.
    """
    business_gstin = invoice.business.gstin if invoice.business else None

    if invoice.invoice_type == InvoiceType.PURCHASE:
        counterparty = parsed.supplier_gstin
        counterparty_name = parsed.supplier_name
        # A supplier who filled in only one GSTIN put their own on the
        # invoice; if it happens to be ours, the other one is theirs.
        if counterparty and business_gstin and counterparty == business_gstin:
            counterparty = parsed.buyer_gstin
            counterparty_name = parsed.buyer_name
    else:
        counterparty = parsed.buyer_gstin
        counterparty_name = parsed.buyer_name
        if counterparty and business_gstin and counterparty == business_gstin:
            counterparty = parsed.supplier_gstin
            counterparty_name = parsed.supplier_name

    invoice.counterparty_gstin = counterparty
    invoice.counterparty_name = counterparty_name
    invoice.invoice_number = parsed.invoice_number
    invoice.invoice_date = parsed.invoice_date
    invoice.period = parsed.period
    invoice.place_of_supply = parsed.place_of_supply
    invoice.hsn_code = parsed.hsn_code
    invoice.taxable_value = parsed.taxable_value
    invoice.cgst = parsed.cgst
    invoice.sgst = parsed.sgst
    invoice.igst = parsed.igst
    invoice.cess = parsed.cess
    invoice.total_value = parsed.total_value
    invoice.tax_rate = parsed.tax_rate
    invoice.reverse_charge = parsed.reverse_charge
    invoice.line_items = parsed.line_items or None
    invoice.raw_text = parsed.raw_text or None
    invoice.extraction = parsed.as_dict()
    invoice.parsed_with = parsed.parsed_with
    invoice.extraction_confidence = parsed.confidence
    invoice.parse_error = None
    invoice.status = InvoiceStatus.PARSED

    # A purchase from an identifiable supplier gets a supplier row, which is
    # what the compliance score is later built on.
    if invoice.invoice_type == InvoiceType.PURCHASE and counterparty:
        supplier = get_or_create_supplier(db, invoice.business_id, counterparty, counterparty_name)
        invoice.supplier_id = supplier.id

    return invoice


def process_invoice(db: Session, invoice: Invoice) -> Invoice:
    """Parse a stored invoice and record the outcome. Never raises.

    A failure is written to the row as ``FAILED`` with the reason, rather than
    propagating: this runs on a Celery worker where an exception would be a
    log line nobody reads, and the user needs to see which of their fifty
    uploads needs attention.

    The write-back is inside the guarded block as well as the parse. Committing
    outside it is what leaves a row stuck in ``PROCESSING``: the parse can
    succeed and the *insert* still fail, and the user is then watching a
    spinner for a document nothing is coming back to.
    """
    invoice.status = InvoiceStatus.PROCESSING
    db.commit()

    # Captured as soon as they are known. A rollback reverts them on the
    # instance, and they are the only detail that makes the message below
    # worth reading.
    number: str | None = None
    counterparty: str | None = None

    try:
        path = Path(invoice.storage_path) if invoice.storage_path else None
        content = path.read_bytes() if path and path.exists() else None
        if content is None and not invoice.raw_text:
            raise FileNotFoundError(f"Stored file is missing: {invoice.storage_path}")

        parsed = parse_invoice(
            content=content,
            content_type=invoice.content_type,
            filename=invoice.source_filename,
            text=invoice.raw_text,
        )
        apply_parsed(db, invoice, parsed)
        number, counterparty = invoice.invoice_number, invoice.counterparty_gstin
        db.commit()
    except IntegrityError:
        # The same invoice number from the same counterparty is already on
        # file. Only discoverable here: the number is not known until the
        # document has been read, so the dedup at upload time can compare
        # nothing but file hashes — and a re-scan of a paper invoice is a
        # different file every time.
        db.rollback()
        existing = find_duplicate(
            db,
            invoice.business_id,
            invoice_type=invoice.invoice_type,
            counterparty_gstin=counterparty,
            invoice_number=number,
        )
        logger.info(
            "Invoice %s duplicates invoice %s", invoice.id, existing.id if existing else "?"
        )
        invoice.status = InvoiceStatus.FAILED
        invoice.parse_error = _duplicate_message(number, existing)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - the row is the error channel
        # Rollback before writing the failure: a half-applied extraction is
        # worse than none, and after a failed flush the session refuses to
        # commit anything at all until it is cleared.
        db.rollback()
        logger.exception("Invoice %s failed to parse", invoice.id)
        invoice.status = InvoiceStatus.FAILED
        invoice.parse_error = str(exc)[:2000]
        db.commit()

    db.refresh(invoice)
    return invoice


def _duplicate_message(number: str | None, existing: Invoice | None) -> str:
    """Why the row failed, in the words of someone who uploaded a document.

    The constraint name and the psycopg traceback are true and useless; what
    the user needs is which invoice this repeats so they can delete one.
    """
    named = f"Invoice {number}" if number else "This invoice"
    if existing is not None:
        return f"{named} is already on file as invoice {existing.id}."
    return f"{named} is already on file."


def tax_summary(
    db: Session, business_id: int, period: str | None = None
) -> dict[str, dict[str, int | Decimal]]:
    """Aggregate tax by direction, for one period or for all of them.

    One grouped query rather than a query per figure: the dashboard is the
    most-hit endpoint in the product and a business can hold tens of thousands
    of invoices.

    :func:`tax_summaries` is the same query over several periods at once, and
    is what the dashboard uses. This remains for the callers that want exactly
    one.

    Rows whose figures were never extracted are left out, because the returns
    leave them out — every status in
    :data:`~app.models.invoice.UNREADABLE_STATUSES`, not merely ``FAILED``. The
    dashboard's net liability is the number a business plans its cash around,
    and it has to be the number the GSTR-3B it files will show.

    Excluding only ``FAILED`` was the last place in the product still drawing
    that line in its own spot, and the two ways past it were not symmetric. A
    row still queued for a worker carries columns of zeros, so it moved no
    money and inflated the count. A row being *re-extracted* is the expensive
    one: ``process_invoice`` sets ``PROCESSING`` and commits before it reads
    anything, so the figures from the previous, successful read sit on it for
    the length of the parse — counted in full here, and left out of the return
    by ``filing`` and out of the credit pool by ``itc``.

    That is not only a dashboard that disagrees with itself for a few seconds.
    :func:`~app.services.filing.record_filing` stores *these* totals on the
    filed-return row, beside the document ``build_gstr1`` produced from the
    other rule — so a filing recorded while anything was mid-re-parse was
    written down with an invoice count and a taxable value that the return
    stored in the very same row does not contain. That record is what an
    assessment is answered from years later.

    The status counts on the dashboard are unaffected: those are lifetime
    counts of documents, and an unread one still needs attention.

    Three buckets, not two. ``sales`` and ``purchase`` are the tax that appears
    on invoices in each direction; ``credit`` is the part of the purchase side
    that may actually be claimed, which is a smaller and different number. Tax
    on a purchase is not credit if the credit is blocked under s.17(5) — a car,
    a staff lunch, a club membership — or if the supply is under reverse
    charge, where the supplier charges nothing and the buyer self-assesses.
    :mod:`app.services.itc` has always drawn that line; the dashboard's net
    liability is what it is drawn for, because subtracting a blocked credit
    from output tax tells a business it owes less than it does.
    """
    if period is None:
        return _summarise(db, business_id, group_by_period=False)[None]
    return _summarise(db, business_id, periods=[period], group_by_period=False)[None]


def tax_summaries(
    db: Session, business_id: int, periods: Sequence[str]
) -> dict[str, dict[str, dict[str, int | Decimal]]]:
    """:func:`tax_summary` for several periods, in one scan of the table.

    The dashboard shows the selected period beside six months of history, and
    it asked for each of them separately — seven aggregate scans of the
    invoice table on the most-hit endpoint in the product, six of them
    differing only in which month they filtered to. The period is the second
    column of ``ix_invoices_business_period``, so one ``IN`` over the seven
    reads the same span of the index the first of those seven already read.

    Periods with no invoices come back as empty buckets rather than being
    absent, so the chart keeps its gaps and the caller does not have to know
    which months were missing.
    """
    wanted = list(dict.fromkeys(periods))
    if not wanted:
        return {}
    found = _summarise(db, business_id, periods=wanted, group_by_period=True)
    return {period: found.get(period) or _blank_summary() for period in wanted}


def _blank_bucket() -> dict[str, int | Decimal]:
    return {
        "count": 0,
        "taxable_value": Decimal("0.00"),
        "cgst": Decimal("0.00"),
        "sgst": Decimal("0.00"),
        "igst": Decimal("0.00"),
        "cess": Decimal("0.00"),
        "total_value": Decimal("0.00"),
        "total_tax": Decimal("0.00"),
    }


def _blank_summary() -> dict[str, dict[str, int | Decimal]]:
    return {"sales": _blank_bucket(), "purchase": _blank_bucket(), "credit": _blank_bucket()}


# The money columns summed, in the order the select puts them and the order the
# rows are unpacked in. One tuple, so the two cannot drift.
_MONEY = ("taxable_value", "cgst", "sgst", "igst", "cess", "total_value")


def _summarise(
    db: Session,
    business_id: int,
    *,
    periods: Sequence[str] | None = None,
    group_by_period: bool,
) -> dict[str | None, dict[str, dict[str, int | Decimal]]]:
    """The grouped scan behind both entry points, keyed by period.

    ``group_by_period`` decides whether the period reaches the ``GROUP BY`` or
    only the ``WHERE``: a caller asking about one period wants its three
    buckets under a single key, and gets ``None`` for it.
    """
    conditions = [
        Invoice.business_id == business_id,
        Invoice.deleted_at.is_(None),
        Invoice.status.not_in(UNREADABLE_STATUSES),
    ]
    if periods:
        conditions.append(
            Invoice.period == periods[0] if len(periods) == 1 else Invoice.period.in_(periods)
        )

    # The same test ``itc.summarise`` applies before pooling a purchase into
    # available credit, expressed in SQL so the claimable totals come back from
    # the same grouped scan rather than a second pass over the table.
    claims_credit = and_(
        Invoice.itc_eligible.is_(True), Invoice.reverse_charge.is_(False)
    )

    def _summed(name: str):
        return func.coalesce(func.sum(getattr(Invoice, name)), 0)

    def _summed_if_claimable(name: str):
        return func.coalesce(
            func.sum(case((claims_credit, getattr(Invoice, name)), else_=0)), 0
        )

    grouping = [Invoice.period, Invoice.invoice_type] if group_by_period else [Invoice.invoice_type]
    rows = db.execute(
        select(
            *grouping,
            func.count(Invoice.id),
            *(_summed(name) for name in _MONEY),
            func.count(case((claims_credit, Invoice.id))),
            *(_summed_if_claimable(name) for name in _MONEY),
        )
        .where(*conditions)
        .group_by(*grouping)
    ).all()

    def _fill(bucket: dict, count, money) -> None:
        bucket["count"] = int(count)
        for name, value in zip(_MONEY, money, strict=True):
            bucket[name] = Decimal(str(value))
        bucket["total_tax"] = (
            bucket["cgst"] + bucket["sgst"] + bucket["igst"] + bucket["cess"]
        )

    summaries: dict[str | None, dict[str, dict[str, int | Decimal]]] = {}
    if not group_by_period:
        summaries[None] = _blank_summary()

    width = len(_MONEY)
    for row in rows:
        if group_by_period:
            row_period, invoice_type, count, *rest = row
        else:
            row_period = None
            invoice_type, count, *rest = row
        summary = summaries.setdefault(row_period, _blank_summary())
        key = invoice_type.value if hasattr(invoice_type, "value") else str(invoice_type)
        _fill(summary.setdefault(key, _blank_bucket()), count, rest[:width])
        # Only a purchase can carry credit; a sale's claimable columns are the
        # same arithmetic over rows that never had credit to begin with.
        if key == InvoiceType.PURCHASE.value:
            _fill(summary["credit"], rest[width], rest[width + 1 :])
    return summaries
