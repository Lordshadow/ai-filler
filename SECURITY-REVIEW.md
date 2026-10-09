# Authentication Security Review

## Review metadata

- **Service:** AI Filler authentication service
- **Review date:** 2026-10-08
- **Reviewer model:** GPT-5.6-Luna, operating as an AI assistant using Copilot SDK in VS Code
- **Scope:** Authentication service, FastAPI authentication endpoints, session cookies, CSRF protection, frontend logout flows, and the available authentication/security test suites
- **Overall result:** Core authentication flows pass the focused test suite, but two production-relevant issues require remediation. The comprehensive suite also has a test-isolation defect that causes misleading SQLite failures.

## Executive summary

The core signup, login, session authentication, logout, password hashing, duplicate-email handling, case-insensitive email login, brute-force protection, and protected endpoint checks passed the focused authentication suite:

```text
41 passed in 17.87s
```

The service should not be considered fully production-ready until:

1. Production cookie security is enforced rather than left to a deployment reminder.
2. Frontend logout sends the CSRF header required by the backend, and CSRF failures are distinguished from authentication failures.
3. The comprehensive tests clean up SQLite WAL sidecar files and avoid deleting a database while connections or WAL state may still be active.

No evidence of SQL injection bypass, password hash reversibility, session-token hash leakage, or basic authentication bypass was found in the executed tests.

## Findings

### 1. Production session cookies are always issued without `Secure`

- **Severity:** HIGH
- **Confidence:** 9/10
- **File:** `src/ai_filler/main.py`
- **Lines:** 41-49
- **Category:** Security misconfiguration / authentication credential exposure

The `_set_session` helper sets both the bearer session cookie and the CSRF cookie with `secure=False` unconditionally:

```python
response.set_cookie(
    "session_token", str(result["token"]), httponly=True, secure=False,
    samesite="lax", max_age=7 * 24 * 60 * 60,
)
response.set_cookie(
    "csrf_token", str(result["csrf_token"]), httponly=False, secure=False,
    samesite="lax", max_age=7 * 24 * 60 * 60,
)
```

If the service is reachable over HTTP, or if a proxy permits an HTTP downgrade path, the browser can transmit the session bearer credential in plaintext. A network attacker could capture it and impersonate the user for up to seven days.

The README currently says to enable `secure=True` in production, but this is only a deployment instruction; the application itself does not fail closed or select secure behavior from an explicit environment setting.

#### Recommended remediation

- Make secure cookies the production default.
- Use an explicit local-development configuration to permit insecure cookies only when intentionally enabled.
- Enforce HTTPS at the reverse proxy/application boundary.
- Add HSTS at the HTTPS deployment boundary.
- Add an automated test asserting that production configuration emits `Secure` cookies.

### 2. Frontend logout does not send the required CSRF header

- **Severity:** MEDIUM
- **Confidence:** 10/10
- **Files:**
  - `frontend/src/UserPanel.jsx`, lines 37-44
  - `frontend/src/AdminPanel.jsx`, lines 47-54
  - `src/ai_filler/auth/dependencies.py`, lines 21-29
- **Category:** Authentication failure / logout correctness

Both frontend logout handlers issue:

```javascript
fetch("http://127.0.0.1:8000/auth/logout", {
  method: "POST",
  credentials: "include",
});
```

The backend protects `POST /auth/logout` with `current_write_identity`, which requires a valid `X-CSRF-Token` header. Therefore, a normal UI logout request is rejected with HTTP 401, and the server-side session is not revoked. The UI may still navigate to the login page, leaving the bearer session active in the browser.

This is especially risky on shared machines or when a browser session is later reused.

The dependency also maps all `PermissionError` instances to HTTP 401. The README documents that a missing or invalid CSRF token should produce HTTP 403, while a missing or invalid session should produce HTTP 401. Conflating these responses makes client behavior and monitoring less precise.

#### Recommended remediation

- Read the CSRF cookie in the frontend and send it as `X-CSRF-Token` during logout; or provide a carefully designed logout path that still revokes the session without weakening CSRF protection.
- Preserve the server-side revocation behavior and verify it using the same session token after logout.
- Distinguish authentication failures from CSRF failures:
  - HTTP 401 for missing, expired, revoked, or invalid session credentials.
  - HTTP 403 for missing or invalid CSRF credentials when a valid session exists.
