# AI Filler Authentication Service

A production-grade, reusable authentication and authorization system built with FastAPI, SQLite, and RBAC (Role-Based Access Control).

## Features

- **Secure User Registration & Login**
  - Self-registration for regular users (email-based)
  - Admin creation by super-admins (ID-based)
  - Argon2id password hashing with salt
  - Rate limiting (5 attempts, 15-minute lockout)

- **Session Management**
  - Opaque session tokens (256-bit entropy)
  - HttpOnly cookies for XSS protection
  - CSRF tokens in non-HttpOnly cookies
  - Automatic session expiration (7 days)

- **Role-Based Access Control (RBAC)**
  - User role: regular users, multi-tenant by organization
  - Admin role: organization administrators
  - Super-admin role: provisions organization administrators
  - Dependency injection for route protection
- Audit-ready logging capabilities

## Initial Super Admin and Admin Provisioning

Create the first super-admin locally with `.venv/bin/python -m ai_filler.auth.bootstrap`. The command prompts for an ID and password without saving the plaintext password; bootstrap is disabled once a super-admin exists. The super-admin signs in through the Super User tab and creates organization admins from the super-admin panel. Each created organization admin receives a generated `ADM-...` login ID. The API requires a valid super-admin session and CSRF token for this operation; regular users and organization admins receive HTTP 403.

- **Security Features**
  - Case-insensitive email uniqueness (functional index)
  - Password verification with timing-safe comparison
  - CSRF token validation on state-changing requests
  - SQLite with foreign key constraints enabled
  - Transaction management with explicit commits

## Usage in Other Projects

### Installation

```bash
# If using the auth module from ai_filler package
pip install -e /path/to/ai-filler

# Or copy the auth module to your project
cp -r src/ai_filler/auth your_project/auth
```

### Quick Start

```python
from fastapi import FastAPI, Depends, Response
from ai_filler.auth.service import signup, login, logout, authenticate
from ai_filler.auth.dependencies import current_identity, current_write_identity
from ai_filler.auth.db import init_db
from ai_filler.auth.security import verify_password

app = FastAPI()

# Initialize database (run once at startup)
init_db()

# Signup endpoint
@app.post("/auth/signup")
def signup_endpoint(request: SignupRequest):
    return {"user": signup(**request.model_dump())}

# Login endpoint
@app.post("/auth/login")
def login_endpoint(request: LoginRequest, response: Response):
    result = login(identifier=request.identifier, password=request.password, kind="user")
    response.set_cookie("session_token", result["token"], httponly=True, max_age=7*24*60*60)
    response.set_cookie("csrf_token", result["csrf_token"], httponly=False, max_age=7*24*60*60)
    return {"user": result["user"]}

# Protected route: requires authentication
@app.get("/protected")
def protected_route(identity: dict = Depends(current_identity)):
    return {"message": f"Hello {identity['email']}"}

# Protected route: requires CSRF token for state changes
@app.post("/data")
def create_data(identity: dict = Depends(current_write_identity)):
    return {"status": "created"}
```

### Database Initialization

The auth system uses SQLite with the following tables:

- `identities`: user/admin accounts
- `sessions`: active session tokens
- `login_attempts`: rate limiting tracking
- `organizations`: multi-tenant organization data

Run `init_db()` from `ai_filler.auth.db` on first startup.

### Authentication Dependencies

Two FastAPI dependencies are provided:

1. **`current_identity`** - Read-only access
   - Verifies session token is valid
   - Raises 401 if no valid session
   - Used for GET requests

2. **`current_write_identity`** - State-changing operations
   - Requires valid session token AND CSRF token
   - Raises 401 if no valid session
   - Raises 403 if CSRF token missing or invalid
   - Used for POST/PUT/DELETE requests

### Cookie Configuration

Cookies are `Secure` by default. Set `AI_FILLER_COOKIE_SECURE=false` only for local HTTP development; production deployments must use HTTPS.

