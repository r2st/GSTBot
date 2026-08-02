"""The error envelope, and what a failure is allowed to say.

The rule these tests defend: a bug is logged in full and answered with a
generic message. A stack trace, a failing SQL statement or a connection string
in an HTTP response is a gift to whoever is probing the service, and the
correlation id is what lets support find the real error without publishing it.

Everything here uses the ``raw_client`` fixture. The default TestClient
re-raises an unhandled exception into the test rather than letting the handler
turn it into a response, which would mean never reaching the code under test.
"""
from __future__ import annotations

import pytest
from fastapi import APIRouter
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError

from app.core.config import settings
from app.core.errors import error_body, error_code
from app.main import app

# A router of routes that fail in each of the ways the handlers care about.
# Mounted once at import; the paths are namespaced so they cannot collide with
# the real API. Kept out of the schema because this router is bolted onto the
# shared `app` object at import time, so it is visible to every other test in
# the session — including the ones in test_route_contracts.py that sweep the
# published surface. A fault-injection probe is not part of the API.
_boom = APIRouter(prefix="/_test_errors", include_in_schema=False)


@_boom.get("/unhandled")
async def _raise_unhandled() -> None:
    # The shape of a real bug: a None where a row was assumed.
    raise ValueError("connection to postgres://gstbot:hunter2@db:5432 failed")


@_boom.get("/integrity")
async def _raise_integrity() -> None:
    raise IntegrityError(
        "INSERT INTO invoices (invoice_number) VALUES ('INV-1')",
        {},
        Exception('duplicate key value violates unique constraint "ix_invoices_number"'),
    )


@_boom.get("/operational")
async def _raise_operational() -> None:
    raise OperationalError("SELECT 1", {}, Exception("server closed the connection"))


@_boom.get("/sqlalchemy")
async def _raise_sqlalchemy() -> None:
    raise SQLAlchemyError("mapper failed on table invoices")


@_boom.get("/keyerror")
async def _raise_keyerror() -> None:
    raise KeyError("taxable_value")


app.include_router(_boom)


@pytest.fixture(autouse=True)
def _production_error_handling():
    """Run these tests against the app as it is deployed, with debug off.

    ``create_app`` passes ``debug=settings.debug`` to FastAPI, and Starlette's
    ServerErrorMiddleware answers an unhandled exception with a full traceback
    page whenever that flag is set — the app's own handler never runs. That is
    the point of debug mode and it is safe, because ``_production_invariants``
    refuses to start with DEBUG=true when ENVIRONMENT is production *or*
    staging. But it means the default test configuration (development, debug
    on) exercises Starlette's page rather than the handler these tests are
    about, so the flag is turned off here and the stack rebuilt.
    """
    original = app.debug
    app.debug = False
    # Starlette caches the composed middleware stack; the flag is read when it
    # is built, so changing it after the fact does nothing on its own.
    app.middleware_stack = app.build_middleware_stack()
    yield
    app.debug = original
    app.middleware_stack = app.build_middleware_stack()


# ---- the envelope ----

def test_every_error_carries_the_same_three_keys(client):
    response = client.get("/api/v1/invoices/999999")
    assert response.status_code in (401, 404)
    body = response.json()
    assert set(body) >= {"detail", "error", "correlation_id"}
    assert set(body["error"]) >= {"code", "status", "message"}


def test_detail_stays_the_primary_field(auth_client):
    """``detail`` is what FastAPI already returned and what clients read.

    ``error`` and ``correlation_id`` were added beside it rather than replacing
    it, so hardening the API did not break its consumers.
    """
    response = auth_client.get("/api/v1/invoices/999999")
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


def test_the_error_block_repeats_the_status(auth_client):
    response = auth_client.get("/api/v1/invoices/999999")
    assert response.json()["error"]["status"] == 404


def test_a_machine_readable_code_accompanies_the_prose(auth_client):
    # A client should branch on this rather than on the wording of ``detail``.
    assert auth_client.get("/api/v1/invoices/999999").json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [
        (400, "bad_request"),
        (401, "unauthorized"),
        (404, "not_found"),
        (409, "conflict"),
        (413, "payload_too_large"),
        (422, "validation_error"),
        (429, "rate_limited"),
        (500, "internal_error"),
        (503, "service_unavailable"),
    ],
)
def test_known_statuses_map_to_stable_codes(status_code, expected):
    assert error_code(status_code) == expected


def test_an_unmapped_4xx_gets_a_generic_code():
    assert error_code(418) == "error"


def test_an_unmapped_5xx_is_still_an_internal_error():
    # A client must be able to tell "our fault" from "your fault" even for a
    # status this module has never heard of.
    assert error_code(599) == "internal_error"


def test_a_string_detail_is_reused_as_the_message():
    body = error_body(404, "Invoice not found")
    assert body["error"]["message"] == "Invoice not found"


def test_a_list_detail_is_summarised_into_one_line():
    body = error_body(422, [{"msg": "field required"}, {"msg": "not a valid date"}])
    assert body["error"]["message"] == "field required; not a valid date"


def test_a_dict_detail_is_summarised_by_its_message():
    body = error_body(409, {"message": "Already uploaded as invoice 3", "invoice_id": 3})
    assert body["error"]["message"] == "Already uploaded as invoice 3"


def test_correlation_id_is_never_absent():
    # "-" rather than null: the field is documented as a string, and a client
    # printing it into a support ticket should not render "None".
    assert error_body(500, "x")["correlation_id"] == "-"


# ---- what a bug is allowed to say ----

