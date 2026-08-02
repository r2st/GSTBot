"""Request/response models for invoices."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.invoice import InvoiceSource, InvoiceStatus, InvoiceType
from app.services import gstin as gstin_service


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    supplier_id: int | None = None
    invoice_type: InvoiceType
    status: InvoiceStatus
    source: InvoiceSource

    counterparty_gstin: str | None = None
    counterparty_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    period: str | None = None
    place_of_supply: str | None = None
    hsn_code: str | None = None

    taxable_value: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    total_value: Decimal
    tax_rate: Decimal | None = None
    itc_eligible: bool
    reverse_charge: bool

    source_filename: str | None = None
    parsed_with: str | None = None
    extraction_confidence: float | None = None
    parse_error: str | None = None
    created_at: datetime

    @property
    def total_tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst + self.cess


class InvoiceDetailOut(InvoiceOut):
    """One invoice, with everything the review screen needs.

    ``warnings`` is lifted out of the stored extraction rather than being its
    own column: it is derived from the parse, and a reviewer needs it next to
    the numbers it is about.
    """

    line_items: list[dict] | None = None
    extraction: dict | None = None
    warnings: list[str] = Field(default_factory=list)

    @classmethod
    def from_invoice(cls, invoice) -> InvoiceDetailOut:
        detail = cls.model_validate(invoice)
        extraction = invoice.extraction or {}
        warnings = extraction.get("warnings") or []
        return detail.model_copy(
            update={"warnings": [str(w) for w in warnings] if isinstance(warnings, list) else []}
        )


class InvoiceListOut(BaseModel):
    items: list[InvoiceOut]
    total: int
    limit: int
    offset: int


class InvoiceUploadResponse(BaseModel):
    """What the upload endpoint returns.

    ``queued`` tells the client whether extraction has already happened
    (inline mode) or is still to come (a worker picked it up), so the UI knows
    whether to poll rather than guessing from the status.
    """

    invoice: InvoiceDetailOut
    queued: bool
    message: str


class InvoiceUpdate(BaseModel):
    """Reviewer corrections to an extracted invoice.

    Every field is optional and unset fields are left alone: a user fixing a
    misread GSTIN must not blank the amounts by omission.

    Omitted and ``null`` are different things here. Omitting a field leaves it
    alone; sending ``null`` clears it, which is how a misread GSTIN or date is
    taken back off an invoice. The money and the two credit flags have no
    cleared state — an invoice always carries a figure for every head, zero
    included — so a ``null`` there is refused rather than written.
    """

    counterparty_gstin: str | None = None
    counterparty_name: str | None = Field(default=None, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=64)
    invoice_date: date | None = None
    place_of_supply: str | None = Field(default=None, max_length=2)
    hsn_code: str | None = Field(default=None, max_length=8)
    taxable_value: Decimal | None = Field(default=None, ge=0)
    cgst: Decimal | None = Field(default=None, ge=0)
    sgst: Decimal | None = Field(default=None, ge=0)
    igst: Decimal | None = Field(default=None, ge=0)
    cess: Decimal | None = Field(default=None, ge=0)
    total_value: Decimal | None = Field(default=None, ge=0)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    itc_eligible: bool | None = None
    reverse_charge: bool | None = None

    @field_validator("counterparty_gstin")
    @classmethod
    def _valid_gstin(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            return gstin_service.parse(v).gstin
        except gstin_service.InvalidGSTIN as exc:
            raise ValueError(str(exc)) from exc

    @field_validator(
        "taxable_value",
        "cgst",
        "sgst",
        "igst",
        "cess",
        "total_value",
        "itc_eligible",
        "reverse_charge",
    )
    @classmethod
    def _not_cleared(cls, v, info):
        """Refuse an explicit ``null`` on a field the invoice must always have.

        These columns are NOT NULL. Written through, a ``null`` reached the
        database and came back as an integrity error the API reported as 409
        "that record conflicts with one that already exists" — which is a
        statement about duplicates, and sends a reviewer looking for an invoice
        that does not exist. A form that clears a tax box is the ordinary way
        to arrive here, so it has to say what is actually wrong.
        """
        if v is None:
            raise ValueError(
                f"{info.field_name} cannot be cleared. Omit it to leave it "
                "unchanged, or send 0 (or false) to zero it."
            )
        return v
