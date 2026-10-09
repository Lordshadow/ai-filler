from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()
SESSION_DAYS = 7
MAX_LOGIN_FAILURES = 5
LOCK_MINUTES = 15


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def expires_at() -> str:
    return (datetime.now(UTC) + timedelta(days=SESSION_DAYS)).isoformat()


def now() -> str:
    return datetime.now(UTC).isoformat()
