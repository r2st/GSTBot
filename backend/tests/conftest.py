"""Pytest fixtures: in-memory SQLite plus a FastAPI client with overrides.

Nothing external is touched. No OpenRouter key is set, so every AI path
degrades to its deterministic fallback — which means the suite also asserts
that those fallbacks actually work, rather than only exercising the happy
path against a mock.

The same rule is applied to Redis: the URL points at a port nothing listens on,
so the rate limiter uses its in-process fallback and a developer who happens to
be running Redis locally does not get counters that survive between test runs.
The ``rate_limited`` fixture is how the limiter itself gets tested.
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
# Deliberately unreachable: the suite must never touch a real Redis, and the
# limiter's degraded path is what runs here.
#
# A Unix socket that does not exist rather than a TCP port assumed to be free.
# A closed port is only closed until somebody runs a container on it — and the
# compose file's REDIS_PORT is exactly the kind of knob that lands one there,
# at which point these tests start talking to a real server and two of them
# fail for a reason that has nothing to do with the code. Nothing can bind a
# path under a directory that does not exist, and the connect fails instantly
# rather than waiting out a timeout.
os.environ.setdefault(
    "REDIS_URL", "unix:///nonexistent/gstbot-tests-must-not-reach-redis.sock"
)
# Off by default. The suite registers a business per test, and a 10/hour
# sign-up limit would fail the twentieth test rather than the code under it.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

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
def raw_client(db_session):
    """A client that returns the 500 rather than re-raising the exception.

    TestClient defaults to ``raise_server_exceptions=True``, which re-raises an
    unhandled exception into the test instead of letting the handler turn it
    into a response. That default is right for most tests — a stack trace beats
    an assertion failure — but it means the "a bug must not leak the exception"
    tests would never reach the code they are about.
    """

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def rate_limited(monkeypatch):
    """Turn the limiter on for one test, with counters starting empty.

    Counters are cleared on the way out as well as in, so a test that trips a
    limit cannot leak a full bucket into whatever runs next.
    """
    from app.core import rate_limit
    from app.core.config import settings

    rate_limit.reset()
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    yield rate_limit
    rate_limit.reset()


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
