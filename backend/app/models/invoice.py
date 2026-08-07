"""Invoices — the table everything else in the product reads from."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import (
    ZERO,
    BusinessScopedMixin,
    JSONType,
    Money,
    SoftDeleteMixin,
    TimestampMixin,
)

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.supplier import Supplier


class InvoiceType(str, Enum):
    SALES = "sales"  # We issued it — feeds GSTR-1.
    PURCHASE = "purchase"  # We received it — feeds ITC and the GSTR-2B match.


class InvoiceStatus(str, Enum):
    UPLOADED = "uploaded"  # Stored, not yet looked at.
    PROCESSING = "processing"  # A worker has picked it up.
    PARSED = "parsed"  # Fields extracted, not yet reconciled.
    FAILED = "failed"  # Extraction gave up; ``parse_error`` says why.
    MATCHED = "matched"  # Found in GSTR-2B with the same figures.
    MISMATCHED = "mismatched"  # Found, but the figures differ.
    MISSING_IN_2B = "missing_in_2b"  # In our books, absent from the supplier's GSTR-1.


# The statuses that mean "the figures on this row were never extracted".
# ``FAILED`` is an extraction that gave up; the other two are one that has not
# run yet. Nothing in any of them can be filed or claimed, because the money
# columns still hold their defaults.
#
# Kept beside the enum rather than in whichever service asked first, because
# both the returns and the ITC position have to draw the line in the same
# place. They did not: the returns excluded ``FAILED`` and the credit pool
# excluded ``FAILED``, but a row still queued for a worker was filable to one
# and countable to the other, and the two answers for one month disagreed for
# reasons no screen showed.
UNREADABLE_STATUSES = (
    InvoiceStatus.FAILED,
    InvoiceStatus.UPLOADED,
    InvoiceStatus.PROCESSING,
)


class InvoiceSource(str, Enum):
    UPLOAD = "upload"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    GSTR2B_IMPORT = "gstr2b_import"
    MANUAL = "manual"


class Invoice(Base, BusinessScopedMixin, TimestampMixin, SoftDeleteMixin):
    """One invoice, sales or purchase.

    Both directions share a table because reconciliation, ITC and the returns
    export all want them side by side, and the columns are the same set of GST
    fields either way. ``invoice_type`` and ``counterparty_gstin`` carry the
    direction: for a purchase the counterparty is the supplier, for a sale it
    is the customer.

    The extracted figures are stored alongside ``raw_text`` and ``extraction``
    rather than replacing them. When a user disputes what the model read off a
    photograph, the original is still there to compare against — and a parser
    improvement can be re-run over stored input instead of asking a business to
    re-photograph a year of paperwork.
    """

    __tablename__ = "invoices"
    __table_args__ = (
        # Natural key of an invoice under GST: the issuer's GSTIN plus their
        # invoice number, within one tenant and direction. This is what makes
        # a re-upload of the same bundle idempotent — and duplicate ITC claims
        # on one invoice are exactly what triggers a departmental notice.
        #
        # Over the *undeleted* rows only, which is what "one invoice on file"
        # means here. Deleting is soft, so a plain constraint counted the
        # tombstone and the key stayed occupied by a row nobody can see: a
        # business that deleted a badly-read invoice and re-scanned it — the
        # ordinary way to fix one — got the second upload marked ``failed``
        # and was told it was "already on file", naming a document the API
        # returns 404 for. There was no way back from that short of SQL,
        # because the delete that was supposed to undo it had already
        # happened. ``find_duplicate`` has always excluded tombstones; this is
        # the constraint agreeing with it.
        Index(
            "uq_invoices_business_type_party_number",
            "business_id",
            "invoice_type",
            "counterparty_gstin",
            "invoice_number",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_invoices_business_created", "business_id", "created_at"),
        Index("ix_invoices_business_period", "business_id", "period"),
        Index("ix_invoices_business_status", "business_id", "status"),
        Index("ix_invoices_business_type_date", "business_id", "invoice_type", "invoice_date"),
        # Rule 37 asks "what is unpaid and older than 180 days" of the whole
        # purchase register, on every ITC screen.
        Index("ix_invoices_business_paid", "business_id", "paid_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )

    invoice_type: Mapped[InvoiceType] = mapped_column(
        SAEnum(InvoiceType, native_enum=False, length=20), nullable=False
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, native_enum=False, length=20),
        default=InvoiceStatus.UPLOADED,
        nullable=False,
    )
    source: Mapped[InvoiceSource] = mapped_column(
        SAEnum(InvoiceSource, native_enum=False, length=20),
        default=InvoiceSource.UPLOAD,
        nullable=False,
    )

    # ---- Counterparty ----
    counterparty_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)
    counterparty_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ---- Document ----
    invoice_number: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Filing period as ``YYYY-MM``, derived from ``invoice_date``. Stored
    # rather than computed per query because every dashboard, return and
    # reconciliation groups by it.
    period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    place_of_supply: Mapped[str | None] = mapped_column(String(2), nullable=True)
    hsn_code: Mapped[str | None] = mapped_column(String(8), nullable=True, index=True)

    # ---- Money ----
    taxable_value: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    cgst: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    sgst: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    igst: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    cess: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    total_value: Mapped[Decimal] = mapped_column(Money, default=ZERO, nullable=False)
    # Rate as a percentage: 18 means 18%. Nullable because a multi-rate invoice
    # has no single rate; the per-line breakdown lives in ``line_items``.
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    # False for exempt, nil-rated, or blocked-credit (s.17(5)) purchases.
    itc_eligible: Mapped[bool] = mapped_column(default=True, nullable=False)
    reverse_charge: Mapped[bool] = mapped_column(default=False, nullable=False)

    # ---- ITC reversal inputs ----
    # When the supplier was paid. Rule 37 reverses the credit on a purchase left
    # unpaid 180 days past the invoice date, so "not yet paid" and "paid" have
    # to be distinguishable per invoice rather than inferred from a ledger the
    # product does not hold. None means unpaid as far as GSTBot knows.
    paid_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Capital goods take their credit over 60 months under Rule 43 instead of
    # in the month of purchase, so they cannot sit in the same pool as inputs.
    is_capital_good: Mapped[bool] = mapped_column(default=False, nullable=False)

    line_items: Mapped[list | None] = mapped_column(JSONType, nullable=True)

    # ---- Provenance ----
    source_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # SHA-256 of the uploaded bytes: catches the same file arriving twice
    # before anything has been extracted from it and there is a document key
    # to deduplicate on.
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Extraction ----
    # The model's full structured answer, kept verbatim.
    extraction: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    # "openrouter:<model>", "heuristic", or "tesseract+openrouter:<model>".
    parsed_with: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 0-1 self-reported by the extractor. Drives which invoices are queued for
    # human review rather than trusted straight into a return.
    extraction_confidence: Mapped[float | None] = mapped_column(nullable=True)
    parse_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    business: Mapped[Business] = relationship(back_populates="invoices")
    supplier: Mapped[Supplier | None] = relationship()

    @property
    def total_tax(self) -> Decimal:
        """CGST + SGST + IGST + cess."""
        return (self.cgst or ZERO) + (self.sgst or ZERO) + (self.igst or ZERO) + (self.cess or ZERO)

    @property
    def claims_credit(self) -> bool:
        """Whether the tax on this row is credit the buyer may actually take.

        Two flags rule it out, and they are not the same thing. ``itc_eligible``
        is false for an exempt or nil-rated purchase and for blocked credit
        under s.17(5) — the motor car, the staff catering — where the tax was
        paid and is simply not creditable. ``reverse_charge`` means the supplier
        charged nothing at all: the buyer pays the tax themselves, and the
        credit for it arises from the payment rather than from this document.

        Either way the figures on the row are not credit, and every ITC
        calculation in the product already skips them: the reconciliation's
        at-risk pool, Rule 37's clock, Rule 43's capital pool, the period's
        available credit. Kept on the model because it belongs to the invoice
        rather than to whichever service asked, and because it had been written
        out four times — which is four chances to leave one out, and one of them
        was taken. See :func:`app.services.supplier_score.exposure`.
        """
        return self.itc_eligible and not self.reverse_charge

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Invoice {self.invoice_type} {self.invoice_number} {self.total_value}>"
