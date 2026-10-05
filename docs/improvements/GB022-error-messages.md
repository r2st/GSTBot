# GB022 — Error Messages (M19, Pass 4)

**Date**: 2026-10-06
**Methodology**: M19 — vague errors, missing context, unhelpful status codes, errors that leak internals, inconsistent error formats
**Result**: 1 finding, fixed

---

## Findings

### 1. Per-endpoint rate limiter discloses the exact rate spec in the 429 detail

**File**: `core/rate_limit.py:309`
**Category**: Information leak

The `RateLimit.__call__()` dependency interpolated `self.rate.label` into the 429 detail string:

```
Rate limit exceeded: 30/minute. Try again in 42s.
```

`Rate.label` renders the configured capacity as `"30/minute"`, `"120/hour"`, etc. That tells an attacker the exact window size and budget, letting them pace requests just below the limit. The `Retry-After` and `X-RateLimit-*` headers already carry what a well-behaved client needs; the prose is for a person, and a person needs "try again in N seconds", not a configuration value they cannot act on.

The two other rate-limit refusal paths were already clean:
- **Global limiter** (`core/middleware.py`): `"Too many requests. Try again in {retry_after}s."`
- **Per-account login limiter** (`routers/auth.py`): `"Too many failed sign-in attempts. Try again in {budget.retry_after}s."`

The per-endpoint limiter was the outlier. This could not be caught by the AST-based jargon sweep in `test_error_prose.py` because f-string interpolations reduce to `{}` in the template — the slash in `30/minute` only exists at runtime.

**Fix**: Changed the detail to `"Too many requests. Try again in {decision.retry_after}s."`, matching the global limiter's wording.

**Test added** (`test_rate_limit.py::TestEnforcement::test_a_429_does_not_disclose_the_rate_limit_spec`):
Fires login requests until a 429 is returned, then asserts the detail contains no `/` character — ruling out any `N/unit` pattern reaching the caller.

---

## Scope of review

All backend error paths were examined:

- **`core/errors.py`** — central error envelope (`error_body`, `_bounded`, `_bounded_detail`, `_opaque_message`), registered handlers for `RequestValidationError`, `StarletteHTTPException`, `IntegrityError`, `OperationalError`, `SQLAlchemyError`, bare `Exception`. Clean: the 500 handler suppresses internals, the 422 handler echoes bounded inputs, the integrity handler maps to 409 with a user sentence.
- **`core/deps.py`** — auth dependencies. Clean: credentials error is a flat string, role refusals name the role and who to ask, cross-tenant access is 404.
- **All routers** (`auth`, `invoices`, `reconciliation`, `filing`, `businesses`, `subscriptions`, `oauth`, `itc`, `dashboard`, `misc`, `alerts`, `suppliers`) — every `detail=` reviewed. All produce user-facing sentences with no jargon, no leaked internals, and consistent wording.
- **Domain exceptions** (`GSTR2BParseError`, `FilingNotRecordable`, `NoGSTR2BImported`, `PlanLimitExceeded`, `DuplicateInvoice`) — all carry actionable guidance in the message.
- **Frontend** (`lib/api.js`) — `statusMessage()` fallbacks, `errorMessage()` flattening, `readBody()` for non-JSON. The 429 path shows the backend's detail, so the leaked spec was reaching users.
- **Existing sweeps** (`test_error_prose.py`, `errorProse.test.js`) — AST-based jargon and identifier scans over all `detail=` strings and domain exception messages. These enforce the standard going forward but cannot catch runtime interpolation.

The codebase's error handling is exceptionally mature. This single finding — a runtime interpolation the static sweep structurally cannot see — was the only gap.
