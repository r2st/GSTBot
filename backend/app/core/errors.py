"""One error shape for the whole API, and the handlers that produce it.

Every failure — a 404 raised by a route, a validation error raised before the
route ran, a constraint violation raised by Postgres, or a bug — leaves through
here and comes back looking the same:

    {
      "detail": "Invoice not found",          # what a human should be told
      "error": {"code": "not_found", "status": 404, ...},
      "correlation_id": "9f2c1a0b4e7d5a63"    # what to quote in a support ticket
    }

``detail`` is kept as the primary field on purpose. It is what FastAPI already
returns, what every existing client reads, and what the frontend's error
formatter understands; ``error`` and ``correlation_id`` are added beside it
rather than replacing it, so hardening the API did not break its consumers.

The other rule here: an unexpected exception is logged in full and answered
with a generic message. A stack trace, a failing SQL statement or a connection
string in an HTTP response is a gift to whoever is probing the service, and the
correlation id is what lets support find the real error without publishing it.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.logging import get_correlation_id

logger = logging.getLogger(__name__)

# Machine-readable codes for the statuses the API actually returns. A client
# should branch on these rather than on the prose in ``detail``, which is
# written for people and may be reworded.
_CODES = {
    400: "bad_request",
    401: "unauthorized",
    402: "payment_required",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "upstream_error",
    503: "service_unavailable",
    504: "upstream_timeout",
}


def error_code(status_code: int) -> str:
    return _CODES.get(status_code, "error" if status_code < 500 else "internal_error")


def error_body(
    status_code: int,
    detail: Any,
    *,
    code: str | None = None,
    fields: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """The response body every handler in this module returns."""
    body: dict[str, Any] = {
        "detail": detail,
        "error": {
            "code": code or error_code(status_code),
            "status": status_code,
            # A string rendering of ``detail`` for the common case where a
            # client wants one line without type-checking the field.
            "message": detail if isinstance(detail, str) else _summarise(detail),
        },
        "correlation_id": get_correlation_id() or "-",
    }
    if fields:
        body["error"]["fields"] = fields
    return body


def _summarise(detail: Any) -> str:
    if isinstance(detail, dict):
        return str(detail.get("message") or detail)
    if isinstance(detail, list):
        return "; ".join(
            str(item.get("msg") if isinstance(item, dict) else item) for item in detail
        )
    return str(detail)


def _field_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Flatten pydantic's error list into ``{field, message, type}`` entries.

    ``loc`` is dropped of its first element ("body", "query", "path") only when
    something follows it, so a whole-body error still names where it came from.
    """
    fields: list[dict[str, Any]] = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ())]
        name = ".".join(location[1:]) if len(location) > 1 else ".".join(location)
        fields.append(
            {
                "field": name or "body",
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type", "value_error"),
            }
        )
    return fields


def register_exception_handlers(app: FastAPI) -> None:
    """Install every handler on *app*. Called once from ``create_app``."""

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = _field_errors(exc)
        logger.info(
            "Request failed validation",
            extra={
                "path": request.url.path,
                "method": request.method,
                "fields": [f["field"] for f in fields],
            },
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            # The pydantic list stays in ``detail`` so existing clients —
            # including this product's own frontend — keep reading it the way
            # they always have. It goes through jsonable_encoder because a
            # validator that raised carries the exception object in ``ctx``,
            # which json.dumps cannot serialise.
            content=error_body(
                422,
                jsonable_encoder(exc.errors()),
                code="validation_error",
                fields=fields,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # 5xx raised deliberately is still worth a stack-free error line.
        log = logger.warning if exc.status_code >= 500 else logger.info
        log(
            "Request rejected",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status_code": exc.status_code,
            },
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.status_code, exc.detail),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity(request: Request, exc: IntegrityError) -> JSONResponse:
        # A unique or FK violation is the database enforcing a rule the request
        # broke — a 409, not a 500. The driver's message names table and index
        # and is not repeated to the caller.
        logger.warning(
            "Database constraint violated",
            extra={"path": request.url.path, "method": request.method},
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=error_body(
                409,
                "That record conflicts with one that already exists.",
                code="conflict",
            ),
        )

    @app.exception_handler(OperationalError)
    async def _operational(request: Request, exc: OperationalError) -> JSONResponse:
        # A dropped connection or an exhausted pool: the request is retryable
        # and the caller should be told so, rather than shown a 500.
        logger.error(
            "Database unavailable",
            extra={"path": request.url.path, "method": request.method},
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_body(
                503, "The database is temporarily unavailable. Please retry.",
                code="service_unavailable",
            ),
            headers={"Retry-After": "5"},
        )

    @app.exception_handler(SQLAlchemyError)
    async def _sqlalchemy(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception(
            "Unhandled database error",
            extra={"path": request.url.path, "method": request.method},
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body(500, _opaque_message(), code="internal_error"),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled exception",
            extra={
                "path": request.url.path,
                "method": request.method,
                "exception_type": type(exc).__name__,
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body(500, _opaque_message(), code="internal_error"),
        )


def _opaque_message() -> str:
    """What a 500 says. Never the exception — only how to ask about it."""
    correlation = get_correlation_id() or "-"
    if settings.debug:
        return f"Internal server error. Check the logs for correlation id {correlation}."
    return (
        "Something went wrong on our side. The problem has been logged; "
        f"quote reference {correlation} if you contact support."
    )


__all__ = ["HTTPException", "error_body", "error_code", "register_exception_handlers"]
