from __future__ import annotations

import re
import secrets
import sqlite3
from datetime import UTC, date, datetime, timedelta

from .db import connect
from .security import (
    LOCK_MINUTES,
    MAX_LOGIN_FAILURES,
    expires_at,
    hash_password,
    new_token,
    now,
    token_hash,
    verify_password,
)


class CSRFError(PermissionError):
    """An authenticated request failed CSRF validation."""


PASSWORD_RESET_MINUTES = 30
PASSWORD_RESET_COOLDOWN_SECONDS = 60

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def validate_email(email: str) -> None:
    if not email or "@" not in email or not EMAIL_REGEX.match(email.strip()):
        raise ValueError("A valid email address containing '@' and a domain is required.")


def _public(identity: sqlite3.Row) -> dict[str, object]:
    result = {
        "id": identity["id"],
        "kind": identity["kind"],
        "email": identity["email"],
        "full_name": identity["full_name"],
        "admin_id": identity["admin_id"],
        "organization_id": identity["organization_id"],
    }
    cols = identity.keys() if hasattr(identity, "keys") else []
    if "organization_name" in cols and identity["organization_name"] is not None:
        result["organization_name"] = identity["organization_name"]
    if "phone_number" in cols and identity["phone_number"] is not None:
        result["phone_number"] = identity["phone_number"]
    if "date_of_birth" in cols and identity["date_of_birth"] is not None:
        result["date_of_birth"] = identity["date_of_birth"]
    if "created_at" in cols and identity["created_at"] is not None:
        result["created_at"] = identity["created_at"]
    if "recovery_email" in cols and identity["recovery_email"] is not None:
        result["recovery_email"] = identity["recovery_email"]
    return result


