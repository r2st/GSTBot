"""Contract checks over the assembled route table.

These are not tests of business behaviour. They are guards against two ways
FastAPI silently misreads the code we write, both of which have bitten this
codebase and neither of which shows up as a failure in the router's own tests:

1.  ``from __future__ import annotations`` turns ``-> None`` into the NoneType
    *class*, which FastAPI reads as a real response model. On a 204 that trips
    an assertion at import time and the whole app stops booting.

2.  FastAPI resolves string annotations against ``call.__globals__``. A
    callable-class dependency has no ``__globals__``, so its ``request:
    Request`` parameter stays an unresolved ForwardRef, and FastAPI quietly
    reclassifies it as a required *query parameter*. Every route carrying that
    dependency then 422s — including register and login.

Both failures are structural, so the checks sweep every route rather than
naming the ones that happen to be wrong today.

Sweeping is itself the fragile part, and it has already broken once: see
``_collect_api_routes`` for why ``app.routes`` is not the list it looks like.
"""
from __future__ import annotations

from io import BytesIO

import pytest
from fastapi import Request
from fastapi.dependencies.utils import get_dependant, get_typed_signature
from fastapi.routing import APIRoute
from starlette.status import HTTP_204_NO_CONTENT, HTTP_304_NOT_MODIFIED

from app.core.rate_limit import RateLimit
from app.main import app
from tests.conftest import SUPPLIER_GSTIN_SAME_STATE, TEST_EMAIL, TEST_PASSWORD

# Statuses RFC 9110 forbids a body on. FastAPI asserts on these at import.
BODYLESS_STATUSES = {HTTP_204_NO_CONTENT, HTTP_304_NOT_MODIFIED, 100, 101, 102, 103}

# Routes that must appear in any correct sweep, one per router. If the walk
# below silently stops descending again, these name what went missing instead
# of leaving a count to be argued about.
EXPECTED_PATHS = frozenset(
    {
        "/api/v1/health",
        "/api/v1/auth/login",
        "/api/v1/invoices",
        "/api/v1/dashboard",
        "/api/v1/reconciliation/run",
        "/api/v1/itc",
        "/api/v1/filing/validate",
        "/api/v1/suppliers",
    }
)


def _descend(candidates, collected: list) -> None:
    for item in candidates:
        if hasattr(item, "effective_candidates"):
            _descend(item.effective_candidates(), collected)
        else:
            collected.append(item)


def _collect_api_routes(application) -> list:
    """Every route the app serves, resolved to the path it answers on.

    ``app.routes`` is not a flat list of the routes an app serves. Since
    FastAPI 0.141 ``include_router`` no longer copies the router's routes into
    the parent; it appends one lazy ``_IncludedRouter`` node that materialises
    its children — with the prefix, tags and dependencies already applied — on
    demand. Filtering ``app.routes`` for ``APIRoute`` therefore finds exactly
    one route here, the bare ``/``, which is how every sweep in this file
    quietly stopped sweeping anything while still passing.

    The materialised children are not ``APIRoute`` instances but they carry the
    same attributes these checks read (``path``, ``methods``, ``status_code``,
    ``response_model``, ``dependant``, ``endpoint``, ``include_in_schema``), so
    both shapes are collected interchangeably — which also keeps this working
    against a FastAPI that still flattens.
    """
    collected: list = []
    for route in application.routes:
        if hasattr(route, "effective_candidates"):
            # A node's low-priority list already contains its descendants',
            # so it is read here rather than inside the recursion, which
            # would collect those routes once per level.
            collected.extend(route.effective_low_priority_routes())
            _descend(route.effective_candidates(), collected)
        elif isinstance(route, APIRoute):
            collected.append(route)
    return collected


API_ROUTES = _collect_api_routes(app)


def _route_id(route) -> str:
    return f"{','.join(sorted(route.methods))} {route.path}"


def _upload(client, text: str, *, name: str = "bill.txt") -> int:
    """Upload one invoice and return its id. Mirrors tests/test_invoices.py."""
    response = client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, BytesIO(text.encode()), "text/plain")},
        data={"invoice_type": "purchase"},
    )
    assert response.status_code == 201, response.text
    return response.json()["invoice"]["id"]


@pytest.fixture(scope="module")
def routes():
    # If this is ever empty the sweeps below would pass vacuously.
    assert API_ROUTES, "no APIRoutes registered — the sweeps would prove nothing"
    return API_ROUTES


class TestTheAppAssembles:
    def test_the_route_table_is_populated(self, routes):
        assert len(routes) > 20

    def test_the_sweep_reaches_every_included_router(self, routes):
        # The count above notices a sweep that collapses to nothing. This
        # notices one that reaches some routers and not others — the shape a
        # half-working walk over a nested route tree actually takes.
        missing = sorted(EXPECTED_PATHS - {route.path for route in routes})
        assert missing == [], "the sweep never reached: " + ", ".join(missing)

    def test_the_sweep_agrees_with_the_published_schema(self, routes):
        # Independent cross-check: OpenAPI is generated by FastAPI's own walk
        # of the tree, so it catches this file's walk drifting from it.
        swept = {route.path for route in routes if route.include_in_schema}
        assert swept == set(app.openapi()["paths"])

    def test_every_route_has_a_unique_method_and_path(self, routes):
        seen = [(_route_id(route)) for route in routes]
        assert len(seen) == len(set(seen)), "two routes claim the same method and path"


