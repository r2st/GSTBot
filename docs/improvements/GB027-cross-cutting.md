# GB027 — Cross-cutting concerns (M4, Pass 5 / C94 Pair 4)

**Scope**: auth bypasses, missing validation, inconsistent middleware,
CORS/CSP gaps, missing rate limits.

## Findings

### C94-P4-01: OAuth callback leaks JWT access token in URL query parameter

**File**: `backend/app/routers/oauth.py:118`
**Severity**: High
**Category**: Token leakage

`_complete_oauth_login` redirected the user to
`{FRONTEND_URL}/auth/callback?token={access_token}`, placing a 24-hour
JWT in the URL query string. Query parameters are:

- Logged by reverse proxies, CDNs, and access-log middleware.
- Stored in browser history and visible in the address bar.
- Leaked via the `Referer` header when the callback page loads any
  external resource (analytics, fonts, error tracking).

A URL fragment (`#token=...`) never leaves the browser: it is not sent to
servers, not logged, and not included in `Referer` headers. The frontend
reads it with `window.location.hash`, which is how OAuth 2.0's implicit
flow has always delivered tokens to SPAs.

**Fix**: Changed `?token=` to `#token=` in the redirect URL.

**Tests added**: `test_oauth_token_uses_fragment_not_query_param` asserts
`#token=` is present and `?token=` is absent in the redirect location.
Updated existing `test_complete_oauth_login_logs_successful_login` to
match.

---

### C94-P4-02: SessionMiddleware reuses the JWT signing secret

**File**: `backend/app/main.py:345`
**Severity**: Medium
**Category**: Key reuse / cryptographic hygiene

`SessionMiddleware` was initialised with `secret_key=settings.jwt_secret`
— the same raw secret used to sign JWT access tokens. The session cookie
is present in every OAuth round-trip request and response, giving it a
wider exposure surface than the JWT secret alone. If the session signing
mechanism is ever compromised (timing side-channel, implementation bug in
itsdangerous, log leak of a signed cookie value), the JWT signing key is
compromised too, since they are the same bytes.

Cryptographic best practice (NIST SP 800-108, "key separation") calls for
deriving independent keys for independent purposes from shared material.

**Fix**: Added `derive_session_key()` which uses `hmac.new()` with
SHA-256 and a fixed context string (`"starlette-session-signing"`) to
produce a deterministic but distinct key from the JWT secret. The session
key changes whenever the JWT secret changes (no new config variable), but
the two can no longer be used interchangeably.

**Tests added** (in `TestSessionKeyDerivation`):
- `test_derived_key_differs_from_jwt_secret`
- `test_derived_key_is_deterministic`
- `test_different_jwt_secrets_produce_different_session_keys`
- `test_session_middleware_uses_derived_key` — inspects the assembled
  middleware stack to confirm the wired value.

## Files changed

| File | Change |
|------|--------|
| `backend/app/routers/oauth.py` | `?token=` → `#token=` in redirect |
| `backend/app/main.py` | Added `derive_session_key()`; session middleware uses derived key |
| `backend/tests/test_oauth.py` | Updated existing test; added fragment assertion test |
| `backend/tests/test_security.py` | Added `TestSessionKeyDerivation` (4 tests) |

## Not changed

CORS configuration, CSP headers, global rate limiting, per-route auth
dependencies, and request size limits were reviewed and found correctly
implemented. No additional issues identified in this pass.
