import pytest

from ai_filler.auth.service import (
    create_password_reset,
    create_super_admin,
    login,
    reset_password,
    signup,
)


def test_user_reset_is_single_use_and_revokes_sessions():
    signup(
        full_name="Test User",
        email="reset@example.org",
        password="Original07",
        date_of_birth="1990-01-01",
        phone_number="1234567890",
    )
    session = login(identifier="reset@example.org", password="Original07", kind="user")
    token, recipient = create_password_reset(identifier="reset@example.org", kind="user")
    assert recipient == "reset@example.org"
    assert reset_password(token=token, password="Replacement07", kind="user")
    assert not reset_password(token=token, password="Replacement07", kind="user")

    with pytest.raises(PermissionError):
        login(identifier="reset@example.org", password="Original07", kind="user")
    assert login(identifier="reset@example.org", password="Replacement07", kind="user")["user"]["email"] == "reset@example.org"

    from ai_filler.auth.service import authenticate
    with pytest.raises(PermissionError):
        authenticate(session["token"])


def test_reset_token_cannot_be_used_for_another_role():
    create_super_admin(identifier="root", password="RootPass07", recovery_email="root@example.org")
    token, _recipient = create_password_reset(identifier="root", kind="super_admin")
    assert not reset_password(token=token, password="Replacement07", kind="organization_admin")
    assert reset_password(token=token, password="Replacement07", kind="super_admin")


def test_super_admin_reset_requires_configured_recovery_address():
    create_super_admin(identifier="root", password="RootPass07")
    assert create_password_reset(identifier="root", kind="super_admin") is None


def test_super_admin_reset_uses_the_configured_recovery_address():
    create_super_admin(identifier="root", password="RootPass07", recovery_email="root@example.org")
    reset = create_password_reset(identifier="root", kind="super_admin")
    assert reset is not None
    assert reset[1] == "root@example.org"
