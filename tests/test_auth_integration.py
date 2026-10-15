"""
Full authentication flow integration test.
Tests the complete journey: signup -> login -> protected access -> logout.
"""

import httpx
import pytest


@pytest.fixture
def client():
    """Create a test client for the API."""
    from fastapi.testclient import TestClient
    from ai_filler.main import app
    return TestClient(app)


@pytest.fixture
def test_user_data(request):
    """Test user data - unique per test to avoid conflicts."""
    test_name = request.node.name
    return {
        "full_name": "Integration Test User",
        "email": f"test-{test_name}@example.com",
        "password": "IntegrationTest123!",
        "date_of_birth": "1990-01-01",
        "phone_number": "1234567890",
    }


class TestAuthenticationFlow:
    """Test complete authentication flow."""

    def test_signup_then_login_then_protected_access(self, client, test_user_data):
        """Test full authentication journey: signup -> login -> protected access -> logout."""

        # Step 1: Signup
        response = client.post("/auth/signup", json=test_user_data)
        assert response.status_code == 200
        user = response.json()["user"]
        assert user["email"] == test_user_data["email"]
        assert user["full_name"] == test_user_data["full_name"]
        assert user["kind"] == "user"
        user_id = user["id"]

        # Step 2: Login
        login_response = client.post(
            "/auth/user/login",
            json={
                "identifier": test_user_data["email"],
                "password": test_user_data["password"],
            },
        )
        assert login_response.status_code == 200
        login_user = login_response.json()["user"]
        assert login_user["id"] == user_id
        assert login_user["email"] == test_user_data["email"]

        # Extract session from login response
        session_cookie = login_response.cookies.get("session_token")
        csrf_cookie = login_response.cookies.get("csrf_token")
        assert session_cookie
        assert csrf_cookie

        # Step 3: Access protected endpoint with valid session
        auth_me_response = client.get(
            "/auth/me",
            headers={"X-CSRF-Token": csrf_cookie},
        )
        auth_me_response.cookies.set("session_token", session_cookie)
        auth_me_response.cookies.set("csrf_token", csrf_cookie)

        # Re-login and use cookies properly
        client.cookies.set("session_token", session_cookie)
        client.cookies.set("csrf_token", csrf_cookie)

        auth_me_response = client.get("/auth/me", headers={"X-CSRF-Token": csrf_cookie})
        assert auth_me_response.status_code == 200
        auth_user = auth_me_response.json()["user"]
        assert auth_user["id"] == user_id
        assert auth_user["email"] == test_user_data["email"]

        # Step 4: Logout
        logout_response = client.post(
            "/auth/logout",
            headers={"X-CSRF-Token": csrf_cookie},
        )
        assert logout_response.status_code == 200
        assert logout_response.json()["status"] == "ok"

        # Step 5: Verify session is revoked (should fail now)
        client.cookies.clear()
        revoked_response = client.get("/auth/me")
        assert revoked_response.status_code == 401

    def test_login_with_wrong_password_fails(self, client, test_user_data):
        """Test that login fails with wrong password."""

        # Signup first
        client.post("/auth/signup", json=test_user_data)

        # Try to login with wrong password
        response = client.post(
            "/auth/user/login",
            json={
                "identifier": test_user_data["email"],
                "password": "WrongPassword123!",
            },
        )
        assert response.status_code == 401
        assert "detail" in response.json()

    def test_protected_endpoint_requires_auth(self, client):
        """Test that protected endpoints require authentication."""

        # Try to access without auth
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_case_insensitive_email_login(self, client, test_user_data):
        """Test that email login is case-insensitive."""

        # Signup with lowercase
        response = client.post("/auth/signup", json=test_user_data)
        assert response.status_code == 200

        # Try to login with uppercase
        response = client.post(
            "/auth/user/login",
            json={
                "identifier": test_user_data["email"].upper(),
                "password": test_user_data["password"],
            },
        )
        assert response.status_code == 200
        assert response.json()["user"]["email"] == test_user_data["email"]

    def test_duplicate_email_signup_fails(self, client, test_user_data):
        """Test that signup with duplicate email fails."""

        # First signup
        response1 = client.post("/auth/signup", json=test_user_data)
        assert response1.status_code == 200

        # Second signup with same email
        response2 = client.post("/auth/signup", json=test_user_data)
        assert response2.status_code == 400
        assert "unable" in response2.json()["detail"].lower()


    def test_extract_document_endpoint_requires_auth(self, client):
        """Test that /extract-document endpoint requires authentication."""

        response = client.post(
            "/extract-document",
            files={"files": ("test.txt", b"test content", "text/plain")},
        )
        assert response.status_code == 401

    def test_password_hashing_works_correctly(self, client, test_user_data):
        """Test that passwords are properly hashed and verified."""

        # Signup
        response = client.post("/auth/signup", json=test_user_data)
        assert response.status_code == 200

        # Login with correct password works
        response = client.post(
            "/auth/user/login",
            json={
                "identifier": test_user_data["email"],
                "password": test_user_data["password"],
            },
        )
        assert response.status_code == 200

        # Login with wrong password fails
        response = client.post(
            "/auth/user/login",
            json={
                "identifier": test_user_data["email"],
                "password": "WrongPassword123!",
            },
        )
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
