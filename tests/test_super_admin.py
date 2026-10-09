import pytest
from fastapi import HTTPException

from ai_filler.auth.dependencies import current_super_admin
from ai_filler.auth.db import connect
from ai_filler.auth.service import (
    authenticate,
    create_organization_admin,
    create_super_admin,
    login,
    update_super_admin_credentials,
)


def test_bootstrap_super_admin_can_authenticate_by_id():
    identity = create_super_admin(identifier="shadow", password="Shadow07")
    assert identity["kind"] == "super_admin"
    assert identity["admin_id"] == "shadow"

    result = login(identifier="shadow", password="Shadow07", kind="super_admin")
    assert result["user"]["kind"] == "super_admin"
    assert result["user"]["admin_id"] == "shadow"

    with connect() as db:
        row = db.execute("SELECT password_hash FROM identities WHERE kind = 'super_admin'").fetchone()
    assert row["password_hash"] != "Shadow07"


def test_bootstrap_refuses_to_create_a_second_super_admin():
    create_super_admin(identifier="shadow", password="Shadow07")
    with pytest.raises(ValueError, match="already exists"):
        create_super_admin(identifier="another", password="Another07")


def test_credential_rotation_changes_login_and_revokes_existing_session():
    create_super_admin(identifier="shadwo", password="Shadow07")
    old_session = login(identifier="shadwo", password="Shadow07", kind="super_admin")
    update_super_admin_credentials(identifier="Shadow", password="Shadow07")

    with pytest.raises(PermissionError):
        authenticate(old_session["token"])
    assert login(identifier="Shadow", password="Shadow07", kind="super_admin")["user"]["admin_id"] == "Shadow"
    with pytest.raises(PermissionError):
        login(identifier="shadwo", password="Shadow07", kind="super_admin")


def test_only_super_admin_identity_passes_creation_guard():
    assert current_super_admin({"kind": "super_admin"})["kind"] == "super_admin"
    with pytest.raises(HTTPException) as error:
        current_super_admin({"kind": "organization_admin"})
    assert error.value.status_code == 403


def test_organization_admin_is_created_with_organization_and_admin_id():
    create_super_admin(identifier="shadow", password="Shadow07")
    admin = create_organization_admin(
        organization_name="Example Org",
        full_name="Org Admin",
        email="admin@example.org",
        password="AdminPass07",
        admin_id="ADM-EXAMPLE",
    )
    assert admin["kind"] == "organization_admin"
    assert admin["organization_name"] == "Example Org"
    assert admin["admin_id"] == "ADM-EXAMPLE"
    assert login(identifier="ADM-EXAMPLE", password="AdminPass07", kind="organization_admin")["user"] == {
        "id": admin["id"], "kind": "organization_admin", "email": "admin@example.org",
        "full_name": "Org Admin", "admin_id": "ADM-EXAMPLE", "organization_id": admin["organization_id"],
    }
