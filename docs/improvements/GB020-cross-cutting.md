# GB020 — Cross-cutting concerns (M4, Pass 4)

**Date:** 2026-10-06
**Methodology:** M4 — cross-module inconsistencies (error handling, auth checks, input validation, logging)

## Summary

OAuth SSO callbacks were inconsistent with the password login flow across three
cross-cutting concerns: auth enforcement, audit logging, and rate limiting.
Every other auth path in the codebase handled all three; the OAuth callbacks
handled none.

## Findings

### F1: OAuth callbacks skip `is_active` check (auth inconsistency)

**File:** `backend/app/routers/oauth.py` — `_find_or_create_oauth_user()`

The password login flow (`auth.py:522`) explicitly checks `user.is_active` and
returns a 403 with a clear message when a deactivated user tries to sign in.
The OAuth flow returned any matching user regardless of `is_active`, then issued
a JWT for them. The downstream `get_current_user` dependency rejects inactive
users on every subsequent request, so the data was never accessible — but the
user received no explanation, just a broken session (the frontend saw 401s on
every call with no "deactivated" message).

**Fix:** `_find_or_create_oauth_user` now returns `None` for inactive users.
A new `_complete_oauth_login` helper redirects to `/login?error=account_deactivated`
when the user is `None`, giving the frontend the same signal the password flow
gives. The inactive check runs before the OAuth link is written, so deactivating
an account also prevents it from being linked to a new OAuth provider.

### F2: OAuth logins produce no audit log (logging gap)

**File:** `backend/app/routers/oauth.py` — all three callback functions

The password login logs `"Login"` with `user_id` and `business_id` at INFO
level. Registration logs `"Business registered"`. All three OAuth callbacks
succeeded silently — the only audit trail this product keeps (per the `deps.py`
docstring) had a gap for every SSO login.

**Fix:** `_complete_oauth_login` logs `"OAuth login"` with `user_id`,
`business_id`, and `provider` at INFO, matching the password flow's audit line.

### F3: OAuth callbacks have no rate limiting (rate limiting gap)

**File:** `backend/app/routers/oauth.py` — all three callback routes

Every other route in the codebase declares a `RateLimit` dependency. The OAuth
callbacks had none. The initiation routes (`/google`, `/github`, `/microsoft`)
are redirects to external providers and are naturally gated by the round trip;
the callbacks are where the work happens (database lookup/write, token issuance)
and they were unbounded.

**Fix:** Added `_oauth_callback_limit = RateLimit("oauth_callback", "30/minute", by="ip")`
as a dependency on all three callback routes. Keyed by IP, like the login and
register limits, because the caller is mid-redirect and has no bearer token.

## Tests added

| Test | What it asserts |
|------|-----------------|
| `test_find_or_create_returns_none_for_inactive_user_by_oauth_id` | OAuth-id lookup of a deactivated user returns None |
| `test_find_or_create_returns_none_for_inactive_user_by_email` | Email-fallback lookup of a deactivated user returns None and does not link OAuth |
| `test_find_or_create_returns_active_user` | Active users are returned normally (regression guard) |
| `test_complete_oauth_login_redirects_deactivated` | None user redirects to login with account_deactivated error |
| `test_complete_oauth_login_logs_successful_login` | Successful login emits an INFO audit log |
| `test_complete_oauth_login_does_not_log_for_deactivated` | Deactivated redirect does not emit a login log |
| `test_oauth_callback_routes_have_rate_limit_dependency` | All three callback routes have a RateLimit in their dependency chain |

## Files changed

- `backend/app/routers/oauth.py` — is_active gate, audit logging, rate limiting
- `backend/tests/test_oauth.py` — 7 new tests
- `docs/improvements/GB020-cross-cutting.md` — this report
