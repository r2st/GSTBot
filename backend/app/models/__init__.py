"""ORM models.

Importing this package registers every model on ``Base.metadata``, which is
what Alembic autogenerate and the test fixtures' ``create_all`` both rely on.
"""
from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertType
from app.models.business import Business, BusinessPlan
from app.models.gstr_return import GSTRReturn, ReturnStatus, ReturnType
from app.models.invoice import Invoice, InvoiceSource, InvoiceStatus, InvoiceType
from app.models.reconciliation_run import (
    MatchCategory,
    ReconciliationRun,
    ReconciliationStatus,
)
from app.models.supplier import RiskLevel, Supplier
from app.models.user import User, UserRole

__all__ = [
    "Alert",
    "AlertSeverity",
    "AlertStatus",
    "AlertType",
    "Business",
    "BusinessPlan",
    "GSTRReturn",
    "Invoice",
    "InvoiceSource",
    "InvoiceStatus",
    "InvoiceType",
    "MatchCategory",
    "ReconciliationRun",
    "ReconciliationStatus",
    "ReturnStatus",
    "ReturnType",
    "RiskLevel",
    "Supplier",
    "User",
    "UserRole",
]
