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
