"""Comprehensive security test suite for authentication."""

import os
import sqlite3
from pathlib import Path

import pytest

from ai_filler.auth.db import connect
from ai_filler.auth.security import (
    hash_password,
    new_token,
    token_hash,
    verify_password,
)
from ai_filler.auth.service import authenticate, login, logout, signup


class TestPasswordSecurity:
    """Test password hashing security."""

    def test_password_hash_not_reversible(self):
        """Password hashes must not be reversible."""
        raw = "TestPassword123"
        hashed = hash_password(raw)
        assert hashed != raw
        assert "TestPassword123" not in hashed

    def test_password_hash_salted(self):
        """Different password hashes for same input must be different."""
        raw = "TestPassword123"
        hash1 = hash_password(raw)
        hash2 = hash_password(raw)
        assert hash1 != hash2

    def test_password_verify_correct(self):
        """Correct password must verify."""
        raw = "TestPassword123"
        hashed = hash_password(raw)
        assert verify_password(raw, hashed)

    def test_password_verify_incorrect(self):
        """Incorrect password must fail."""
        hashed = hash_password("TestPassword123")
        assert not verify_password("WrongPassword123", hashed)

    def test_password_too_short(self):
        """Passwords shorter than 8 characters must be rejected."""
        with pytest.raises(ValueError, match="at least 8 characters"):
            hash_password("Short1")


class TestSessionTokenSecurity:
    """Test session token generation and hashing."""

    def test_token_is_random(self):
        """Tokens must be cryptographically random."""
        token1 = new_token()
        token2 = new_token()
        assert token1 != token2
        assert len(token1) > 0

    def test_token_hash_consistent(self):
        """Same token must hash consistently."""
        token = new_token()
        hash1 = token_hash(token)
        hash2 = token_hash(token)
        assert hash1 == hash2

    def test_token_hash_not_reversible(self):
        """Token hash must not be reversible to token."""
        token = new_token()
        hashed = token_hash(token)
        assert token not in hashed
        assert hashed != token


class TestSignup:
    """Test user signup."""

    def test_signup_creates_user(self):
        """Signup must create a user."""
        result = signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        assert result["kind"] == "user"
        assert result["email"].lower() == "alice@example.com"

    def test_signup_email_normalized(self):
        """Email must be normalized to lowercase."""
        result = signup(
            full_name="Alice",
            email="Alice@Example.COM",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        assert result["email"] == "alice@example.com"

    def test_signup_duplicate_email_fails(self):
        """Duplicate emails must be rejected."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        with pytest.raises(ValueError, match="Unable to create account"):
            signup(
                full_name="Alice2",
                email="alice@example.com",
                password="SecurePass123",
                date_of_birth="1990-01-02",
                phone_number="1234567890",
            )

    def test_signup_case_insensitive_duplicate(self):
        """Duplicate check must be case-insensitive."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        with pytest.raises(ValueError, match="Unable to create account"):
            signup(
                full_name="Alice2",
                email="ALICE@EXAMPLE.COM",
                password="SecurePass123",
                date_of_birth="1990-01-02",
                phone_number="1234567890",
            )

    def test_signup_missing_fields(self):
        """Missing required fields must be rejected."""
        with pytest.raises(ValueError, match="All required fields"):
            signup(
                full_name="",
                email="alice@example.com",
                password="SecurePass123",
                date_of_birth="1990-01-01",
                phone_number="1234567890",
            )


class TestLogin:
    """Test user and admin login."""

    def test_user_login_success(self):
        """User login with correct credentials must succeed."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        result = login(
            identifier="alice@example.com",
            password="SecurePass123",
            kind="user",
        )
        assert result["user"]["email"] == "alice@example.com"
        assert "token" in result
        assert "csrf_token" in result

    def test_login_case_insensitive_email(self):
        """Login with different case email must succeed."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        result = login(
            identifier="ALICE@EXAMPLE.COM",
            password="SecurePass123",
            kind="user",
        )
        assert result["user"]["email"] == "alice@example.com"

    def test_login_wrong_password(self):
        """Login with wrong password must fail."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        with pytest.raises(PermissionError, match="Invalid login credentials"):
            login(
                identifier="alice@example.com",
                password="WrongPassword123",
                kind="user",
            )

    def test_login_nonexistent_user(self):
        """Login with nonexistent user must fail."""
        with pytest.raises(PermissionError, match="Invalid login credentials"):
            login(
                identifier="nonexistent@example.com",
                password="SecurePass123",
                kind="user",
            )

    def test_login_generic_error(self):
        """Login errors must be generic and not reveal whether email exists."""
        with pytest.raises(PermissionError) as exc1:
            login(
                identifier="nonexistent@example.com",
                password="SecurePass123",
                kind="user",
            )
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        with pytest.raises(PermissionError) as exc2:
            login(
                identifier="alice@example.com",
                password="WrongPassword123",
                kind="user",
            )
        assert str(exc1.value) == str(exc2.value)


class TestBruteForceProtection:
    """Test brute-force attack resistance."""

    def test_login_failures_increment(self):
        """Failed logins must increment the failure counter."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        for _ in range(3):
            with pytest.raises(PermissionError):
                login(
                    identifier="alice@example.com",
                    password="WrongPassword",
                    kind="user",
                )

    def test_login_lockout_after_max_failures(self):
        """Lockout must occur after max failed attempts."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        for _ in range(5):
            with pytest.raises(PermissionError):
                login(
                    identifier="alice@example.com",
                    password="WrongPassword",
                    kind="user",
                )
        with pytest.raises(PermissionError, match="Invalid login credentials"):
            login(
                identifier="alice@example.com",
                password="SecurePass123",
                kind="user",
            )

    def test_successful_login_clears_failures(self):
        """Successful login must clear failed attempt counter."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        with pytest.raises(PermissionError):
            login(
                identifier="alice@example.com",
                password="WrongPassword",
                kind="user",
            )
        result = login(
            identifier="alice@example.com",
            password="SecurePass123",
            kind="user",
        )
        assert result["user"]["email"] == "alice@example.com"


class TestSessionAuthentication:
    """Test session authentication and revocation."""

    def test_authenticate_with_valid_token(self):
        """Valid token must authenticate successfully."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        login_result = login(
            identifier="alice@example.com",
            password="SecurePass123",
            kind="user",
        )
        user = authenticate(login_result["token"])
        assert user["email"] == "alice@example.com"

    def test_authenticate_with_invalid_token(self):
        """Invalid token must fail."""
        with pytest.raises(PermissionError, match="Authentication required"):
            authenticate("invalid_token_12345")

    def test_authenticate_without_token(self):
        """Missing token must fail."""
        with pytest.raises(PermissionError, match="Authentication required"):
            authenticate(None)

    def test_logout_revokes_token(self):
        """Logout must revoke the token."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        login_result = login(
            identifier="alice@example.com",
            password="SecurePass123",
            kind="user",
        )
        token = login_result["token"]
        logout(token)
        with pytest.raises(PermissionError, match="Authentication required"):
            authenticate(token)

    def test_disabled_identity_cannot_authenticate(self):
        """Disabled identity must not authenticate."""
        signup(
            full_name="Alice",
            email="alice@example.com",
            password="SecurePass123",
            date_of_birth="1990-01-01",
            phone_number="1234567890",
        )
        login_result = login(
            identifier="alice@example.com",
            password="SecurePass123",
            kind="user",
        )
        with connect() as db:
            db.execute("UPDATE identities SET is_active = 0 WHERE email = ?", ("alice@example.com",))
        with pytest.raises(PermissionError, match="Authentication required"):
            authenticate(login_result["token"])
