# GB024 — Observability (M11, Pass 5 / C94)

## Methodology

M11 targets observability gaps: missing structured logging, missing metrics,
missing health checks, insufficient error context, and blind spots in monitoring.

## Assessment

The codebase has excellent observability overall:

- **Structured logging** with `JsonFormatter` and `ConsoleFormatter`, correlation
  IDs propagated through HTTP middleware and across Celery tasks.
- **Access logs** with actor identity, duration, client IP, rate-limit state.
- **Health checks** at three tiers (liveness, readiness, full) with dependency
  latency, pool counters, and job heartbeats.
- **Error handlers** that log structured context (path, method, exception type)
  and never leak internal details to callers.
- **Log redaction** for passwords, tokens, PII, and cookie headers.
- **Service-level logging** on parse outcomes, sweep summaries, delivery results,
  model fallbacks — all with structured `extra` fields.

Two concrete gaps remained.

## Findings

### 1. Razorpay client failures logged without structured context

**File:** `app/services/razorpay_client.py`

All five `logger.exception` calls carried only a message string — no operation
name, no HTTP status code, no operation-specific identifiers. Compare with
`openrouter_client.py`, which logs model, attempt count, and latency as
structured `extra` fields.

An operator filtering payment failures in a log aggregator could not tell
`create_customer` from `cancel_subscription` without parsing the message, and
had no way to filter by HTTP status or subscription ID.

**Fix:** Added `_exc_context()` helper that extracts the HTTP status from the
exception (when it wraps an `httpx.HTTPStatusError`) and returns it alongside
the operation name and operation-specific identifiers. Each call site now
passes its own identifiers: `plan_id` for subscriptions, `subscription_id` for
cancel/fetch, `amount_paise` for orders.

### 2. Usage limit enforcement completely silent

**File:** `app/services/usage.py`

The entire module had no logger at all — no `import logging`, no
`logging.getLogger`. When a business hit its tier's usage limit, the refusal
was returned to the caller but left no trace in the logs.

This is a monitoring blind spot for:
- Detecting abuse patterns (a business repeatedly hitting limits)
- Capacity planning (which endpoints are most constrained)
- Debugging user complaints ("why was I blocked?")

**Fix:** Added a logger and a `WARNING`-level log line on limit refusal, with
structured fields: `business_id`, `endpoint`, `used`, `limit`, `tier`, and
`period`. Only the refusal is logged — allowed calls and unlimited endpoints
stay silent.

## Tests added

**File:** `tests/test_observability_payment_usage.py` (9 tests)

### Razorpay structured context (7 tests)
- `test_create_customer_failure_carries_operation_and_status`
- `test_create_subscription_failure_carries_plan_id`
- `test_create_order_failure_carries_amount`
- `test_cancel_subscription_failure_carries_subscription_id`
- `test_fetch_subscription_failure_carries_subscription_id`
- `test_a_transport_error_carries_null_status`

### Usage limit logging (3 tests)
- `test_a_limit_hit_is_logged_with_structured_fields`
- `test_an_allowed_call_is_not_logged`
- `test_an_unlimited_endpoint_is_not_logged`

## Files changed

| File | Change |
|---|---|
| `app/services/razorpay_client.py` | Added `_exc_context()` helper; all 5 failure logs now carry operation, status_code, and identifiers |
| `app/services/usage.py` | Added logger; `check_limit()` logs WARNING on refusal with business/endpoint/tier fields |
| `tests/test_observability_payment_usage.py` | 9 new tests covering both findings |
| `docs/improvements/GB024-observability.md` | This report |
