# GB030 — Error Messages (M19, Pass 5)

**Date**: 2026-10-06
**Methodology**: M19 — vague errors, missing context, unhelpful status codes, errors that leak internals, inconsistent error formats
**Result**: 5 findings, all fixed

---

## Findings

### 1. Four 404 responses omit the requested entity ID

**Files**: `routers/alerts.py:75`, `routers/invoices.py:129`, `routers/suppliers.py:112`, `routers/reconciliation.py:409`
**Category**: Missing context

Each `_owned_*()` helper raised a 404 with a bare noun — `"Alert not found"`, `"Invoice not found"`, etc. A caller logging the response or displaying it in a toast has to correlate the error with the request to know *which* entity was missing.

**Fix**: Changed each detail to an f-string that includes the ID: `f"Alert {alert_id} not found"`, `f"Invoice {invoice_id} not found"`, `f"Supplier {supplier_id} not found"`, `f"Reconciliation run {run_id} not found"`.

These IDs are integers the caller supplied in the URL path, so echoing them is not a leak. The tenant-scoped 404 (not 403) pattern is preserved — the response still does not distinguish "does not exist" from "belongs to another tenant".

### 2. OAuth endpoints use raw integer `501` instead of `status.HTTP_501_NOT_IMPLEMENTED`

**File**: `routers/oauth.py` (6 instances: lines 140, 151, 179, 190, 227, 238)
**Category**: Inconsistent format

Every other router in the codebase uses `status.HTTP_*` named constants from `fastapi`. The OAuth router passed the bare integer `501`, making it the only file where a grep for the constant would miss the status code usage.

**Fix**: Replaced all six occurrences with `status.HTTP_501_NOT_IMPLEMENTED`.

### 3. Payment verification failure lacks next-step guidance

**File**: `routers/subscriptions.py:135`
**Category**: Vague message

The original detail — `"Payment verification failed."` — leaves a user who may have been charged with no action to take.

**Fix**: Changed to `"Payment verification failed. Contact support if you were charged, or try the payment again."`.

### 4. Webhook signature failure returns 400 instead of 401

**File**: `routers/subscriptions.py:232`
**Category**: Unhelpful status code

A failed HMAC signature check is an authentication failure, not a malformed request. Returning 400 conflates "your JSON is broken" with "you are not who you claim to be", which hides the real problem from both monitoring and the caller.

**Fix**: Changed `status.HTTP_400_BAD_REQUEST` to `status.HTTP_401_UNAUTHORIZED`.

### 5. Payment upstream errors lack escalation path

**Files**: `routers/subscriptions.py:105`, `routers/subscriptions.py:186`
**Category**: Vague message

The create-order and cancel-subscription 502 responses said `"Try again."` without mentioning support as a fallback. A user whose retries keep failing has nowhere to go.

**Fix**: Appended `", or contact support if this persists."` to both messages.

---

## Tests added

- `TestA404IncludesTheRequestedId` — four tests verifying that 404 responses for invoices, suppliers, alerts, and reconciliation runs include the requested ID in the detail string.
- `TestOAuthNotConfiguredReturns501` — three tests confirming unconfigured Google, GitHub, and Microsoft OAuth endpoints return 501.
- Updated `test_subscriptions.py::TestWebhook::test_invalid_signature_is_refused` to expect 401 (was 400).
- Updated `test_error_prose.py` assertion for the invoice 404 message (f-string template now collapses to `"Invoice {} not found"`).

## Files changed

| File | Change |
|------|--------|
| `routers/alerts.py` | 404 detail includes `alert_id` |
| `routers/invoices.py` | 404 detail includes `invoice_id` |
| `routers/suppliers.py` | 404 detail includes `supplier_id` |
| `routers/reconciliation.py` | 404 detail includes `run_id` |
| `routers/oauth.py` | 6× raw `501` → `status.HTTP_501_NOT_IMPLEMENTED` |
| `routers/subscriptions.py` | Guidance text on payment errors; webhook 400 → 401 |
| `tests/test_error_prose.py` | Relaxed invoice 404 assertion for f-string template |
| `tests/test_errors.py` | 7 new tests in 2 classes |
| `tests/test_subscriptions.py` | Webhook signature test expects 401 |