**Session Token Cookie** (HttpOnly):
- Name: `session_token`
- HttpOnly: Yes (prevents XSS exfiltration)
- Secure: Enabled by default (disable only for local HTTP development)
- SameSite: Lax (prevents CSRF)
- Max-Age: 7 days

**CSRF Token Cookie** (non-HttpOnly):
- Name: `csrf_token`
- HttpOnly: No (must be readable by JavaScript)
- Secure: Enabled by default (disable only for local HTTP development)
- SameSite: Lax (provides secondary CSRF protection)
- Max-Age: 7 days

### Frontend Integration

```javascript
// After login, cookies are automatically sent
fetch('/protected', {
  credentials: 'include'  // Include cookies
})

// For state-changing requests, include CSRF token
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('csrf_token='))
  ?.split('=')[1];

fetch('/data', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'X-CSRF-Token': csrfToken
  }
})
```

### Rate Limiting Configuration

Located in `src/ai_filler/auth/service.py`:

```python
MAX_LOGIN_FAILURES = 5        # Max failed attempts before lockout
LOCK_MINUTES = 15             # Lockout duration
```

### Testing

The auth module includes comprehensive test suites:

```bash
# Run all auth tests
pytest tests/test_auth_security.py tests/test_auth_api.py -v

# Run specific test class
pytest tests/test_auth_security.py::TestPasswordHashing -v

# Run with coverage
pytest --cov=src/ai_filler/auth tests/
```

## Architecture

### Security Model

- **Password Storage**: Argon2id hashing (not reversible)
- **Session Tokens**: Opaque 256-bit tokens, only hash stored in DB
- **CSRF Protection**: Dual-token pattern (httponly + non-httponly)
- **Rate Limiting**: Per-identity tracking with exponential backoff
- **Transaction Safety**: SQLite explicit commits prevent rollback vulnerabilities

### Multi-Tenancy

Each identity (user/admin) is associated with an `organization_id`:

```python
# User belongs to their organization
users.organization_id = organizations.id

# Admin manages an organization
organization_admins.organization_id = organizations.id
```

Processing endpoints can filter by `identity['organization_id']` to enforce isolation.

## Deployment Considerations

1. **HTTPS Only**: Set `secure=True` on cookies
2. **Database Path**: Use absolute paths, ensure write permissions
3. **Key Management**: Session/CSRF tokens are cryptographically secure (no key needed)
4. **Backups**: SQLite database file should be regularly backed up
5. **Monitoring**: Log authentication attempts for anomaly detection

## Future Enhancements

- [ ] OAuth2/social login integration
- [ ] Two-factor authentication (2FA)
- [ ] API key authentication for service-to-service
- [ ] Refresh token rotation
- [ ] Session revocation across all devices
- [ ] Login history and device tracking
- [ ] Passwordless authentication (magic links)

## Testing with curl

```bash
# Signup
curl -X POST http://127.0.0.1:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test User",
    "email": "test@example.com",
    "password": "SecurePass123!",
    "date_of_birth": "1990-01-01",
    "phone_number": "1234567890"
  }'

# Login
curl -X POST http://127.0.0.1:8000/auth/user/login \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d '{
    "identifier": "test@example.com",
    "password": "SecurePass123!"
  }'

# Access protected endpoint
curl -X GET http://127.0.0.1:8000/auth/me \
  -b /tmp/cookies.txt \
  -H "X-CSRF-Token: $(grep csrf_token /tmp/cookies.txt | awk '{print $NF}')"

# Logout
curl -X POST http://127.0.0.1:8000/auth/logout \
  -b /tmp/cookies.txt \
  -H "X-CSRF-Token: $(grep csrf_token /tmp/cookies.txt | awk '{print $NF}')"
```

## Files

- `auth/db.py` - Database schema and initialization
- `auth/service.py` - Business logic (signup, login, logout, authenticate)
- `auth/security.py` - Password hashing and token generation
- `auth/dependencies.py` - FastAPI dependency injection
- `tests/test_auth_security.py` - Unit tests (26 tests)
- `tests/test_auth_api.py` - API endpoint tests (7 tests)

All tests pass with 100% success rate and comprehensive edge case coverage.
