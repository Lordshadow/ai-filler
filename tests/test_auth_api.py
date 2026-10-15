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

    def test_bearer_sessions_keep_roles_isolated_and_logout_only_revokes_current_token(self):
        """Tab-scoped bearer sessions must win over the shared browser cookie."""
        from ai_filler.auth.service import create_organization_admin, create_super_admin

        suffix = __import__("secrets").token_hex(4)
        create_organization_admin(
            organization_name=f"Tab Isolation {suffix}",
            full_name="Tab Admin",
            email=f"tab-admin-{suffix}@example.com",
            password="AdminPass456!",
            admin_id=f"ADM-TAB-{suffix.upper()}",
        )
        create_super_admin(identifier=f"super-tab-{suffix}", password="SuperPass456!")
        tab_client = TestClient(app)

        admin_login = tab_client.post("/auth/admin/login", json={
            "identifier": f"ADM-TAB-{suffix.upper()}", "password": "AdminPass456!",
        })
        super_login = tab_client.post("/auth/super/login", json={
            "identifier": f"super-tab-{suffix}", "password": "SuperPass456!",
        })
        assert admin_login.status_code == super_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        super_token = super_login.json()["access_token"]

        admin_me = tab_client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        super_me = tab_client.get("/auth/me", headers={"Authorization": f"Bearer {super_token}"})
        assert admin_me.json()["user"]["kind"] == "organization_admin"
        assert super_me.json()["user"]["kind"] == "super_admin"

        logout_response = tab_client.post(
            "/auth/logout", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert logout_response.status_code == 200
        assert tab_client.get("/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        }).status_code == 401
        assert tab_client.get("/auth/me", headers={
            "Authorization": f"Bearer {super_token}"
        }).json()["user"]["kind"] == "super_admin"


class TestAdministrativeAuth:
    """Test administrative login by both admin_id and email, and directory listing."""

    def test_super_admin_login_by_id_and_email(self):
        from ai_filler.auth.service import create_super_admin

        create_super_admin(identifier="Shadow", password="SuperPassword123!")

        super_client = TestClient(app)
        # Login by admin_id
        resp1 = super_client.post(
            "/auth/super/login",
            json={"identifier": "Shadow", "password": "SuperPassword123!"},
        )
        assert resp1.status_code == 200
        assert resp1.json()["user"]["kind"] == "super_admin"

        # Login by email
        resp2 = super_client.post(
            "/auth/super/login",
            json={"identifier": "shadow@super-admin.local", "password": "SuperPassword123!"},
        )
        assert resp2.status_code == 200
        assert resp2.json()["user"]["kind"] == "super_admin"

        # List organizations and organization admins as super admin
        csrf = resp2.cookies.get("csrf_token")
        orgs_resp = super_client.get("/organizations", headers={"X-CSRF-Token": csrf})
        assert orgs_resp.status_code == 200
        assert "organizations" in orgs_resp.json()

        admins_resp = super_client.get("/auth/super/organization-admins", headers={"X-CSRF-Token": csrf})
        assert admins_resp.status_code == 200
        assert "admins" in admins_resp.json()

    def test_org_admin_login_by_email_and_admin_id(self):
        from ai_filler.auth.service import create_organization_admin

        create_organization_admin(
            organization_name="Techjays Test",
            full_name="Saravanan Test",
            email="saravanan_test@techjays.com",
            password="AdminPassword123!",
            admin_id="ADM-TEST999",
        )

        admin_client = TestClient(app)
        # Login using email instead of admin_id
        resp_email = admin_client.post(
            "/auth/admin/login",
            json={"identifier": "saravanan_test@techjays.com", "password": "AdminPassword123!"},
        )
        assert resp_email.status_code == 200
        assert resp_email.json()["user"]["kind"] == "organization_admin"
        assert resp_email.json()["user"]["email"] == "saravanan_test@techjays.com"

        # Login using admin_id
        resp_id = admin_client.post(
            "/auth/admin/login",
            json={"identifier": "ADM-TEST999", "password": "AdminPassword123!"},
        )
        assert resp_id.status_code == 200
        assert resp_id.json()["user"]["kind"] == "organization_admin"
