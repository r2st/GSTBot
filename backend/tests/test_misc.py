"""Health and the public metadata endpoints."""
from __future__ import annotations

from tests.conftest import BUSINESS_GSTIN


def test_health_reports_each_dependency(client):
    """A degraded model provider is not a dead API.

    The product still ingests invoices on heuristics alone, so a monitor has
    to be able to tell the two apart.
    """
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    # No key is set in the test environment.
    assert body["ai"] == "unconfigured"


def test_root_points_at_the_docs(client):
    body = client.get("/").json()
    assert body["app"] == "GSTBot"
    assert body["health"] == "/api/v1/health"


def test_states_are_listed(client):
    states = client.get("/api/v1/meta/states").json()
    assert states["27"] == "Maharashtra"
    assert states["29"] == "Karnataka"
    assert len(states) >= 36


def test_gstin_lookup_decodes_a_valid_gstin(client):
    body = client.get(f"/api/v1/meta/gstin/{BUSINESS_GSTIN}").json()
    assert body["valid"] is True
    assert body["state_name"] == "Maharashtra"
    assert body["pan"] == "AAPFU0939F"


def test_gstin_lookup_explains_an_invalid_one(client):
    """A 200 with ``valid: false``, not an error.

    The sign-up form calls this on every keystroke; a 4xx per character would
    be indistinguishable from the endpoint being broken.
    """
    body = client.get("/api/v1/meta/gstin/27AAPFU0939F1ZW").json()
    assert body["valid"] is False
    assert "check digit" in body["error"].lower()


def test_gstin_lookup_needs_no_authentication(client):
    assert client.get(f"/api/v1/meta/gstin/{BUSINESS_GSTIN}").status_code == 200
