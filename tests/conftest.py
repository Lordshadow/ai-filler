from pathlib import Path

import pytest

import ai_filler.auth.db as auth_db


@pytest.fixture(autouse=True)
def isolated_auth_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Give every test a private SQLite database and local HTTP cookies."""
    monkeypatch.setattr(auth_db, "DATABASE_PATH", tmp_path / "app.db")
    monkeypatch.setenv("AI_FILLER_COOKIE_SECURE", "false")