def signup(
    *,
    full_name: str,
    email: str,
    password: str,
    date_of_birth: str,
    phone_number: str,
) -> dict[str, object]:
    email = email.strip().lower()
    validate_email(email)
    if not full_name.strip() or not email or not date_of_birth or not phone_number.strip():
        raise ValueError("All required fields must be provided.")
    with connect() as db:
        try:
            cursor = db.execute(
                """INSERT INTO identities
                (kind, email, password_hash, full_name, date_of_birth, phone_number)
                VALUES ('user', ?, ?, ?, ?, ?)""",
                (email, hash_password(password), full_name.strip(), date_of_birth, phone_number.strip()),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("Unable to create account with those details.") from error
        return _public(db.execute("SELECT * FROM identities WHERE id = ?", (cursor.lastrowid,)).fetchone())


def create_super_admin(
    *, identifier: str, password: str, recovery_email: str | None = None
) -> dict[str, object]:
    """Create a one-time bootstrap super admin; never expose this as a public route."""
    identifier = identifier.strip()
    if not identifier or not password:
        raise ValueError("A super-admin ID and password are required.")
    with connect() as db:
        if db.execute("SELECT 1 FROM identities WHERE kind = 'super_admin' LIMIT 1").fetchone():
            raise ValueError("A super-admin already exists; bootstrap is disabled.")
        try:
            cursor = db.execute(
                """INSERT INTO identities
                (kind, email, password_hash, full_name, admin_id, recovery_email)
                VALUES ('super_admin', ?, ?, 'Super Admin', ?, ?)""",
                (
                    f"{identifier.lower()}@super-admin.local",
                    hash_password(password),
                    identifier,
                    recovery_email.strip().lower() if recovery_email else None,
                ),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("That super-admin ID already exists.") from error
        return _public(db.execute("SELECT * FROM identities WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_super_admin_credentials(
    *, identifier: str, password: str, recovery_email: str | None = None
) -> dict[str, object]:
    """Rotate the sole super-admin ID/password and revoke every active session."""
    identifier = identifier.strip()
    if not identifier or not password:
        raise ValueError("A super-admin ID and password are required.")
    with connect() as db:
        current = db.execute(
            "SELECT * FROM identities WHERE kind = 'super_admin' ORDER BY id LIMIT 1"
        ).fetchone()
        if not current:
            raise ValueError("No super-admin account exists.")
        try:
            db.execute(
                "UPDATE identities SET admin_id = ?, email = ?, password_hash = ?, recovery_email = ? WHERE id = ?",
                (
                    identifier,
                    f"{identifier.lower()}@super-admin.local",
                    hash_password(password),
                    recovery_email.strip().lower() if recovery_email else current["recovery_email"],
                    current["id"],
                ),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("That super-admin ID already exists.") from error
        db.execute(
            "UPDATE sessions SET revoked_at = ? WHERE identity_id = ? AND revoked_at IS NULL",
            (now(), current["id"]),
        )
        db.execute("DELETE FROM login_attempts WHERE key LIKE 'super_admin:%'")
        updated = db.execute("SELECT * FROM identities WHERE id = ?", (current["id"],)).fetchone()
        return _public(updated)


def set_super_admin_recovery_email(*, email: str) -> None:
    email = email.strip().lower()
    if "@" not in email or email.endswith("@super-admin.local"):
        raise ValueError("Enter a valid recovery email address.")
    with connect() as db:
        cursor = db.execute(
            "UPDATE identities SET recovery_email = ? WHERE kind = 'super_admin'",
            (email,),
        )
        if cursor.rowcount == 0:
            raise ValueError("No super-admin account exists.")


def create_organization_admin(
    *, organization_name: str, full_name: str, email: str,
    password: str, admin_id: str,
) -> dict[str, object]:
    organization_name = organization_name.strip()
    email = email.strip().lower()
    full_name = full_name.strip()
    admin_id = admin_id.strip()
    validate_email(email)
    if not all((organization_name, full_name, email, password, admin_id)):
        raise ValueError("All organization-admin fields are required.")
    with connect() as db:
        try:
            db.execute("INSERT OR IGNORE INTO organizations(name) VALUES (?)", (organization_name,))
            organization = db.execute(
                "SELECT id FROM organizations WHERE name = ?", (organization_name,)
            ).fetchone()
            cursor = db.execute(
                """INSERT INTO identities
                (kind, email, password_hash, full_name, admin_id, organization_id)
                VALUES ('organization_admin', ?, ?, ?, ?, ?)""",
                (email, hash_password(password), full_name, admin_id, organization["id"]),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("An account with those details already exists.") from error
        identity = db.execute("SELECT * FROM identities WHERE id = ?", (cursor.lastrowid,)).fetchone()
        result = _public(identity)
        result["organization_name"] = organization_name
        return result


def create_password_reset(*, identifier: str, kind: str) -> tuple[str, str] | None:
    if kind not in {"user", "organization_admin", "super_admin"}:
        raise ValueError("Unsupported account type.")
    identifier = identifier.strip()
    key = token_hash(f"{kind}:{identifier.lower()}")
    current_time = datetime.now(UTC)
    with connect() as db:
        db.execute(
            "DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL",
            (current_time.isoformat(),),
        )
        db.execute(
            "DELETE FROM password_reset_requests WHERE requested_at < ?",
            ((current_time - timedelta(days=1)).isoformat(),),
        )
        recent = db.execute(
            "SELECT requested_at FROM password_reset_requests WHERE key = ?", (key,)
        ).fetchone()
        if recent:
            last_requested = datetime.fromisoformat(recent["requested_at"])
            if (current_time - last_requested).total_seconds() < PASSWORD_RESET_COOLDOWN_SECONDS:
                return None
        db.execute(
            "INSERT INTO password_reset_requests(key, requested_at) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET requested_at = excluded.requested_at",
            (key, current_time.isoformat()),
        )
        column = "email" if kind == "user" else "admin_id"
        identity = db.execute(
            f"SELECT id, email, recovery_email FROM identities WHERE {column} = ? AND kind = ? AND is_active = 1",
            (identifier.lower() if kind == "user" else identifier, kind),
        ).fetchone()
        if not identity:
            return None
        recipient = identity["recovery_email"] if kind == "super_admin" else identity["email"]
        if not recipient or recipient.endswith("@super-admin.local"):
            return None
        token = new_token()
        expires = (current_time + timedelta(minutes=PASSWORD_RESET_MINUTES)).isoformat()
        db.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE identity_id = ? AND used_at IS NULL",
            (current_time.isoformat(), identity["id"]),
        )
        db.execute(
            "INSERT INTO password_reset_tokens(identity_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (identity["id"], token_hash(token), expires),
        )
        return token, recipient


def discard_password_reset(*, token: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM password_reset_tokens WHERE token_hash = ?", (token_hash(token),))


def reset_password(*, token: str, password: str, kind: str) -> bool:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        reset = db.execute(
            """SELECT r.id AS reset_id, i.id AS identity_id
            FROM password_reset_tokens r
            JOIN identities i ON i.id = r.identity_id
            WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?
                AND i.kind = ? AND i.is_active = 1""",
            (token_hash(token), now(), kind),
        ).fetchone()
        if not reset:
            return False
        password_hash = hash_password(password)
        timestamp = now()
        db.execute(
            "UPDATE identities SET password_hash = ? WHERE id = ?",
            (password_hash, reset["identity_id"]),
        )
        db.execute(
            "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
            (timestamp, reset["reset_id"]),
        )
        db.execute(
            "UPDATE sessions SET revoked_at = ? WHERE identity_id = ? AND revoked_at IS NULL",
            (timestamp, reset["identity_id"]),
        )
        return True


def login(*, identifier: str, password: str, kind: str) -> dict[str, object]:
    identifier = identifier.strip()
    key = f"{kind}:{identifier.lower()}"
    with connect() as db:
        attempt = db.execute("SELECT * FROM login_attempts WHERE key = ?", (key,)).fetchone()
        if attempt and attempt["locked_until"] and attempt["locked_until"] > now():
            raise PermissionError("Invalid login credentials.")
        column = "admin_id" if kind in {"organization_admin", "super_admin"} else "email"
        identity = db.execute(
            f"SELECT * FROM identities WHERE {column} = ? AND kind = ? AND is_active = 1",
            (identifier if column == "admin_id" else identifier.lower(), kind),
        ).fetchone()
        if not identity or not verify_password(password, identity["password_hash"]):
            failures = (attempt["failures"] if attempt else 0) + 1
            locked = (
                (datetime.now(UTC) + timedelta(minutes=LOCK_MINUTES)).isoformat()
                if failures >= MAX_LOGIN_FAILURES
                else None
            )
            db.execute(
                "INSERT INTO login_attempts(key, failures, locked_until) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET failures=excluded.failures, locked_until=excluded.locked_until",
                (key, failures, locked),
            )
            db.commit()
            raise PermissionError("Invalid login credentials.")
        db.execute("DELETE FROM login_attempts WHERE key = ?", (key,))
        raw_token = new_token()
        csrf_token = new_token()
        db.execute(
            "INSERT INTO sessions(identity_id, token_hash, csrf_token, expires_at) VALUES (?, ?, ?, ?)",
            (identity["id"], token_hash(raw_token), csrf_token, expires_at()),
        )
        return {"user": _public(identity), "token": raw_token, "csrf_token": csrf_token}


def authenticate(token: str | None, csrf_token: str | None = None, require_csrf: bool = False) -> dict[str, object]:
    if not token:
        raise PermissionError("Authentication required.")
    with connect() as db:
        identity = db.execute(
            """SELECT i.*, s.csrf_token, o.name AS organization_name FROM sessions s
            JOIN identities i ON i.id = s.identity_id
            LEFT JOIN organizations o ON i.organization_id = o.id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
            AND s.expires_at > ? AND i.is_active = 1""",
            (token_hash(token), now()),
        ).fetchone()
        if not identity:
            raise PermissionError("Authentication required.")
        if require_csrf and (
            not csrf_token
            or not secrets.compare_digest(identity["csrf_token"], csrf_token)
        ):
            raise CSRFError("CSRF validation failed.")
        return _public(identity)


def logout(token: str | None) -> None:
    if token:
        with connect() as db:
            db.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (now(), token_hash(token)))


E164_PHONE_REGEX = re.compile(r"^\+[1-9]\d{1,14}$")


def validate_phone_e164(phone_number: str) -> None:
    if not phone_number or not E164_PHONE_REGEX.match(phone_number.strip()):
        raise ValueError("Phone number must follow E.164 international format (e.g. +14155552671).")


def validate_date_of_birth(date_of_birth: str, min_age: int = 18) -> None:
    try:
        birth_date = datetime.strptime(date_of_birth.strip(), "%Y-%m-%d").date()
    except (ValueError, AttributeError) as error:
        raise ValueError("Date of birth must be a valid date in YYYY-MM-DD format.") from error

    today = date.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    if age < min_age:
        raise ValueError(f"User must be at least {min_age} years old.")


def register_user(
    *,
    full_name: str,
    email: str,
    password: str,
    date_of_birth: str,
    phone_number: str,
    organization_id: int | None = None,
    role: str = "user",
) -> dict[str, object]:
    email = email.strip().lower()
    full_name = full_name.strip()
    phone_number = phone_number.strip()
    date_of_birth = date_of_birth.strip()

    if not full_name or not email or not password:
        raise ValueError("All required fields must be provided.")

    validate_email(email)
    validate_phone_e164(phone_number)
    validate_date_of_birth(date_of_birth, min_age=18)

    if role not in ("user", "organization_admin", "super_admin"):
        raise ValueError(f"Invalid user role: {role}")

    with connect() as db:
        try:
            cursor = db.execute(
                """INSERT INTO identities
                (kind, email, password_hash, full_name, date_of_birth, phone_number, organization_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (role, email, hash_password(password), full_name, date_of_birth, phone_number, organization_id),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("An account with that email already exists.") from error
        
        row = db.execute("SELECT * FROM identities WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return {
            **_public(row),
            "date_of_birth": row["date_of_birth"],
            "phone_number": row["phone_number"],
            "created_at": row["created_at"],
        }


def get_user_profile(user_id: int) -> dict[str, object] | None:
    with connect() as db:
        row = db.execute(
            """SELECT i.*, o.name AS organization_name
            FROM identities i
            LEFT JOIN organizations o ON i.organization_id = o.id
            WHERE i.id = ? AND i.is_active = 1""",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return {
            **_public(row),
            "date_of_birth": row["date_of_birth"],
            "phone_number": row["phone_number"],
            "organization_name": row["organization_name"],
            "created_at": row["created_at"],
            "recovery_email": row["recovery_email"] if "recovery_email" in row.keys() else None,
        }


def update_user_profile(user_id: int, updates: dict[str, object]) -> dict[str, object]:
    with connect() as db:
        user_row = db.execute(
            """SELECT i.*, o.name AS organization_name
            FROM identities i
            LEFT JOIN organizations o ON i.organization_id = o.id
            WHERE i.id = ? AND i.is_active = 1""",
            (user_id,),
        ).fetchone()
        if not user_row:
            raise ValueError("User not found.")

        identity_updates: dict[str, object] = {}

        # 1. full_name
        if "full_name" in updates and updates["full_name"] is not None:
            clean_name = str(updates["full_name"]).strip()
            if not clean_name:
                raise ValueError("Full name cannot be empty.")
            identity_updates["full_name"] = clean_name

        # 2. email
        if "email" in updates and updates["email"] is not None:
            clean_email = str(updates["email"]).strip().lower()
            validate_email(clean_email)
            dup = db.execute(
                "SELECT id FROM identities WHERE lower(email) = ? AND id != ?",
                (clean_email, user_id),
            ).fetchone()
            if dup:
                raise ValueError("An account with that email address already exists.")
            identity_updates["email"] = clean_email

        # 3. phone_number
        if "phone_number" in updates and updates["phone_number"] is not None:
            clean_phone = str(updates["phone_number"]).strip()
            validate_phone_e164(clean_phone)
            identity_updates["phone_number"] = clean_phone

        # 4. date_of_birth
        if "date_of_birth" in updates and updates["date_of_birth"] is not None:
            clean_dob = str(updates["date_of_birth"]).strip()
            validate_date_of_birth(clean_dob, min_age=18)
            identity_updates["date_of_birth"] = clean_dob

        # 5. recovery_email (for super admin)
        if "recovery_email" in updates and updates["recovery_email"] is not None:
            clean_rec = str(updates["recovery_email"]).strip().lower()
            validate_email(clean_rec)
            identity_updates["recovery_email"] = clean_rec

        # 6. organization_name (for organization admin or assigned accounts)
        if "organization_name" in updates and updates["organization_name"] is not None:
            clean_org = str(updates["organization_name"]).strip()
            if not clean_org:
                raise ValueError("Organization name cannot be empty.")
            org_id = user_row["organization_id"]
            if not org_id:
                raise ValueError("Account is not associated with an organization.")
            dup_org = db.execute(
                "SELECT id FROM organizations WHERE lower(name) = ? AND id != ?",
                (clean_org.lower(), org_id),
            ).fetchone()
            if dup_org:
                raise ValueError("An organization with that name already exists.")
            db.execute("UPDATE organizations SET name = ? WHERE id = ?", (clean_org, org_id))

        # Apply identity columns update if any
        if identity_updates:
            set_clauses = [f"{col} = ?" for col in identity_updates.keys()]
            values = list(identity_updates.values())
            values.append(user_id)
            db.execute(
                f"UPDATE identities SET {', '.join(set_clauses)} WHERE id = ? AND is_active = 1",
                values,
            )

        db.commit()

    return get_user_profile(user_id) or {}


def change_password(
    *,
    identity_id: int,
    current_password: str,
    new_password: str,
) -> bool:
    if not current_password or not new_password:
        raise ValueError("Both current password and new password are required.")

    if len(new_password) < 8:
        raise ValueError("New password must be at least 8 characters long.")

    if current_password == new_password:
        raise ValueError("New password must be different from current password.")

    with connect() as db:
        identity = db.execute(
            "SELECT id, password_hash FROM identities WHERE id = ? AND is_active = 1",
            (identity_id,),
        ).fetchone()
        if not identity:
            raise ValueError("Account not found.")

        if not verify_password(current_password, identity["password_hash"]):
            raise ValueError("The current password provided is incorrect.")

        new_hash = hash_password(new_password)
        db.execute(
            "UPDATE identities SET password_hash = ? WHERE id = ?",
            (new_hash, identity_id),
        )
        db.commit()
        return True
