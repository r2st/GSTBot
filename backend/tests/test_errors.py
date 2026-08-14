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
from tests.conftest import SUPPLIER_GSTIN_SAME_STATE

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


class TestA422DoesNotEchoTheWholeRequestBack:
    """Pydantic puts the rejected value in each error's ``input``.

    That field is what makes a 422 actionable — "we read '2026-13'" beats
    "invalid period" — so it is truncated rather than dropped. But it is the
    *caller's* value, and echoing it whole made every validation error in the
    API a reflector: a bound added to the public GSTIN lookup moved that route
    to a 422 and left the 20KB response body exactly as it was, because the
    reflection had moved into the error handler rather than gone away.

    Bounded here, in the one handler every 422 leaves through, rather than at
    each route that takes a string.
    """

    OVERSIZED = "A" * 20_000

    def test_a_rejected_query_value_is_not_echoed_whole(self, client):
        response = client.get(f"/api/v1/meta/gstin/{self.OVERSIZED}")
        assert response.status_code == 422
        assert len(response.content) < 2_000

    def test_a_rejected_body_field_is_not_echoed_whole(self, client):
        """The same hole through a JSON body rather than a path segment.

        The body-size middleware caps what can be sent at all, but a body well
        under that ceiling still round-tripped in full through the 422.
        """
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": self.OVERSIZED,
                "password": "supersecret123",
                "gstin": "27AAPFU0939F1ZV",
                "legal_name": self.OVERSIZED,
            },
        )
        assert response.status_code == 422
        assert len(response.content) < 4_000

    def test_what_survives_says_it_was_cut(self, client):
        """A silently truncated value would read as the value itself, which is
        worse than either the whole thing or nothing — a caller debugging a
        rejected field would compare it against what they sent and conclude
        the API had mangled it."""
        response = client.get(f"/api/v1/meta/gstin/{self.OVERSIZED}")
        assert "truncated" in response.text

    def test_a_value_short_enough_to_be_useful_is_still_quoted_in_full(self, auth_client):
        """The bound must not cost a 422 its usefulness. A real field — a
        GSTIN, a period, an invoice number — is nowhere near the ceiling and
        has to come back intact, or the truncation has broken the thing it was
        protecting."""
        response = auth_client.get("/api/v1/invoices", params={"period": "2026-13"})
        assert response.status_code == 422
        assert "2026-13" in response.text

    def test_the_detail_list_keeps_its_shape(self, client):
        """The frontend walks ``detail`` as a list of {msg}. Bounding the
        values must not turn the list into a string, which is the obvious way
        to implement this and would break that formatter silently."""
        response = client.post(
            "/api/v1/auth/register", json={"email": self.OVERSIZED}
        )
        detail = response.json()["detail"]
        assert isinstance(detail, list)
        assert all("msg" in entry for entry in detail)


def test_a_404_from_a_route_keeps_its_own_wording(auth_client):
    # The generic handler must not overwrite a message a route wrote on purpose.
    body = auth_client.get("/api/v1/invoices/999999").json()
    assert body["detail"] != ""
    assert "went wrong on our side" not in body["detail"]


def test_a_detail_that_is_neither_string_list_nor_dict_still_gets_a_message():
    """``HTTPException(detail=...)`` takes any object, and one gets raised.

    The envelope promises ``error.message`` is always a string. A detail that
    is a bare scalar — a count, an enum, an exception object — reaches the
    summariser having matched none of its shapes, and the fallback is what
    keeps the promise instead of putting a non-string in a string field.
    """
    body = error_body(409, detail=42)

    assert body["error"]["message"] == "42"
    assert isinstance(body["error"]["message"], str)


def test_a_list_of_plain_strings_is_joined_rather_than_repr_d():
    body = error_body(422, detail=["first problem", "second problem"])

    assert body["error"]["message"] == "first problem; second problem"


def test_a_dict_detail_without_a_message_key_falls_back_to_the_whole_dict():
    # Better a readable dict than an empty message: the caller still has to be
    # able to tell one 409 from another.
    body = error_body(409, detail={"conflict": "arn already recorded"})

    assert "arn already recorded" in body["error"]["message"]


