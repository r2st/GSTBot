"""Request/response models for pre-filing validation and portal exports."""
from __future__ import annotations

from pydantic import BaseModel


class ValidationIssueOut(BaseModel):
    """One problem found on one invoice."""

    invoice_id: int | None = None
    invoice_number: str | None = None
    field: str
    # "error" blocks a filing; "warning" does not.
    severity: str
    message: str


class ValidationReportOut(BaseModel):
    """Everything wrong with a period, and whether it can be filed."""

    period: str
    ok: bool
    invoice_count: int
    error_count: int
    warning_count: int
    issues: list[ValidationIssueOut]


class FilingPreviewOut(BaseModel):
    """A generated return, with the validation that ran alongside it.

    The document and its problems travel together on purpose: a GSTR-1 that
    was built from invoices with three invalid GSTINs is not a thing anyone
    should be able to download without being told.
    """

    period: str
    return_type: str
    document: dict
    validation: ValidationReportOut
