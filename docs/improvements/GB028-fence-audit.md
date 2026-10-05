# GB028 — Fence & Boundary Audit (M6)

**Scope**: auth fences, tenant isolation, input validation, rate limiting,
IDOR vulnerabilities.

## Audit summary

A full sweep of the security perimeter covering:

- **JWT authentication** (`core/security.py`, `core/deps.py`) — HS256
  signing, timing-safe absent-account hash, token validation.
- **Tenant isolation** (`core/deps.py`) — single-point resolution via
  `get_active_tenant`, `X-Business-Id` header with membership check.
- **RBAC** (`core/deps.py`) — `RequireRole` dependency enforcing
  Owner > Accountant > Viewer hierarchy.
- **Rate limiting** (`core/rate_limit.py`, `core/middleware.py`) — fixed-window
  counters keyed by tenant, Redis primary with in-memory fallback, global
  middleware covering non-existent paths.
- **Input validation** (`core/params.py`, `core/sanitize.py`, schema validators)
  — bounded integers, LIKE escaping, control-char stripping, path traversal
  prevention, CSV formula injection prevention.
- **Error handling** (`core/errors.py`) — opaque 500s, bounded echoed input,
  correlation IDs, no stack traces in responses.
- **Production invariants** (`core/config.py`) — JWT secret strength, bcrypt
  floor, debug off, explicit CORS origins, HTTPS-only.
- **All routers**: auth, oauth, businesses, invoices, dashboard,
  reconciliation, itc, filing, suppliers, alerts, subscriptions, misc.
- **Background tasks**: invoice parsing, alert sweeps.
- **Existing test coverage**: tenancy contract sweep, RBAC sweep, route
  contracts.

**Overall assessment**: The codebase is exceptionally well-secured with
consistent defense-in-depth. Tenant isolation is enforced at a single
chokepoint (`get_active_tenant`), every router scopes queries by
`business_id`, and cross-tenant access returns 404 (not 403) to prevent
probing. Three findings were identified, all in `oauth.py` and `misc.py`.

## Findings

### GB028-01: OAuth initiation endpoints lack rate limiting

**File**: `backend/app/routers/oauth.py:125,163,211`
**Severity**: Medium
**Category**: Rate limiting gap

The three OAuth initiation endpoints (`GET /auth/google`, `GET /auth/github`,
`GET /auth/microsoft`) had no rate limiting, while their corresponding
callback endpoints all had `_oauth_callback_limit`. An attacker could flood
the initiation endpoints to generate excessive redirect requests, potentially
abusing the OAuth provider's rate limits or creating denial-of-service
conditions.

**Fix**: Added `_oauth_initiate_limit = RateLimit("oauth_initiate", "30/minute", by="ip")`
and applied it as a dependency on all three initiation endpoints.

**Tests added**: `test_oauth_initiation_routes_have_rate_limit_dependency`
sweeps the route table and asserts every OAuth initiation path carries a
`RateLimit` dependency.

---

### GB028-02: OAuth account linking without email_verified check

**File**: `backend/app/routers/oauth.py:77-86`
**Severity**: Medium
**Category**: Account takeover

`_find_or_create_oauth_user` linked an OAuth identity to an existing
password-based account whenever the email addresses matched, without
checking whether the OAuth provider had actually verified that email.

**Attack scenario**: An attacker creates a Google/Microsoft account with
`victim@example.com` as an unverified email, initiates OAuth login, and
the system silently links the attacker's OAuth identity to the victim's
existing password-based account — granting the attacker full access.

**Fix**: Added an `email_verified: bool = False` parameter to
`_find_or_create_oauth_user`. When an existing password-based account
matches by email but `email_verified` is `False`, the function refuses
the link and returns `None` (redirecting to the login page with an error).
Each callback passes the provider's verification flag:

- **Google**: `userinfo.get("email_verified")` — OIDC standard claim.
- **GitHub**: always `True` — the email lookup already filters for
  `primary and verified`.
- **Microsoft**: `userinfo.get("email_verified")` — OIDC standard claim.

New accounts (no existing email match) are unaffected and created normally
regardless of verification status.

**Tests added**:
- `test_unverified_email_does_not_link_existing_account` — confirms that an
  unverified OAuth email is refused when a password-based account exists.
- `test_verified_email_links_existing_account` — confirms that a verified
  email successfully links.
- `test_unverified_email_creates_new_account_if_no_match` — confirms that
  new account creation still works with unverified emails.

---

### GB028-03: PII (email) logged in reminder_subscribe

**File**: `backend/app/routers/misc.py:331`
**Severity**: Low
**Category**: PII leakage in logs

`reminder_subscribe` logged the raw subscriber email:
`logger.info("Reminder subscription: %s", body.email)`. This writes PII
to application logs, which may be shipped to centralized logging systems
(ELK, CloudWatch, Datadog) where retention policies and access controls
are less strict than the application database.

**Fix**: Changed to `logger.info("Reminder subscription received")` —
the event is still recorded for observability without exposing PII.

**Tests added**: `TestReminderSubscribe::test_email_not_logged_as_pii`
submits a subscription with a sentinel email and asserts it does not
appear in any log record.

---

## Pre-existing issue noted

`test_route_contracts.py::test_every_published_route_carries_a_summary_for_the_docs`
was already failing before this audit: all 6 OAuth routes (initiation +
callback) lack `summary=` in their route decorators. Not addressed here
as it is a documentation gap, not a security issue.

## Files changed

| File | Change |
|------|--------|
| `backend/app/routers/oauth.py` | Rate-limit initiation endpoints; add `email_verified` gate |
| `backend/app/routers/misc.py` | Redact email from log |
| `backend/tests/test_oauth.py` | 4 new tests for GB028-01 and GB028-02 |
| `backend/tests/test_misc.py` | 1 new test for GB028-03 |