class TestBodylessStatusCodes:
    """A 204 must not declare a response model, however indirectly."""

    def test_no_bodyless_route_declares_a_response_model(self, routes):
        offenders = [
            _route_id(route)
            for route in routes
            if route.status_code in BODYLESS_STATUSES and route.response_model
        ]
        assert offenders == [], (
            "these routes return a bodyless status but declare a response model — "
            "pass response_model=None explicitly: " + ", ".join(offenders)
        )

    def test_a_bodyless_route_returns_no_content(self, auth_client, sample_invoice_text):
        # The delete route is the live example of the pattern above; prove the
        # contract end to end rather than only in the route table.
        invoice_id = _upload(auth_client, sample_invoice_text)

        response = auth_client.delete(f"/api/v1/invoices/{invoice_id}")
        assert response.status_code == 204
        assert response.content == b""

    def test_the_deleted_invoice_is_gone_from_the_listing(self, auth_client, sample_invoice_text):
        invoice_id = _upload(auth_client, sample_invoice_text)
        auth_client.delete(f"/api/v1/invoices/{invoice_id}")

        listing = auth_client.get("/api/v1/invoices")
        assert invoice_id not in [row["id"] for row in listing.json()["items"]]


class TestDependencyAnnotationsResolve:
    """No dependency may leak an unresolved annotation into the query string."""

    def test_the_rate_limit_dependency_sees_a_real_request(self):
        # The direct regression: with postponed evaluation on, this parameter
        # comes back as ForwardRef('Request') and FastAPI makes it a query arg.
        signature = get_typed_signature(RateLimit("probe", "5/minute"))
        annotation = signature.parameters["request"].annotation
        assert annotation is Request, f"expected Request, got {annotation!r}"

    def test_a_callable_class_dependency_has_no_globals_to_resolve_against(self):
        # Documents *why* the fix is what it is: were this to gain __globals__
        # in a future FastAPI, the future-import could go back.
        assert not hasattr(RateLimit("probe", "5/minute"), "__globals__")

    def test_no_route_takes_a_query_parameter_named_request(self, routes):
        offenders = [
            _route_id(route)
            for route in routes
            if any(param.name == "request" for param in route.dependant.query_params)
        ]
        assert offenders == [], (
            "'request' surfaced as a query parameter — a dependency's Request "
            "annotation failed to resolve on: " + ", ".join(offenders)
        )

    def test_no_route_has_an_unresolved_forward_ref_anywhere(self, routes):
        offenders = []
        for route in routes:
            for param in (
                route.dependant.query_params
                + route.dependant.path_params
                + route.dependant.header_params
                + route.dependant.cookie_params
            ):
                if isinstance(param.field_info.annotation, str) or "ForwardRef" in repr(
                    param.field_info.annotation
                ):
                    offenders.append(f"{_route_id(route)}:{param.name}")
        assert offenders == [], "unresolved annotations: " + ", ".join(offenders)

    def test_every_rate_limited_route_still_resolves_its_dependencies(self, routes):
        # get_dependant re-walks the tree the way startup does; a dependency
        # that cannot be introspected raises here rather than at request time.
        for route in routes:
            dependant = get_dependant(path=route.path_format, call=route.endpoint)
            assert dependant is not None


class TestRateLimitedRoutesAcceptPlainRequests:
    """The user-visible shape of bug 2: a 422 asking for a 'request' field."""

    def test_register_does_not_demand_a_request_query_parameter(self, client):
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "contract@example.com",
                "password": "Sufficiently-Long-Pass1",
                "gstin": SUPPLIER_GSTIN_SAME_STATE,
                "legal_name": "Contract Test Private Limited",
                "trade_name": "Contract Test",
                "full_name": "Contract Tester",
            },
        )
        assert response.status_code == 201, response.text

    def test_login_does_not_demand_a_request_query_parameter(self, client, auth_client):
        # Login is the OAuth2 password form, so the credentials go as form data.
        response = client.post(
            "/api/v1/auth/login",
            data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200, response.text

    def test_a_validation_error_names_a_real_field(self, client):
        # Before the fix the 422 pointed at ["query", "request"], which is not
        # a field any caller can supply — the error was unactionable.
        response = client.post("/api/v1/auth/login", data={"username": "nobody@example.com"})
        assert response.status_code == 422
        locations = [detail["loc"] for detail in response.json()["detail"]]
        assert ["query", "request"] not in locations
        assert all("request" not in location for location in locations)


class TestEndpointSignatures:
    """Cheap sweeps that catch copy-paste mistakes across the routers."""

    def test_every_published_route_carries_a_summary_for_the_docs(self, routes):
        # Only routes that actually reach /docs are held to this. The redirect
        # at "/" is include_in_schema=False and has no reader to document for.
        missing = [
            _route_id(route)
            for route in routes
            if route.include_in_schema and not (route.summary or route.description)
        ]
        assert missing == [], "undocumented routes: " + ", ".join(missing)

    def test_the_openapi_schema_builds(self):
        # Generating the schema walks every response model, so a model that is
        # unserialisable fails here rather than the first time someone opens
        # /docs in production.
        schema = app.openapi()
        assert schema["openapi"].startswith("3.")
        assert schema["paths"]