class TestEveryGuardedRouteRefusesInTheSameShape:
    """The envelope, swept over the route table rather than sampled.

    Every test above proves one *handler* produces the shape. None of them
    proves every *route* leaves through those handlers, and that is the half
    that rots: a route can answer 401 from somewhere other than the shared
    dependency — a middleware, a hand-rolled check, a `return JSONResponse(...)`
    — and be perfectly correct about the status while carrying none of
    ``error.code``, ``error.status`` or ``correlation_id``. A client that
    branches on ``error.code`` rather than on the prose then has one endpoint
    it cannot read, and nothing fails until someone hits that endpoint signed
    out.

    401 is the condition used because it is the only failure every guarded
    route can be put into without knowing anything about its body, its
    tenant's data, or what a valid request to it looks like.

    ``tests/test_request_guards.py`` sweeps the same table for whether each
    route *depends* on the guard. This one sweeps what the wire actually says,
    which is what a client sees.
    """

    # Enough to fill any path in the table. Ids are 1 rather than a real row's:
    # the refusal has to land before anything is looked up, so a value that
    # names no row is the stronger input — if one of these ever 404s, the auth
    # check ran after the lookup and the sweep has found that too.
    PATH_VALUES = {
        "alert_id": "1",
        "business_id": "1",
        "invoice_id": "1",
        "run_id": "1",
        "supplier_id": "1",
        "period": "2026-04",
        "return_type": "gstr3b",
        "extension": "json",
        "gstin": SUPPLIER_GSTIN_SAME_STATE,
    }

    def _guarded_routes(self):
        from app.core.deps import get_current_business, get_current_user
        from tests.test_route_contracts import API_ROUTES

        def calls(dependant):
            yield dependant.call
            for sub in dependant.dependencies:
                yield from calls(sub)

        for route in API_ROUTES:
            if route.path.startswith("/_"):
                continue
            if not {get_current_business, get_current_user} & set(calls(route.dependant)):
                continue
            path = route.path
            for name, value in self.PATH_VALUES.items():
                path = path.replace("{" + name + "}", value)
            for method in sorted(route.methods):
                yield method, path

    def test_the_sweep_finds_routes_to_check(self):
        # A generator that yields nothing passes everything below.
        found = list(self._guarded_routes())
        assert len(found) > 20, found
        assert "{" not in "".join(path for _, path in found), (
            "a path parameter had no stand-in value, so the URL is not real: "
            + str([p for _, p in found if "{" in p])
        )

    def test_every_guarded_route_refuses_with_the_full_envelope(self, raw_client):
        wrong = []
        for method, path in self._guarded_routes():
            response = raw_client.request(method, path, json={})
            if response.status_code != 401:
                wrong.append(f"{method} {path} -> {response.status_code}")
                continue
            body = response.json()
            if not {"detail", "error", "correlation_id"} <= set(body):
                wrong.append(f"{method} {path} -> keys {sorted(body)}")
            elif body["error"].get("code") != "unauthorized":
                wrong.append(f"{method} {path} -> code {body['error'].get('code')}")
            elif body["error"].get("status") != 401:
                wrong.append(f"{method} {path} -> status {body['error'].get('status')}")
            elif not body["correlation_id"]:
                wrong.append(f"{method} {path} -> empty correlation_id")
        assert not wrong, "these did not refuse in the shared shape: " + "; ".join(wrong)

    def test_every_refusal_carries_the_correlation_id_as_a_header_too(self, raw_client):
        """Support quotes the header when the body is what is in doubt."""
        missing = [
            f"{method} {path}"
            for method, path in self._guarded_routes()
            if not raw_client.request(method, path, json={}).headers.get("X-Request-ID")
        ]
        assert not missing, missing

    def test_no_refusal_names_what_it_was_protecting(self, raw_client):
        """A 401 must not distinguish "no such row" from "not yours".

        The tenancy rule is that a cross-tenant read is a 404 and never a 403,
        because ids are sequential and a confirmed id is a countable one. The
        same reasoning applies before sign-in: every one of these is asked for
        a row id that does not exist, and none of them may say so.
        """
        leaks = []
        for method, path in self._guarded_routes():
            detail = str(raw_client.request(method, path, json={}).json().get("detail", ""))
            if any(word in detail.lower() for word in ("not found", "no such", "does not exist")):
                leaks.append(f"{method} {path} -> {detail}")
        assert not leaks, leaks