def test_a_bug_answers_with_a_500(raw_client):
    assert raw_client.get("/_test_errors/unhandled").status_code == 500


def test_a_bug_does_not_leak_the_exception_message(raw_client):
    body = raw_client.get("/_test_errors/unhandled").text
    # The route raises a message containing a password. None of it may appear.
    assert "hunter2" not in body
    assert "postgres://" not in body
    assert "ValueError" not in body


def test_a_bug_does_not_leak_a_traceback(raw_client):
    body = raw_client.get("/_test_errors/unhandled").text
    assert "Traceback" not in body
    assert "_raise_unhandled" not in body
    assert ".py" not in body


def test_a_500_still_offers_a_reference_to_quote(raw_client):
    body = raw_client.get("/_test_errors/unhandled").json()
    # The whole point of the opaque message: support can find the real error
    # without it having been published to the caller.
    assert body["correlation_id"]
    assert body["correlation_id"] in body["detail"]


def test_the_500_reference_matches_the_response_header(raw_client):
    response = raw_client.get("/_test_errors/unhandled")
    assert response.json()["correlation_id"] == response.headers["X-Request-ID"]


def test_a_supplied_correlation_id_is_what_the_500_quotes(raw_client):
    response = raw_client.get(
        "/_test_errors/unhandled", headers={"X-Request-ID": "trace-me-0001"}
    )
    # Support is given the id the *caller* already has, not a second one.
    assert response.json()["correlation_id"] == "trace-me-0001"


def test_any_exception_type_is_caught_not_just_valueerror(raw_client):
    response = raw_client.get("/_test_errors/keyerror")
    assert response.status_code == 500
    assert "taxable_value" not in response.text


def test_the_generic_message_does_not_change_between_bugs(raw_client):
    """Two different bugs must be indistinguishable from outside.

    A message that varied with the exception would let a prober tell a missing
    key from a bad cast, which is the leak this is meant to close.
    """
    first = raw_client.get("/_test_errors/unhandled").json()
    second = raw_client.get("/_test_errors/keyerror").json()
    strip = lambda body: body["detail"].replace(body["correlation_id"], "")  # noqa: E731
    assert strip(first) == strip(second)


@pytest.mark.parametrize("debug", [True, False])
def test_neither_debug_setting_leaks_the_exception(raw_client, monkeypatch, debug):
    # DEBUG changes the wording of the 500 but must never change what it
    # reveals — a staging box with DEBUG on is still on the internet.
    monkeypatch.setattr(settings, "debug", debug)
    body = raw_client.get("/_test_errors/unhandled").text
    assert "hunter2" not in body
    assert "Traceback" not in body


# ---- database failures are classified, not lumped into 500 ----

def test_a_constraint_violation_is_a_409_not_a_500(raw_client):
    # The database enforcing a rule the request broke is the caller's problem.
    assert raw_client.get("/_test_errors/integrity").status_code == 409


def test_a_constraint_violation_does_not_name_the_index(raw_client):
    response = raw_client.get("/_test_errors/integrity")
    # The driver's message names table and index; repeating it hands over the
    # schema.
    assert "ix_invoices_number" not in response.text
    assert "INSERT INTO" not in response.text
    assert response.json()["error"]["code"] == "conflict"


def test_a_dropped_connection_is_a_retryable_503(raw_client):
    response = raw_client.get("/_test_errors/operational")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_the_503_tells_the_caller_when_to_retry(raw_client):
    # Without Retry-After a client either gives up or hammers the recovering
    # database.
    assert raw_client.get("/_test_errors/operational").headers["Retry-After"] == "5"


def test_a_dropped_connection_does_not_leak_the_query(raw_client):
    assert "SELECT 1" not in raw_client.get("/_test_errors/operational").text


def test_an_unclassified_database_error_is_an_opaque_500(raw_client):
    response = raw_client.get("/_test_errors/sqlalchemy")
    assert response.status_code == 500
    assert "mapper failed" not in response.text
    assert "invoices" not in response.text


# ---- validation ----

def test_validation_errors_name_the_field_that_failed(client):
    # Registration is the widest JSON body the API takes, so it is the natural
    # place to exercise the validation handler.
    response = client.post("/api/v1/auth/register", json={"email": "not-an-email"})
    assert response.status_code == 422
    fields = response.json()["error"]["fields"]
    assert any(entry["field"] for entry in fields)
    assert all({"field", "message", "type"} <= set(entry) for entry in fields)


def test_validation_detail_stays_the_pydantic_list(client):
    """The frontend's error formatter walks ``detail`` as a list of {msg}.

    Replacing it with a string would break that formatter silently.
    """
    response = client.post("/api/v1/auth/register", json={"email": "not-an-email"})
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert all("msg" in entry for entry in detail)


def test_validation_errors_are_json_serialisable(client):
    """A validator that raises carries the exception object in ``ctx``.

    ``json.dumps`` cannot serialise that, so the handler runs the list through
    ``jsonable_encoder`` first. Without it this request returns a 500 while
    trying to report a 422.
    """
    # The GSTIN validator raises InvalidGSTIN, and pydantic puts that
    # exception object into the error's ``ctx``.
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "password": "supersecret123",
            "gstin": "NOT-A-VALID-GST",
            "legal_name": "Acme",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_a_404_from_a_route_keeps_its_own_wording(auth_client):
    # The generic handler must not overwrite a message a route wrote on purpose.
    body = auth_client.get("/api/v1/invoices/999999").json()
    assert body["detail"] != ""
    assert "went wrong on our side" not in body["detail"]