- Add user and admin frontend/logout integration tests.

## Test and validation results

### Focused authentication suite

Command:

```bash
.venv/bin/pytest -q \
  tests/test_auth_security.py \
  tests/test_auth_api.py \
  tests/test_auth_integration.py
```

Result:

```text
41 passed in 17.87s
```

Covered behavior includes:

- Argon2 password hashing and verification
- Password minimum length
- Random session-token generation
- SHA-256 token hashing
- Signup and required-field handling
- Case-insensitive email normalization and login
- Duplicate-email rejection
- Correct and incorrect login credentials
- Generic login errors
- Login-failure counting and lockout
- Session authentication and expiration
- Session revocation on logout
- CSRF checks for write operations
- Protected endpoint access control
- API cookie creation
- Signup/login/protected-access/logout integration

### Comprehensive security suite

Command:

```bash
.venv/bin/pytest -q \
  tests/test_auth_security.py \
  tests/test_auth_api.py \
  tests/test_auth_integration.py \
  tests/test_security_comprehensive.py
```

Result: the run produced many failures after the initial tests, primarily due to SQLite test-fixture contamination rather than an authentication bypass.

The comprehensive fixture deletes `data/app.db` between tests but does not consistently remove `data/app.db-wal` and `data/app.db-shm`. The application enables WAL mode in `src/ai_filler/auth/db.py`, so stale sidecars and active connections can cause:

```text
sqlite3.OperationalError: disk I/O error
```

This causes later valid authentication requests to fail and makes the suite unreliable as a security signal. The fixture should close all clients/connections before cleanup and remove the database plus its WAL/SHM sidecars, or preferably use a per-test temporary database path.

### Python compilation

Command:

```bash
.venv/bin/python -m compileall -q src
```

Result: passed.

### Additional security checks

The executed comprehensive checks did not identify successful:

- SQL injection authentication bypasses
- Stacked-query database destruction
- Password-hash reversibility
- Session-token hash reversal
- Basic unauthenticated access to protected endpoints
- XSS execution through JSON API responses

These checks do not replace a full deployment review, HTTPS/proxy review, dependency audit, or external penetration test.

## Remediation priority

1. **High priority:** enforce `Secure` cookies in production and test the configuration.
2. **High priority for correctness:** repair both frontend logout handlers so they send the CSRF header and confirm the response before treating logout as successful.
3. **Medium priority:** return HTTP 403 for CSRF failures and HTTP 401 only for authentication failures.
4. **Test reliability:** isolate each security test with a temporary SQLite database and clean up WAL sidecars/connections safely.
5. **Regression coverage:** add an end-to-end test proving that UI logout revokes the exact session token.

## Follow-up execution — 2026-10-08

The repository contains this `SECURITY-REVIEW.md`; no `.ms` file was present. The remediation plan above was applied:

- Session and CSRF cookies now use `Secure` by default. Set `AI_FILLER_COOKIE_SECURE=false` only for local HTTP development.
- Authenticated requests with missing or invalid CSRF tokens now return HTTP 403; missing or invalid sessions remain HTTP 401.
- User and admin logout send the readable CSRF cookie in `X-CSRF-Token` and only clear local UI state after the server confirms logout.
- Every pytest case uses its own temporary SQLite database, avoiding deletion of `data/app.db` and stale WAL/SHM state.
- OCR model initialization is deferred until image extraction so importing the API does not eagerly initialize OCR.

### Follow-up validation

- `tests/test_auth_security.py`: 26 passed in each of two consecutive runs.
- Python source and test compilation: passed.
- Frontend lint and production build: passed; lint reports five pre-existing unused-variable warnings in `Login.jsx`, `UserPanel.jsx`, and `AdminPanel.jsx`.
- API and comprehensive HTTP suites could not complete in this environment: even a minimal FastAPI `TestClient` request to `/health` remained blocked until timeout. This reproduces outside the project routes, so it is a test-runtime limitation rather than evidence of an application endpoint failure. Re-run those suites in a working Starlette/httpx test environment before treating API-level verification as complete.

The targeted unit checks do not replace production HTTPS/proxy validation, a dependency audit, or an external penetration test.
