# GB025 — Silent Failure (M5, Pass 5 / C94)

**Date**: 2026-10-06
**Method**: M5 — silent failures (swallowed exceptions, missing error propagation, data loss without warning)
**Scope**: `backend/app/routers/subscriptions.py`

## Findings

### F1: Webhook silently accepts malformed JSON (`subscriptions.py:232`)

The Razorpay webhook handler caught `json.JSONDecodeError` and returned
`{"status": "ok"}` with no logging. A signed but garbled webhook body — a
truncated payload from a network error, a Razorpay encoding change — was
acknowledged as successfully processed. Razorpay would not retry it, and the
subscription state transition it carried (payment failure, cancellation,
expiry) was permanently lost.

**Fix**: reject with HTTP 400 and log the error so Razorpay retries the
delivery and operators can see it happened.

### F2: `cancel_subscription` silently ignores Razorpay API failure (`subscriptions.py:182`)

When `razorpay_client.cancel_subscription()` returned `None` (API timeout,
network error, 5xx from Razorpay), the handler ignored the failure and
proceeded to set the local subscription to FREE / CANCELLED and commit.
The user saw "cancelled" but Razorpay continued billing them on the next
cycle.

**Fix**: if the Razorpay cancellation fails, return HTTP 502 and leave the
local subscription unchanged so the user can retry.

## Tests added

| Test | Assertion |
|---|---|
| `test_malformed_json_is_rejected` | Malformed webhook body → 400 (was 200) |
| `test_razorpay_failure_blocks_local_cancel` | API failure → 502, subscription stays PRO/ACTIVE |

## Files changed

- `backend/app/routers/subscriptions.py`
- `backend/tests/test_subscriptions.py`
