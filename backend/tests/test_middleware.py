"""The response contract every endpoint shares: error shape, id, headers.

These go through the real app rather than calling the handlers directly,
because what is being asserted is that the middleware *stack* composes — an
error raised inside a route still leaves with the security headers and the
correlation id attached, and a 500 still does not leak the exception.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.errors import error_body, error_code
from app.main import app


class TestErrorEnvelope:
    def test_a_404_carries_code_status_and_correlation_id(self, auth_client):
        response = auth_client.get("/api/v1/invoices/999999")
        assert response.status_code == 404
        body = response.json()
        assert body["error"]["code"] == "not_found"
        assert body["error"]["status"] == 404
        assert body["correlation_id"]
        # `detail` is still the primary field: the frontend and every existing
        # client read it, and hardening the API must not break them.
        assert isinstance(body["detail"], str)

    def test_the_body_id_matches_the_header_id(self, auth_client):
        # Support is given one id; it has to be the same one in both places.
        response = auth_client.get("/api/v1/invoices/999999")
        assert response.json()["correlation_id"] == response.headers["X-Request-ID"]

    def test_a_validation_error_lists_the_offending_fields(self, client):
        response = client.post("/api/v1/auth/register", json={"email": "not-an-email"})
        assert response.status_code == 422
        body = response.json()
        assert body["error"]["code"] == "validation_error"
        assert "email" in {f["field"] for f in body["error"]["fields"]}
        # The pydantic list stays in `detail` unchanged, for old clients.
        assert isinstance(body["detail"], list)

    def test_a_validator_that_raises_still_serialises(self, client):
        # A pydantic validator that raised puts the exception object in `ctx`,
        # which json.dumps cannot encode; the handler runs it through
        # jsonable_encoder for exactly this case.
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "a@example.com",
                "password": "supersecret123",
                "gstin": "NOT-A-VALID-GSTIN",
                "legal_name": "X",
            },
        )
        assert response.status_code == 422
        assert response.json()["error"]["fields"]

    def test_a_401_is_shaped_like_every_other_error(self, client):
        body = client.get("/api/v1/auth/me").json()
        assert body["error"]["code"] == "unauthorized"

    def test_an_unknown_path_is_a_shaped_404(self, client):
        # Starlette's own 404, not one a route raised — it must still match.
        body = client.get("/api/v1/no-such-thing").json()
        assert body["error"]["code"] == "not_found"

    def test_a_wrong_method_is_405(self, client):
        assert client.delete("/api/v1/health").status_code == 405


class TestUnhandledExceptions:
    """A bug must not become a disclosure.

    Built against a *non-debug* app rather than the shared one, because
    Starlette's ServerErrorMiddleware renders the traceback into the response
    when the app is in debug mode and never reaches the handler under test.
    The suite runs with DEBUG=true, so asserting this against the shared app
    would assert the developer behaviour and quietly pass whatever production
    does. Production cannot set DEBUG=true at all — Settings refuses to build —
    which is asserted in test_config.py.
    """

    @pytest.fixture()
    def prod_client(self, monkeypatch):
        from fastapi.testclient import TestClient

        from app.core.config import settings
        from app.main import create_app

        monkeypatch.setattr(settings, "debug", False)
        prod_app = create_app()

        @prod_app.get("/api/v1/_test_boom")
        def _boom():
            raise RuntimeError("connection to postgres://user:hunter2@db failed")

        with TestClient(prod_app, raise_server_exceptions=False) as test_client:
            yield test_client

    def test_the_exception_text_never_reaches_the_caller(self, prod_client):
        response = prod_client.get("/api/v1/_test_boom", headers={"X-Request-ID": "trace-500"})
        assert response.status_code == 500
        assert "hunter2" not in response.text
        assert "postgres://" not in response.text
        assert "RuntimeError" not in response.text
        assert "Traceback" not in response.text

    def test_the_caller_is_given_something_to_quote(self, prod_client):
        response = prod_client.get("/api/v1/_test_boom", headers={"X-Request-ID": "trace-500"})
        assert response.json()["correlation_id"] == "trace-500"
        assert "trace-500" in response.json()["error"]["message"]

    def test_the_response_is_still_the_standard_envelope(self, prod_client):
        body = prod_client.get("/api/v1/_test_boom").json()
        assert body["error"]["code"] == "internal_error"
        assert body["error"]["status"] == 500

    def test_the_failure_is_logged_in_full(self, prod_client, caplog):
        # The detail has to survive somewhere, or support cannot act on the id.
        with caplog.at_level("ERROR"):
            prod_client.get("/api/v1/_test_boom")
        assert any(
            "hunter2" in record.getMessage() or record.exc_info for record in caplog.records
        )


class TestDatabaseErrorMapping:
    """A database failure the request caused is not a 500."""

    @pytest.fixture()
    def failing_route(self, request):
        exc = request.param

        @app.get("/api/v1/_test_db_error")
        def _fail():
            raise exc

        yield
        app.router.routes = [
            r for r in app.router.routes if getattr(r, "path", "") != "/api/v1/_test_db_error"
        ]

    @pytest.mark.parametrize(
        "failing_route",
        [IntegrityError("INSERT ...", {}, Exception("duplicate key ix_invoices_file_hash"))],
        indirect=True,
    )
    def test_a_constraint_violation_is_a_409(self, client, failing_route):
        response = client.get("/api/v1/_test_db_error")
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "conflict"
        # The driver names the table and the index; the caller does not get it.
        assert "ix_invoices_file_hash" not in response.text

    @pytest.mark.parametrize(
        "failing_route",
        [OperationalError("SELECT 1", {}, Exception("server closed the connection"))],
        indirect=True,
    )
    def test_a_dropped_connection_is_a_retryable_503(self, client, failing_route):
        response = client.get("/api/v1/_test_db_error")
        assert response.status_code == 503
        # Without this the caller has no way to know retrying is the right move.
        assert response.headers["Retry-After"] == "5"


class TestCorrelationIdHeader:
    def test_every_response_carries_one(self, client):
        response = client.get("/api/v1/health")
        assert len(response.headers["X-Request-ID"]) == 16
        assert response.headers["X-Correlation-ID"] == response.headers["X-Request-ID"]

    def test_a_supplied_id_is_reused(self, client):
        # A trace that starts in the frontend stays one trace.
        response = client.get("/api/v1/health", headers={"X-Request-ID": "frontend-abc-123"})
        assert response.headers["X-Request-ID"] == "frontend-abc-123"

    def test_x_correlation_id_is_honoured_too(self, client):
        response = client.get("/api/v1/health", headers={"X-Correlation-ID": "gateway-9"})
        assert response.headers["X-Request-ID"] == "gateway-9"

    @pytest.mark.parametrize("forged", ["abc\r\nX-Admin: true", "a b", "id\nSet-Cookie: x=1"])
    def test_a_header_that_would_forge_a_response_header_is_replaced(self, client, forged):
        response = client.get("/api/v1/health", headers={"X-Request-ID": forged})
        echoed = response.headers["X-Request-ID"]
        assert echoed != forged
        assert "\n" not in echoed and "\r" not in echoed
        assert "x-admin" not in {k.lower() for k in response.headers}

    def test_two_requests_get_different_ids(self, client):
        first = client.get("/api/v1/health").headers["X-Request-ID"]
        second = client.get("/api/v1/health").headers["X-Request-ID"]
        assert first != second

    def test_an_error_response_carries_one_too(self, client):
        # The response most likely to be reported to support.
        assert client.get("/api/v1/auth/me").headers["X-Request-ID"]


class TestSecurityHeaders:
    @pytest.mark.parametrize(
        "header,expected",
        [
            ("X-Content-Type-Options", "nosniff"),
            ("X-Frame-Options", "DENY"),
            ("Referrer-Policy", "no-referrer"),
            ("Cross-Origin-Opener-Policy", "same-origin"),
        ],
    )
    def test_the_baseline_headers_are_present(self, client, header, expected):
        assert client.get("/api/v1/health").headers[header] == expected

    def test_the_csp_forbids_everything(self, client):
        # Nothing this API serves should ever be rendered, so a stored value
        # reflected into an error page has nothing to execute with.
        csp = client.get("/api/v1/health").headers["Content-Security-Policy"]
        assert "default-src 'none'" in csp
        assert "frame-ancestors 'none'" in csp

    def test_they_are_on_error_responses_as_well(self, client):
        # The response an injected payload is most likely to come back in.
        assert client.get("/api/v1/auth/me").headers["X-Content-Type-Options"] == "nosniff"

    def test_hsts_is_absent_when_tls_is_not_terminated_upstream(self, client):
        # Sending it from a plain-HTTP dev server pins a developer's browser to
        # https://localhost, which is not recoverable without clearing state.
        assert "Strict-Transport-Security" not in client.get("/api/v1/health").headers

    def test_hsts_appears_when_enabled(self, client, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "hsts_enabled", True)
        header = client.get("/api/v1/health").headers["Strict-Transport-Security"]
        assert "max-age=31536000" in header


class TestErrorHelpers:
    def test_known_statuses_map_to_stable_codes(self):
        assert error_code(404) == "not_found"
        assert error_code(429) == "rate_limited"

    def test_an_unmapped_client_status_is_generic(self):
        assert error_code(418) == "error"

    def test_an_unmapped_server_status_is_internal(self):
        # A 507 must not tell a client it was their fault.
        assert error_code(507) == "internal_error"

    def test_a_dict_detail_is_summarised_into_a_string_message(self):
        # The duplicate-upload response, which carries the existing invoice id.
        body = error_body(409, {"message": "Already uploaded", "invoice_id": 7})
        assert body["error"]["message"] == "Already uploaded"
        assert body["detail"]["invoice_id"] == 7

    def test_a_list_detail_is_joined(self):
        body = error_body(422, [{"msg": "field required"}, {"msg": "too short"}])
        assert body["error"]["message"] == "field required; too short"

    def test_an_http_exception_detail_survives_the_round_trip(self):
        assert error_body(404, HTTPException(404, "x").detail)["detail"] == "x"


class TestGlobalRateLimit:
    """The blanket ceiling, applied in middleware rather than as a dependency.

    Being middleware is the point: a dependency only runs once a route has
    matched, so it never sees the scan for /admin.php or /.env — which is
    precisely the traffic a global limit exists to absorb.
    """

    @pytest.fixture()
    def tight_limit(self, rate_limited, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "rate_limit_default", "3/minute")
        return rate_limited

    @staticmethod
    def _spend_the_budget(client, times=4):
        """Exhaust the limit and hand back the response that was refused."""
        return [client.get("/admin.php") for _ in range(times)][-1]

    def test_a_scan_for_paths_that_do_not_exist_is_still_limited(self, client, tight_limit):
        scanned = ("admin", "wp", "shell", "x")
        statuses = [client.get(f"/{name}.php").status_code for name in scanned]

        # The first few are ordinary 404s; the limiter takes over before the
        # scanner gets through its list.
        assert statuses[0] == 404
        assert statuses[-1] == 429

    def test_the_429_is_the_standard_error_envelope(self, client, tight_limit):
        response = self._spend_the_budget(client)

        body = response.json()
        assert response.status_code == 429
        assert body["error"]["code"] == "rate_limited"
        assert body["error"]["status"] == 429
        assert "Try again in" in body["error"]["message"]

    def test_the_429_says_when_to_come_back(self, client, tight_limit):
        response = self._spend_the_budget(client)

        assert int(response.headers["retry-after"]) >= 1
        assert response.headers["x-ratelimit-limit"] == "3"
        assert response.headers["x-ratelimit-remaining"] == "0"

    def test_the_429_is_still_traceable(self, client, tight_limit):
        """The body is built inside the limiter, before the correlation
        middleware would normally attach the id — so it attaches its own."""
        response = self._spend_the_budget(client)

        assert response.headers["x-request-id"]
        assert response.json()["correlation_id"] == response.headers["x-request-id"]

    def test_a_cors_preflight_is_never_rate_limited(self, client, tight_limit):
        """A preflight is not a request the caller chose to make. Rejecting one
        surfaces as an opaque CORS failure in the browser rather than as the
        429 it really is."""
        self._spend_the_budget(client, times=6)

        preflight = client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

        assert preflight.status_code != 429

    def test_the_liveness_probe_is_exempt(self, client, tight_limit):
        """An orchestrator polls this every few seconds from one address. Rate
        limiting it would eventually kill the pod for being healthy."""
        self._spend_the_budget(client, times=6)

        assert client.get("/api/v1/health/live").status_code == 200

    def test_the_limit_is_off_when_disabled(self, client, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "rate_limit_enabled", False)
        monkeypatch.setattr(settings, "rate_limit_default", "1/minute")

        assert [client.get("/admin.php").status_code for _ in range(4)] == [404] * 4


class TestCorsReachesTheResponsesMiddlewareProduces:
    """Every response carries the CORS headers, not only the ones a route made.

    ``CORSMiddleware`` used to be added first, which put it closest to the
    route and therefore *innermost*. Anything that answered above it returned
    without ``Access-Control-Allow-Origin``, and a browser discards such a
    response rather than handing it to the caller — so the SPA saw an
    indistinguishable network error.

    The 429 is the case that mattered. ``expose_headers`` names ``Retry-After``
    and the ``X-RateLimit-*`` pair precisely so a client can back off, and
    those headers were only ever set on the one response a browser refused to
    read. A 401 and a 500 come from below the CORS layer and were always fine,
    which is what kept the gap narrow enough to go unnoticed.
    """

    ORIGIN = "http://localhost:5173"

    @pytest.fixture()
    def tight_limit(self, rate_limited, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "rate_limit_default", "3/minute")
        return rate_limited

    def _allow_origin(self, response) -> str | None:
        return response.headers.get("access-control-allow-origin")

    def test_an_ordinary_response_still_carries_it(self, client):
        response = client.get("/api/v1/meta/states", headers={"Origin": self.ORIGIN})
        assert self._allow_origin(response) == self.ORIGIN

    def test_the_rate_limiters_429_carries_it(self, client, tight_limit):
        for _ in range(6):
            response = client.get("/api/v1/meta/states", headers={"Origin": self.ORIGIN})
        assert response.status_code == 429
        assert self._allow_origin(response) == self.ORIGIN

    def test_the_backoff_headers_are_readable_by_the_browser_that_needs_them(
        self, client, tight_limit
    ):
        """A 429 a client cannot read is a 429 it cannot obey."""
        for _ in range(6):
            response = client.get("/api/v1/meta/states", headers={"Origin": self.ORIGIN})
        assert response.status_code == 429
        exposed = response.headers.get("access-control-expose-headers", "").lower()
        assert "retry-after" in exposed
        assert "x-ratelimit-remaining" in exposed
        # The headers themselves are still set; the fix is about reachability.
        assert response.headers["retry-after"]

    def test_the_size_ceilings_413_carries_it(self, raw_client):
        from app.core.config import settings

        response = raw_client.post(
            "/api/v1/itc/set-off",
            content=b'{"pad": "' + b"x" * (settings.max_request_bytes + 1024) + b'"}',
            headers={"Origin": self.ORIGIN, "content-type": "application/json"},
        )
        assert response.status_code == 413
        assert self._allow_origin(response) == self.ORIGIN

    def test_a_401_from_below_the_layer_was_never_affected(self, raw_client):
        response = raw_client.post(
            "/api/v1/itc/set-off", json={}, headers={"Origin": self.ORIGIN}
        )
        assert response.status_code == 401
        assert self._allow_origin(response) == self.ORIGIN

    def test_a_response_no_route_produced_carries_it_too(self, raw_client):
        """A 404 comes from the exception handler, with no route involved."""
        response = raw_client.get("/no/such/path", headers={"Origin": self.ORIGIN})
        assert response.status_code == 404
        assert self._allow_origin(response) == self.ORIGIN

    def test_an_origin_that_is_not_allowed_gets_nothing(self, client):
        """Outermost must not mean permissive: the allowlist still decides."""
        response = client.get(
            "/api/v1/meta/states", headers={"Origin": "https://not-our-frontend.example"}
        )
        assert self._allow_origin(response) is None

    def test_a_preflight_is_answered_above_the_limiter(self, client, tight_limit):
        """CORS being outermost is now what keeps a preflight off the limiter.

        ``RateLimitMiddleware`` skips OPTIONS by hand as well, and that check
        stays for an OPTIONS with no ``Origin``, which is not a preflight.
        """
        for _ in range(6):
            client.get("/api/v1/meta/states", headers={"Origin": self.ORIGIN})

        preflight = client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": self.ORIGIN,
                "Access-Control-Request-Method": "POST",
            },
        )
        assert preflight.status_code == 200
        assert self._allow_origin(preflight) == self.ORIGIN


# ---------------------------------------------------------------------------
# Who acted, and for which business
# ---------------------------------------------------------------------------

class TestAccessLineAttribution:
    """The access line is the only audit trail this product keeps.

    No table records who filed a return or marked an invoice paid, so the
    line for ``POST /filing/gstr3b/filed`` has to say who did it — and, now
    that one login can act for several businesses, *which* books it was done
    to. Before this the line carried an IP and a user agent, and a client's
    filing recorded by a linked accountant was indistinguishable from the
    owner recording it.
    """

    @staticmethod
    def _line(caplog, path):
        return next(
            record
            for record in caplog.records
            if record.name == "app.access" and getattr(record, "http_path", None) == path
        )

    def test_an_authenticated_request_names_the_login_and_its_business(
        self, auth_client, business, db_session, caplog
    ):
        import logging

        from app.models.user import User

        user = db_session.query(User).filter_by(business_id=business.id).one()
        with caplog.at_level(logging.INFO, logger="app.access"):
            assert auth_client.get("/api/v1/dashboard").status_code == 200

        line = self._line(caplog, "/api/v1/dashboard")
        assert line.user_id == user.id
        assert line.business_id == business.id
        assert line.role == "owner"

    def test_a_switched_request_names_the_business_acted_for_not_the_home_one(
        self, auth_client, client, business, caplog
    ):
        import logging

        from tests.test_businesses import link, register_second_business

        register_second_business(client)
        linked_id = link(auth_client).json()["id"]
        assert linked_id != business.id

        with caplog.at_level(logging.INFO, logger="app.access"):
            response = auth_client.get(
                "/api/v1/dashboard", headers={"X-Business-Id": str(linked_id)}
            )
        assert response.status_code == 200

        line = self._line(caplog, "/api/v1/dashboard")
        assert line.business_id == linked_id

    def test_the_role_logged_is_the_one_acted_with_not_the_logins_own(
        self, auth_client, client, business, db_session, caplog
    ):
        import logging

        from app.models.user import User, UserRole
        from tests.test_businesses import SECOND_EMAIL, link, register_second_business

        register_second_business(client)
        # The linked account is a viewer on its own books, so the membership
        # carries viewer — while the login doing the switching is an owner.
        other = db_session.query(User).filter_by(email=SECOND_EMAIL).one()
        other.role = UserRole.VIEWER
        db_session.commit()
        linked_id = link(auth_client).json()["id"]

        with caplog.at_level(logging.INFO, logger="app.access"):
            auth_client.get("/api/v1/dashboard", headers={"X-Business-Id": str(linked_id)})

        assert self._line(caplog, "/api/v1/dashboard").role == "viewer"

    def test_a_refused_switch_still_names_the_login_that_tried_it(
        self, auth_client, business, db_session, caplog
    ):
        # The one line an operator most wants attributed is the 403 for a
        # business the caller was never linked to. The user is stamped before
        # the tenant is resolved so that line is not anonymous; the business
        # is not, because none was acted for.
        import logging

        from app.models.user import User

        user = db_session.query(User).filter_by(business_id=business.id).one()
        with caplog.at_level(logging.INFO, logger="app.access"):
            response = auth_client.get(
                "/api/v1/dashboard", headers={"X-Business-Id": str(business.id + 1000)}
            )
        assert response.status_code == 403

        line = self._line(caplog, "/api/v1/dashboard")
        assert line.user_id == user.id
        assert not hasattr(line, "business_id")
        assert not hasattr(line, "role")

    def test_a_public_route_carries_no_actor_at_all(self, client, caplog):
        import logging

        with caplog.at_level(logging.INFO, logger="app.access"):
            client.get("/api/v1/meta/states")

        line = self._line(caplog, "/api/v1/meta/states")
        for field in ("user_id", "business_id", "role"):
            assert not hasattr(line, field)

    def test_a_rejected_token_carries_no_actor(self, client, caplog):
        # A forged bearer must not be able to write a user id into the audit
        # trail: nothing is stamped until the token has resolved to a live row.
        import logging

        with caplog.at_level(logging.INFO, logger="app.access"):
            response = client.get(
                "/api/v1/dashboard", headers={"Authorization": "Bearer not-a-token"}
            )
        assert response.status_code == 401
        assert not hasattr(self._line(caplog, "/api/v1/dashboard"), "user_id")

    def test_the_fields_reach_the_json_line(self, auth_client, business, caplog):
        # The structured formatter is what production reads; a record
        # attribute that the formatter drops would be an audit trail only
        # ``caplog`` can see.
        import json
        import logging

        from app.core.logging import JsonFormatter

        with caplog.at_level(logging.INFO, logger="app.access"):
            auth_client.get("/api/v1/dashboard")
        payload = json.loads(JsonFormatter().format(self._line(caplog, "/api/v1/dashboard")))
        assert payload["business_id"] == business.id
        assert payload["role"] == "owner"
        assert isinstance(payload["user_id"], int)

    def test_a_request_that_crashed_is_attributed_like_one_that_answered(
        self, raw_client, db_session, caplog
    ):
        # The write that raised half-way through is the request an operator
        # most needs to attribute, and the auth dependencies had already
        # resolved who it was before the handler blew up. The ``failed`` line
        # used to carry method, path and duration alone: no user, no business,
        # not even the address it came from.
        import logging

        from fastapi import APIRouter, Depends

        from app.core.deps import get_current_business
        from app.models.business import Business
        from app.models.user import User
        from tests.conftest import BUSINESS_GSTIN, TEST_EMAIL, TEST_PASSWORD

        probe = APIRouter(prefix="/_test_access", include_in_schema=False)

        @probe.get("/crash")
        def _crash(tenant: Business = Depends(get_current_business)) -> None:
            raise RuntimeError("row assumed present was not")

        app.include_router(probe)
        try:
            registered = raw_client.post(
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
            token = registered.json()["access_token"]
            with caplog.at_level(logging.INFO, logger="app.access"):
                response = raw_client.get(
                    "/_test_access/crash", headers={"Authorization": f"Bearer {token}"}
                )
        finally:
            app.router.routes[:] = [
                route for route in app.router.routes
                if not getattr(route, "path", "").startswith("/_test_access")
            ]
        assert response.status_code == 500

        line = self._line(caplog, "/_test_access/crash")
        user = db_session.query(User).filter_by(email=TEST_EMAIL).one()
        business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()
        assert line.levelname == "ERROR"
        assert line.status_code == 500
        assert line.user_id == user.id
        assert line.business_id == business.id
        assert line.role == "owner"
        assert line.client_ip
        assert hasattr(line, "user_agent")
