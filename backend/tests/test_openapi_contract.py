"""The published spec must describe what the routes actually answer.

The other sweeps in this suite check that a route *behaves* correctly — that it
resolves its tenant, that it carries a bucket, that a cross-tenant read 404s.
This one checks that the document we hand to client authors agrees with them.

It exists because the two conditional error codes were declared once on the
FastAPI app and inherited by all 44 routes, which published a 401 for the seven
public endpoints that take no token and a 429 for the one probe deliberately
exempt from the limiter. Nothing failed: a spec is only wrong when someone
believes it, and the people who believe it are downstream.
"""
from __future__ import annotations

import pytest

from app.core.openapi import RATE_LIMITED, UNAUTHORIZED, is_guarded, is_metered
from app.core.routes import collect_api_routes
from app.main import app


@pytest.fixture(scope="module")
def spec():
    return app.openapi()


@pytest.fixture(scope="module")
def documented(spec):
    """``{(path, method): {status codes}}`` as published."""
    return {
        (path, method): set(operation.get("responses", {}))
        for path, operations in spec["paths"].items()
        for method, operation in operations.items()
        if isinstance(operation, dict)
    }


def _schema_routes():
    return [route for route in collect_api_routes(app) if route.include_in_schema]


def _operations(route):
    for method in route.methods or ():
        if method.lower() in ("get", "post", "put", "patch", "delete"):
            yield route.path, method.lower()


class TestTheSweepIsReadingSomething:
    """A sweep over an empty table proves nothing; these say it is not."""

    def test_the_schema_has_every_route_in_it(self, documented):
        paths = {path for path, _ in documented}
        assert len(paths) >= 40, f"only {len(paths)} paths in the spec"

    def test_both_kinds_of_route_are_present_to_compare(self):
        routes = _schema_routes()
        guarded = [route for route in routes if is_guarded(route)]
        public = [route for route in routes if not is_guarded(route)]
        # If either side were empty the assertions below would hold vacuously.
        assert len(guarded) >= 30, f"only {len(guarded)} guarded routes"
        assert len(public) >= 5, f"only {len(public)} public routes"


class TestUnauthorizedIsDocumentedWhereItCanHappen:
    def test_every_route_that_requires_a_token_says_so(self, documented):
        missing = [
            f"{method.upper()} {path}"
            for route in _schema_routes()
            if is_guarded(route)
            for path, method in _operations(route)
            if "401" not in documented.get((path, method), set())
        ]
        assert missing == [], "guarded but no documented 401: " + ", ".join(missing)

    def test_no_public_route_advertises_a_401_it_cannot_return(self, documented):
        """The regression. ``/auth/login`` is the one legitimate exception."""
        offenders = [
            f"{method.upper()} {path}"
            for route in _schema_routes()
            if not is_guarded(route)
            for path, method in _operations(route)
            if "401" in documented.get((path, method), set())
            and path != "/api/v1/auth/login"
        ]
        assert offenders == [], (
            "these take no token and cannot answer 401: " + ", ".join(offenders)
        )

    def test_the_login_401_is_its_own_and_not_the_inherited_one(self, spec):
        # Login really does return 401 — for a wrong password, which is a
        # different event from an absent bearer token. The point of filling the
        # code in with setdefault is that this wording survives.
        described = spec["paths"]["/api/v1/auth/login"]["post"]["responses"]["401"]
        assert described["description"] != UNAUTHORIZED["description"]
        assert "password" in described["description"].lower()

    def test_the_public_allowlist_is_what_it_has_always_been(self):
        """Pins the set, so opening a route to the world is a visible diff."""
        public = sorted(
            route.path for route in collect_api_routes(app) if not is_guarded(route)
        )
        assert public == [
            "/",
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/health",
            "/api/v1/health/jobs",
            "/api/v1/health/live",
            "/api/v1/health/ready",
            "/api/v1/meta/gstin/{gstin}",
            "/api/v1/meta/states",
        ]


class TestRateLimitedIsDocumentedWhereItCanHappen:
    def test_every_counted_route_says_it_can_be_limited(self, documented):
        missing = [
            f"{method.upper()} {path}"
            for route in _schema_routes()
            if is_metered(route)
            for path, method in _operations(route)
            if "429" not in documented.get((path, method), set())
        ]
        assert missing == [], "metered but no documented 429: " + ", ".join(missing)

    def test_the_liveness_probe_does_not_advertise_a_429(self, documented):
        """The other regression, and the one with a production consequence.

        ``/health/live`` is the single path in ``_UNLIMITED_PATHS``. It is
        exempt so that a throttled probe never reads as an unready instance and
        takes pods out of rotation — and the spec was telling client authors to
        write exactly the back-off branch that exemption exists to make
        unnecessary.
        """
        assert "429" not in documented[("/api/v1/health/live", "get")]

    def test_it_is_the_only_route_exempt_from_the_limiter(self):
        unmetered = sorted(
            route.path for route in collect_api_routes(app) if not is_metered(route)
        )
        assert unmetered == ["/api/v1/health/live"]

    def test_the_wording_is_the_shared_one(self, spec):
        described = spec["paths"]["/api/v1/health"]["get"]["responses"]["429"]
        assert described["description"] == RATE_LIMITED["description"]


class TestFiveHundredStaysBlanket:
    """The one code that really does belong to every route."""

    def test_every_route_documents_a_500(self, documented):
        missing = [
            f"{method.upper()} {path}"
            for (path, method), codes in documented.items()
            if "500" not in codes
        ]
        assert missing == [], "no documented 500: " + ", ".join(missing)


class TestTheSchemaIsBuiltOnce:
    def test_a_second_call_returns_the_same_cached_object(self):
        # The customisation mutates the cached dict in place. Were the cache
        # guard wrong, this would append duplicates or rebuild on every /docs
        # hit — the spec is assembled from 40-odd routes and is not cheap.
        assert app.openapi() is app.openapi()

    def test_the_customisation_survives_a_rebuild(self):
        """A cleared cache must come back corrected, not raw."""
        from app.main import create_app

        fresh = create_app()
        first = fresh.openapi()
        fresh.openapi_schema = None
        assert (
            "429" not in fresh.openapi()["paths"]["/api/v1/health/live"]["get"]["responses"]
        )
        assert first["paths"].keys() == fresh.openapi_schema["paths"].keys()
