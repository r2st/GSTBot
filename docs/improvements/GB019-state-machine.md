# GB019 — State Machine Audit (M3, Pass 4)

**Date:** 2026-10-06
**Methodology:** M3 — State Machine Audit
**Pass:** 4
**Findings:** 2

---

## Audited Stateful Entities

| Entity | Enum | States | Verdict |
|---|---|---|---|
| Subscription | `SubscriptionStatus` | ACTIVE, CANCELLED, PAST_DUE, EXPIRED | **Fixed** — PAST_DUE and EXPIRED were dead states |
| ReconciliationRun | `ReconciliationStatus` | QUEUED, RUNNING, COMPLETED, FAILED | **Pinned** — QUEUED is unreachable; test locks the contract |
| Invoice | `InvoiceStatus` | UPLOADED → PROCESSING → PARSED/FAILED → MATCHED/MISMATCHED/MISSING_IN_2B/DUPLICATE | Clean |
| GSTRReturn | `ReturnStatus` | DRAFT, READY, FILED, IMPORTED | Clean |
| Alert | `AlertStatus` | PENDING → SENT → READ → DISMISSED/RESOLVED/FAILED | Clean |

---

## Finding 1: SubscriptionStatus.PAST_DUE and EXPIRED were dead states

**Severity:** High
**Files changed:** `app/routers/subscriptions.py`, `tests/test_subscriptions.py`

### Problem

The `SubscriptionStatus` enum defines PAST_DUE and EXPIRED, but no code path ever assigned them. The Razorpay webhook endpoint was a stub that returned `{"status": "ok"}` without processing any events. This meant:

- A failed payment left the subscription as ACTIVE — the business kept paid-tier access indefinitely.
- `get_tier()` in `usage.py` correctly gates on `sub.status != "active"` to return FREE, but that guard was never triggered because the status never changed.

### Fix

Implemented the webhook handler to map Razorpay events to status transitions:

| Razorpay Event | New Status |
|---|---|
| `payment.failed` | PAST_DUE |
| `subscription.halted` | PAST_DUE |
| `subscription.cancelled` | CANCELLED |
| `subscription.expired` | EXPIRED |
| `subscription.activated` | ACTIVE |
| `subscription.charged` | ACTIVE |

The handler looks up the subscription by `razorpay_subscription_id`, applies the transition only if the status actually changes, and logs the old → new transition.

### Tests added (7)

- `test_payment_failed_transitions_to_past_due`
- `test_past_due_subscription_degrades_tier_to_free`
- `test_subscription_halted_transitions_to_past_due`
- `test_subscription_charged_reactivates_past_due`
- `test_subscription_expired_transitions_to_expired`
- `test_unknown_razorpay_id_is_a_harmless_noop`
- `test_malformed_json_is_acknowledged_without_crashing`

---

## Finding 2: ReconciliationStatus.QUEUED is unreachable

**Severity:** Low
**Files changed:** `tests/test_reconciliation.py`

### Problem

`ReconciliationStatus.QUEUED` exists in the enum but `run_reconciliation()` creates runs directly in RUNNING status. No code path ever assigns QUEUED. With `native_enum=False` (VARCHAR storage), this is harmless but misleading.

### Decision

Left the enum member in place — removing it is safe (VARCHAR column, no migration needed) but conservative practice for production databases. Added tests to pin the contract: if a future developer adds a queue, the tests document the current expectation.

### Tests added (2)

- `test_a_new_run_starts_at_running` — verifies `run_reconciliation` never produces QUEUED
- `test_queued_is_never_used_across_the_codebase` — AST-walks `app/` to confirm no code references `ReconciliationStatus.QUEUED`

---

## Test Results

```
tests/test_subscriptions.py::TestWebhook — 9 passed (0.37s)
tests/test_reconciliation.py::TestReconciliationRunAlwaysStartsRunning — 2 passed (0.22s)
```
