"""Pytest fixtures: in-memory SQLite plus a FastAPI client with overrides.

Nothing external is touched. No OpenRouter key is set, so every AI path
degrades to its deterministic fallback — which means the suite also asserts
that those fallbacks actually work, rather than only exercising the happy
path against a mock.
"""
from __future__ import annotations

import os
import tempfile

# A clean, keyless config *before* any app module imports settings.
os.environ.setdefault("OPENROUTER_API_KEY", "")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-tests-only")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "development")
# No broker exists here, and the extraction pipeline is what we assert on, so
# uploads parse inline.
os.environ.setdefault("CELERY_ENABLED", "false")
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp(prefix="gstbot-uploads-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402  (importing main registers every model)
from app.models.business import Business  # noqa: E402
from app.models.user import User  # noqa: E402

# Checksum-valid GSTINs used across the suite. Two Maharashtra (27) and one
# Karnataka (29), so both the intra-state and inter-state tax splits have real
# data to run against.
BUSINESS_GSTIN = "27AAPFU0939F1ZV"  # Maharashtra — the tenant under test.
SUPPLIER_GSTIN_SAME_STATE = "27AACCM6094J1Z3"  # Maharashtra — CGST + SGST.
SUPPLIER_GSTIN_OTHER_STATE = "29AAGCB7383J1Z4"  # Karnataka — IGST.

TEST_EMAIL = "owner@example.com"
TEST_PASSWORD = "supersecret123"

SAMPLE_INVOICE_TEXT = f"""\
NORTHWIND SUPPLIES PRIVATE LIMITED
GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}
1st Floor, MG Road, Bengaluru, Karnataka 560001

TAX INVOICE

Invoice No: INV-2026-0042
Invoice Date: 15/04/2026
Place of Supply: 27 Maharashtra

Bill To:
UMANG TRADERS
GSTIN: {BUSINESS_GSTIN}
Andheri East, Mumbai, Maharashtra 400069

HSN Code: 84713010
Description                Qty     Rate        Amount
Laptop computers            10  45,000.00   450,000.00

Taxable Value:  450000.00
IGST @ 18%:      81000.00
Grand Total:    531000.00
"""


@pytest.fixture()
def db_session():
    """A single shared in-memory DB (StaticPool keeps one connection)."""
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enforce_foreign_keys(dbapi_connection, _record):
        # SQLite ignores FKs unless asked; without this the tenancy tests
        # would pass against a schema Postgres would reject.
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_client(client):
    """A registered, logged-in client with the Authorization header set."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "gstin": BUSINESS_GSTIN,
            "legal_name": "Umang Traders Private Limited",
            "trade_name": "Umang Traders",
            "full_name": "Umang Shah",
        },
    )
    assert response.status_code == 201, response.text
    client.headers.update({"Authorization": f"Bearer {response.json()['access_token']}"})
    return client


@pytest.fixture()
def current_user(db_session, auth_client) -> User:
    return db_session.query(User).filter_by(email=TEST_EMAIL).one()


@pytest.fixture()
def business(db_session, auth_client) -> Business:
    return db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()


@pytest.fixture()
def other_tenant(client):
    """A second registered business, for cross-tenant isolation tests.

    Returns its bearer token rather than a client, so a test can point the
    same client at either tenant without a second TestClient.
    """
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "rival@example.com",
            "password": "anothersecret123",
            "gstin": SUPPLIER_GSTIN_SAME_STATE,
            "legal_name": "Rival Trading Co",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


@pytest.fixture()
def sample_invoice_text() -> str:
    """A realistic inter-state purchase invoice, as extracted text."""
    return SAMPLE_INVOICE_TEXT


@pytest.fixture()
def stub_openrouter(monkeypatch):
    """Make the model path reachable and scripted.

    Returns a dict the test fills with the JSON the "model" should return.
    Without this fixture no key is configured and every test exercises the
    heuristic fallback instead — both paths matter, so both are tested.
    """
    from app.core.config import settings
    from app.services import invoice_parser, openrouter_client

    payload: dict = {}

    monkeypatch.setattr(settings, "openrouter_api_key", "test-key")
    monkeypatch.setattr(openrouter_client, "is_configured", lambda: True)
    monkeypatch.setattr(invoice_parser, "is_configured", lambda: True)
    monkeypatch.setattr(
        invoice_parser, "chat_json", lambda *args, **kwargs: dict(payload)
    )
    return payload
