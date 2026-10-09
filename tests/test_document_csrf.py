"""Integration tests verifying CSRF validation and authentication across document and voice endpoints."""

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

    def test_voice_endpoints_csrf_enforcement(self):
        stok, csrf = _auth_session()
        client.cookies.clear()
        client.cookies.set("session_token", stok)

        # Transcribe without CSRF -> 403
        resp_tx_no_csrf = client.post(
            "/transcribe",
            files={"file": ("sample.webm", b"audio-data", "audio/webm")},
        )
        assert resp_tx_no_csrf.status_code == 403

        # Transcribe with valid CSRF -> 200 OK
        with patch("ai_filler.main.transcribe_audio", return_value="Transcribed voice text"):
            resp_tx_ok = client.post(
                "/transcribe",
                headers={"X-CSRF-Token": csrf},
                files={"file": ("sample.webm", b"audio-data", "audio/webm")},
            )
            assert resp_tx_ok.status_code == 200
            assert resp_tx_ok.json()["text"] == "Transcribed voice text"

        # Format-application without CSRF -> 403
        resp_fmt_no_csrf = client.post(
            "/format-application",
            json={"transcript": "Candidate bio details"},
        )
        assert resp_fmt_no_csrf.status_code == 403

        # Format-application with valid CSRF -> 200 OK
        with patch("ai_filler.main.create_application", return_value={"full_name": "Jane Doe"}):
            resp_fmt_ok = client.post(
                "/format-application",
                headers={"X-CSRF-Token": csrf},
                json={"transcript": "Candidate bio details"},
            )
            assert resp_fmt_ok.status_code == 200
            assert resp_fmt_ok.json()["application"]["full_name"] == "Jane Doe"
