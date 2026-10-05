"""Tests for OAuth SSO endpoints."""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.models.business import Business, BusinessPlan
from app.models.user import User, UserRole
from app.routers.oauth import _find_or_create_oauth_user, _complete_oauth_login


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_google_login_redirects_when_configured(client):
    from app.routers.oauth import oauth

    if not hasattr(oauth, "_clients") or "google" not in oauth._clients:
        oauth.register(
            name="google",
            client_id="test-id",
            client_secret="test-secret",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
    with patch.object(settings, "google_client_id", "test-id"):
        resp = client.get("/api/v1/auth/google", follow_redirects=False)
        assert resp.status_code in (302, 307, 200)


def test_google_login_returns_501_when_not_configured(client):
    with patch.object(settings, "google_client_id", ""):
        resp = client.get("/api/v1/auth/google")
        assert resp.status_code == 501


def test_github_login_returns_501_when_not_configured(client):
    with patch.object(settings, "github_client_id", ""):
        resp = client.get("/api/v1/auth/github")
        assert resp.status_code == 501


def test_microsoft_login_returns_501_when_not_configured(client):
    with patch.object(settings, "microsoft_client_id", ""):
        resp = client.get("/api/v1/auth/microsoft")
        assert resp.status_code == 501


def test_google_callback_redirects_on_error(client):
    with patch.object(settings, "google_client_id", "test-id"):
        resp = client.get("/api/v1/auth/google/callback", follow_redirects=False)
        assert resp.status_code in (302, 307)
        location = resp.headers.get("location", "")
        assert "error" in location or "login" in location


def test_github_callback_redirects_on_error(client):
    with patch.object(settings, "github_client_id", "test-id"):
        resp = client.get("/api/v1/auth/github/callback", follow_redirects=False)
        assert resp.status_code in (302, 307)
        location = resp.headers.get("location", "")
        assert "error" in location or "login" in location


def test_microsoft_callback_redirects_on_error(client):
    with patch.object(settings, "microsoft_client_id", "test-id"):
        resp = client.get("/api/v1/auth/microsoft/callback", follow_redirects=False)
        assert resp.status_code in (302, 307)
        location = resp.headers.get("location", "")
        assert "error" in location or "login" in location


# ── GB020: is_active gate ──────────────────────────────────


def test_find_or_create_returns_none_for_inactive_user_by_oauth_id(db_session):
    """A deactivated user looked up by OAuth id must not receive a token."""
    business = Business(legal_name="Deactivated Co", plan=BusinessPlan.FREE, is_active=True)
    db_session.add(business)
    db_session.flush()
    user = User(
        email="deactivated@example.com",
        business_id=business.id,
        role=UserRole.OWNER,
        oauth_provider="google",
        oauth_id="deactivated-gid",
        is_active=False,
    )
    db_session.add(user)
    db_session.commit()

    result = _find_or_create_oauth_user(
        db_session,
        provider="google",
        oauth_id="deactivated-gid",
        email="deactivated@example.com",
        name=None,
    )
    assert result is None


def test_find_or_create_returns_none_for_inactive_user_by_email(db_session):
    """A deactivated user looked up by email (no prior OAuth link) must not receive a token."""
    business = Business(legal_name="Suspended Co", plan=BusinessPlan.FREE, is_active=True)
    db_session.add(business)
    db_session.flush()
    user = User(
        email="suspended@example.com",
        hashed_password="unused",
        business_id=business.id,
        role=UserRole.OWNER,
        is_active=False,
    )
    db_session.add(user)
    db_session.commit()

    result = _find_or_create_oauth_user(
        db_session,
        provider="github",
        oauth_id="new-github-id",
        email="suspended@example.com",
        name=None,
    )
    assert result is None
    # The OAuth link must NOT be written onto a deactivated account.
    db_session.refresh(user)
    assert user.oauth_provider is None


def test_find_or_create_returns_active_user(db_session):
    """An active user is returned normally."""
    business = Business(legal_name="Active Co", plan=BusinessPlan.FREE, is_active=True)
    db_session.add(business)
    db_session.flush()
    user = User(
        email="active@example.com",
        business_id=business.id,
        role=UserRole.OWNER,
        oauth_provider="google",
        oauth_id="active-gid",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    result = _find_or_create_oauth_user(
        db_session,
        provider="google",
        oauth_id="active-gid",
        email="active@example.com",
        name=None,
    )
    assert result is not None
    assert result.id == user.id


# ── GB020: _complete_oauth_login redirects deactivated users ────


def test_complete_oauth_login_redirects_deactivated():
    """A None user (deactivated) must redirect to the login page with an error."""
    response = _complete_oauth_login(None, "google")
    assert response.status_code == 307
    assert "account_deactivated" in response.headers["location"]


# ── GB020: audit logging ────────────────────────────────────


def test_complete_oauth_login_logs_successful_login(db_session, caplog):
    """A successful OAuth login must produce an audit log line."""
    business = Business(legal_name="Logging Co", plan=BusinessPlan.FREE, is_active=True)
    db_session.add(business)
    db_session.flush()
    user = User(
        email="logged@example.com",
        business_id=business.id,
        role=UserRole.OWNER,
        oauth_provider="google",
        oauth_id="log-gid",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    with caplog.at_level(logging.INFO, logger="app.routers.oauth"):
        response = _complete_oauth_login(user, "google")

    assert response.status_code == 307
    assert "token=" in response.headers["location"]
    assert any("OAuth login" in record.message for record in caplog.records)


def test_complete_oauth_login_does_not_log_for_deactivated(caplog):
    """No audit log for a deactivated user — there is no login to record."""
    with caplog.at_level(logging.INFO, logger="app.routers.oauth"):
        _complete_oauth_login(None, "github")

    assert not any("OAuth login" in record.message for record in caplog.records)


# ── GB020: rate limiting on callbacks ────────────────────────


def test_oauth_callback_routes_have_rate_limit_dependency():
    """Every OAuth callback route must declare a rate limit dependency."""
    from app.core.routes import collect_api_routes, dependency_calls
    from app.core.rate_limit import RateLimit
    from app.main import app as main_app

    callback_paths = [
        "/api/v1/auth/google/callback",
        "/api/v1/auth/github/callback",
        "/api/v1/auth/microsoft/callback",
    ]
    all_routes = collect_api_routes(main_app)
    for path in callback_paths:
        route = next(
            (r for r in all_routes if getattr(r, "path", None) == path),
            None,
        )
        assert route is not None, f"Route {path} not found"
        callables = list(dependency_calls(route.dependant))
        has_rate_limit = any(isinstance(c, RateLimit) for c in callables)
        assert has_rate_limit, f"{path} has no RateLimit dependency"
