"""Integration tests verifying CSRF validation and authentication across document endpoints."""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from ai_filler.main import app
from tests.test_security_comprehensive import _auth_session

client = TestClient(app)


class TestCsrfProtectionEndpoints:
    """Verifies that all state-changing endpoints strictly enforce CSRF on browser sessions."""

    def test_extract_document_csrf_enforcement(self):
        stok, csrf = _auth_session()
        client.cookies.clear()
        client.cookies.set("session_token", stok)

        # 1. Missing CSRF header -> 403 Forbidden
        resp_no_csrf = client.post(
            "/extract-document",
            files={"files": ("doc.txt", b"Content text", "text/plain")},
        )
        assert resp_no_csrf.status_code == 403
        assert "CSRF" in resp_no_csrf.json()["detail"]

        # 2. Tampered / invalid CSRF header -> 403 Forbidden
        resp_bad_csrf = client.post(
            "/extract-document",
            headers={"X-CSRF-Token": "invalid_token_123"},
            files={"files": ("doc.txt", b"Content text", "text/plain")},
        )
        assert resp_bad_csrf.status_code == 403
        assert "CSRF" in resp_bad_csrf.json()["detail"]

        # 3. Valid CSRF header -> 200 OK (with document processing mocked)
        with patch(
            "ai_filler.main.process_documents",
            return_value={
                "files": ["doc.txt"],
                "extracted_text": "Content text",
                "organized_text": "Organized Content text",
            },
        ):
            resp_valid_csrf = client.post(
                "/extract-document",
                headers={"X-CSRF-Token": csrf},
                files={"files": ("doc.txt", b"Content text", "text/plain")},
            )
            assert resp_valid_csrf.status_code == 200
            data = resp_valid_csrf.json()
            assert data["files"] == ["doc.txt"]
            assert data["extracted_text"] == "Content text"
            assert data["organized_text"] == "Organized Content text"

    def test_voice_and_transcript_endpoints_are_removed(self):
        route_paths = {route.path for route in app.routes}
        removed_routes = {
            "/transcribe",
            "/format-application",
            "/ai/fill-form/voice",
            "/ai/generate-form/voice",
            "/ai/voice-interview/questions",
        }
        assert route_paths.isdisjoint(removed_routes)


class TestCorsAndCookieSecurity:
    """Verifies that CORS correctly handles dynamic origins and cookie security flags."""

    def test_cors_dynamic_origin_regex(self):
        # Localhost on any port
        resp1 = client.options(
            "/auth/signup",
            headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "POST"},
        )
        assert resp1.headers.get("access-control-allow-origin") == "http://localhost:5174"

        # 127.0.0.1 on any port
        resp2 = client.options(
            "/auth/signup",
            headers={"Origin": "http://127.0.0.1:3000", "Access-Control-Request-Method": "POST"},
        )
        assert resp2.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"

        # Unauthorized third-party origin
        resp_unauth = client.options(
            "/auth/signup",
            headers={"Origin": "https://unauthorized-domain.com", "Access-Control-Request-Method": "POST"},
        )
        assert resp_unauth.headers.get("access-control-allow-origin") is None

    def test_cookie_samesite_and_secure_flags(self, monkeypatch):
        # Test explicit samesite configuration
        monkeypatch.setenv("AI_FILLER_COOKIE_SAMESITE", "lax")
        monkeypatch.setenv("AI_FILLER_COOKIE_SECURE", "false")
        client.post(
            "/auth/signup",
            json={
                "full_name": "Bob",
                "email": "bob@example.com",
                "password": "Password123",
                "date_of_birth": "1990-01-01",
                "phone_number": "1234567890",
            },
        )
        resp = client.post(
            "/auth/user/login",
            json={"identifier": "bob@example.com", "password": "Password123"},
        )
        assert resp.status_code == 200
        set_cookies = resp.headers.get_list("set-cookie")
        assert any("samesite=lax" in c.lower() for c in set_cookies)
        assert not any("; secure" in c.lower() for c in set_cookies)
