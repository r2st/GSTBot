"""Tests for OAuth SSO endpoints."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_google_login_redirects_when_configured(client):
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
