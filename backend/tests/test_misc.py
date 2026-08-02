"""Health and the public metadata endpoints."""
from __future__ import annotations

import pytest

from app.routers import misc
from tests.conftest import BUSINESS_GSTIN


@pytest.fixture()
def dependencies(monkeypatch):
    """Drive each health dependency independently.

    The endpoints exist to distinguish one failure from another, so the tests
    have to be able to fail one at a time.
    """

    def configure(*, database=True, redis=True, ai=True):
        result = (True, None) if database else (False, "OperationalError")
        monkeypatch.setattr(misc, "check_database", lambda _db: result)
        monkeypatch.setattr(misc, "redis_ping", lambda: redis)
        monkeypatch.setattr(misc, "is_configured", lambda: ai)

    return configure


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


class TestHealthGrades:
    """The `health` field is the one a monitor should alert on."""

    def test_everything_up_is_ok(self, client, dependencies):
        dependencies()
        body = client.get("/api/v1/health").json()

        assert body["health"] == "ok"
        assert body["checks"]["redis"]["status"] == "ok"
        assert body["checks"]["ai"]["status"] == "configured"

    @pytest.mark.parametrize(
        ("down", "kwargs"),
        [("redis", {"redis": False}), ("the model provider", {"ai": False})],
    )
    def test_a_soft_dependency_degrades_without_failing(self, client, dependencies, down, kwargs):
        """200 while degraded, on purpose.

        Uploads still parse — inline without Redis, on heuristics without a
        model — so a 503 here would page someone at 3am over a free-tier rate
        limit while the product carried on working.
        """
        dependencies(**kwargs)
        response = client.get("/api/v1/health")

        assert response.status_code == 200, down
        assert response.json()["health"] == "degraded"

    def test_a_dead_database_is_unhealthy_and_503(self, client, dependencies):
        dependencies(database=False)
        response = client.get("/api/v1/health")

        assert response.status_code == 503
        body = response.json()
        assert body["health"] == "unhealthy"
        assert body["database"] == "unavailable"
        # The error type is named so the operator knows whether it is a refused
        # connection or an exhausted pool before opening a shell.
        assert body["checks"]["database"]["error"] == "OperationalError"

    def test_the_database_check_is_timed_and_the_pool_reported(self, client, dependencies):
        """"Is the API slow because the pool is exhausted" without a shell."""
        dependencies()
        database = client.get("/api/v1/health").json()["checks"]["database"]

        assert isinstance(database["latency_ms"], float)
        assert "type" in database["pool"]

    def test_a_check_that_raises_is_reported_rather_than_500ing(self, client, monkeypatch):
        """A health endpoint that can itself crash tells a monitor nothing."""

        def boom(_db):
            raise RuntimeError("connection pool is closed")

        monkeypatch.setattr(misc, "check_database", boom)
        response = client.get("/api/v1/health")

        assert response.status_code == 503
        assert response.json()["checks"]["database"]["error"] == "RuntimeError"


class TestProbes:
    """Liveness and readiness answer different questions on purpose."""

    def test_liveness_never_touches_a_dependency(self, client, monkeypatch):
        """Otherwise a database blip restarts every pod at once, turning a
        recoverable outage into a fleet-wide cold start."""

        def fail(*_args, **_kwargs):
            raise AssertionError("liveness must not check the database")

        monkeypatch.setattr(misc, "check_database", fail)
        monkeypatch.setattr(misc, "redis_ping", fail)

        response = client.get("/api/v1/health/live")

        assert response.status_code == 200
        assert response.json()["status"] == "alive"

    def test_readiness_passes_when_the_database_answers(self, client, dependencies):
        dependencies()
        response = client.get("/api/v1/health/ready")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert isinstance(body["database_latency_ms"], float)

    def test_readiness_fails_on_a_dead_database(self, client, dependencies):
        """An instance that cannot read invoices should leave the rotation."""
        dependencies(database=False)
        response = client.get("/api/v1/health/ready")

        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "not_ready"
        assert body["error"] == "OperationalError"

    def test_readiness_tolerates_redis_being_down(self, client, dependencies):
        """Reported, but not disqualifying — uploads still parse inline."""
        dependencies(redis=False)
        response = client.get("/api/v1/health/ready")

        assert response.status_code == 200
        assert response.json()["status"] == "ready"
        assert response.json()["redis"] == "unavailable"


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
