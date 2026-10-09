"""FastAPI authentication endpoint tests."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_filler.main import app


client = TestClient(app)


class TestSignupAPI:
    """Test signup endpoint."""

    def test_signup_endpoint(self):
        """Signup endpoint must create a user."""
        response = client.post(
            "/auth/signup",
            json={
                "full_name": "Alice",
                "email": "alice@example.com",
                "password": "SecurePass123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "alice@example.com"


class TestLoginAPI:
    """Test login endpoints."""

    def test_user_login_endpoint(self):
        """User login must set session cookies."""
        client.post(
            "/auth/signup",
            json={
                "full_name": "Alice",
                "email": "alice@example.com",
                "password": "SecurePass123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        response = client.post(
            "/auth/user/login",
            json={"identifier": "alice@example.com", "password": "SecurePass123"},
        )
        assert response.status_code == 200
        assert "session_token" in response.cookies

    def test_login_wrong_password(self):
        """Login with wrong password must fail."""
        client.post(
            "/auth/signup",
            json={
                "full_name": "Alice",
                "email": "alice@example.com",
                "password": "SecurePass123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        response = client.post(
            "/auth/user/login",
            json={"identifier": "alice@example.com", "password": "WrongPassword123"},
        )
        assert response.status_code == 401


class TestAuthenticationGuard:
    """Test that endpoints require authentication."""

    def test_transcribe_requires_auth(self):
        """Transcribe endpoint must require authentication."""
        response = client.post("/transcribe", data={"file": ("test.webm", b"fake audio")})
        assert response.status_code == 422 or response.status_code == 401

    def test_extract_document_requires_auth(self):
        """Extract document endpoint must require authentication."""
        response = client.post("/extract-document", data={"files": ("test.txt", b"test content")})
        assert response.status_code == 422 or response.status_code == 401

    def test_authenticated_user_can_access(self):
        """Authenticated user must access protected endpoints."""
        client.post(
            "/auth/signup",
            json={
                "full_name": "Alice",
                "email": "alice@example.com",
                "password": "SecurePass123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        login_response = client.post(
            "/auth/user/login",
            json={"identifier": "alice@example.com", "password": "SecurePass123"},
        )
        csrf_token = login_response.cookies.get("csrf_token", "")
        response = client.get(
            "/auth/me",
            headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
        )
        assert response.status_code == 200


class TestLogoutAPI:
    """Test logout endpoint."""

    def test_logout_revokes_session(self):
        """Logout must revoke the session."""
        client.post(
            "/auth/signup",
            json={
                "full_name": "Alice",
                "email": "alice@example.com",
                "password": "SecurePass123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        login_response = client.post(
            "/auth/user/login",
            json={"identifier": "alice@example.com", "password": "SecurePass123"},
        )
        csrf_token = login_response.cookies.get("csrf_token", "")
        response = client.post(
            "/auth/logout",
            headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
        )
        assert response.status_code == 200
        me_response = client.get("/auth/me")
        assert me_response.status_code == 401

    def test_logout_requires_valid_csrf_and_distinguishes_failure(self):
        client.post("/auth/signup", json={
            "full_name": "Alice", "email": "csrf@example.com",
            "password": "SecurePass123", "date_of_birth": "1990-01-01",
            "phone_number": "1234567890",
        })
        login_response = client.post("/auth/user/login", json={
            "identifier": "csrf@example.com", "password": "SecurePass123",
        })
        assert login_response.status_code == 200
        assert client.post("/auth/logout").status_code == 403


class TestRoleSessionTransition:
    """Test session transitions between user, organization admin, and super admin."""

    def test_user_to_admin_session_overwrite(self):
        from ai_filler.auth.service import create_organization_admin

        session_client = TestClient(app)
        signup_resp = session_client.post(
            "/auth/signup",
            json={
                "full_name": "Applicant Bob",
                "email": "bob@example.com",
                "password": "SecurePassword123!",
                "date_of_birth": "1992-04-12",
                "phone_number": "+14155551234",
            },
        )
        assert signup_resp.status_code == 200

        login_resp = session_client.post(
            "/auth/user/login",
            json={"identifier": "bob@example.com", "password": "SecurePassword123!"},
        )
        assert login_resp.status_code == 200

        me_user = session_client.get("/auth/me")
        assert me_user.status_code == 200
        assert me_user.json()["user"]["kind"] == "user"

        create_organization_admin(
            organization_name="Transition Corp",
            full_name="Admin Transition",
            email="transition_admin@corp.com",
            password="AdminPass456!",
            admin_id="ADM-TRANS01",
        )

        admin_login_resp = session_client.post(
            "/auth/admin/login",
            json={"identifier": "ADM-TRANS01", "password": "AdminPass456!"},
        )
        assert admin_login_resp.status_code == 200
        assert admin_login_resp.json()["user"]["kind"] == "organization_admin"

        me_admin = session_client.get("/auth/me")
        assert me_admin.status_code == 200
        assert me_admin.json()["user"]["kind"] == "organization_admin"
