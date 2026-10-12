from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

from ai_filler.auth.db import connect

SUPPORTED_FIELD_TYPES = {"text", "email", "number", "date", "dropdown", "multiselect", "file"}
SAFE_FIELD_KEY_REGEX = re.compile(r"^[a-zA-Z0-9_]{2,64}$")
DEFAULT_EMAIL_REGEX = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"


def validate_field_definition(field: dict[str, Any]) -> dict[str, Any]:
    field_key = field.get("fieldKey") or field.get("field_key")
    if not field_key or not isinstance(field_key, str) or not SAFE_FIELD_KEY_REGEX.match(field_key):
        raise ValueError(f"Invalid or missing fieldKey: '{field_key}'. Must be 2-64 alphanumeric/underscore characters.")

    field_type = field.get("type")
    if field_type not in SUPPORTED_FIELD_TYPES:
        raise ValueError(f"Invalid field type: '{field_type}'. Supported: {', '.join(sorted(SUPPORTED_FIELD_TYPES))}")

    label = field.get("label")
    if not label or not isinstance(label, str):
        raise ValueError(f"Field '{field_key}' must have a valid string label.")

    required = bool(field.get("required", False))
    validation = field.get("validation") or {}
    if not isinstance(validation, dict):
        raise ValueError(f"Field '{field_key}' validation must be an object.")

    # Email field defaults to standard email regex if none specified
    if field_type == "email" and "regex" not in validation:
        validation["regex"] = DEFAULT_EMAIL_REGEX

    # Validate regex if present
    regex_pattern = validation.get("regex")
    if regex_pattern:
        try:
            re.compile(regex_pattern)
        except re.error as error:
            raise ValueError(f"Invalid regex pattern for field '{field_key}': {error}") from error

    # Dropdown / multiselect options check
    if field_type in ("dropdown", "multiselect"):
        options = validation.get("options")
        if not options or not isinstance(options, list) or not all(isinstance(o, str) for o in options):
            raise ValueError(f"Field '{field_key}' of type '{field_type}' requires a non-empty list of string 'options'.")

    return {
        "fieldKey": field_key,
        "type": field_type,
        "label": label.strip(),
        "required": required,
        "validation": validation,
    }


def create_form(
    *,
    form_id: str,
    title: str,
    description: str | None = None,
    fields: list[dict[str, Any]],
    created_by: int,
    organization_id: int | None = None,
    publish: bool = True,
) -> dict[str, Any]:
    form_id = form_id.strip()
    title = title.strip()
    if not form_id or not title:
        raise ValueError("form_id and title are required.")
    if not fields:
        raise ValueError("At least one field definition is required.")

    validated_fields = [validate_field_definition(f) for f in fields]
    status = "published" if publish else "draft"

    with connect() as db:
        try:
            db.execute(
                """INSERT INTO forms (id, organization_id, title, description, created_by)
                VALUES (?, ?, ?, ?, ?)""",
                (form_id, organization_id, title, description, created_by),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError(f"Form with ID '{form_id}' already exists.") from error

        db.execute(
            """INSERT INTO form_versions (form_id, version, status, fields, customized_by)
            VALUES (?, 1, ?, ?, ?)""",
            (form_id, status, json.dumps(validated_fields), created_by),
        )

        return {
            "formId": form_id,
            "organizationId": organization_id,
            "title": title,
            "description": description,
            "version": 1,
            "status": status,
            "fields": validated_fields,
        }


def customize_form(
    *,
    form_id: str,
    admin_user: dict[str, Any],
    title: str | None = None,
    description: str | None = None,
    fields: list[dict[str, Any]] | None = None,
    publish: bool = True,
) -> dict[str, Any]:
    """Admin customization of form definitions.
    
    Admins can modify titles, descriptions, and dynamic field specifications (adding/removing
    fields, altering labels, types, validation regex, or mandatory flags).
    """
    with connect() as db:
        form = db.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not form:
            raise ValueError(f"Form '{form_id}' does not exist.")

        # RBAC Check: Super admin can customize any form. Org admin can only customize their org forms.
        is_super = admin_user.get("kind") == "super_admin"
        admin_org = admin_user.get("organization_id")
        if not is_super and form["organization_id"] is not None and form["organization_id"] != admin_org:
            raise PermissionError("You do not have permission to customize this form.")

        # Update metadata if provided
        if title is not None or description is not None:
            new_title = title.strip() if title is not None else form["title"]
            new_desc = description if description is not None else form["description"]
            db.execute(
                "UPDATE forms SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_title, new_desc, form_id),
            )

        # Retrieve current latest version
        latest_version_row = db.execute(
            "SELECT * FROM form_versions WHERE form_id = ? ORDER BY version DESC LIMIT 1",
            (form_id,),
        ).fetchone()

        current_ver_num = latest_version_row["version"] if latest_version_row else 0
        new_status = "published" if publish else "draft"

        if fields is not None:
            if not fields:
                raise ValueError("Forms must retain at least one field definition.")
            validated_fields = [validate_field_definition(f) for f in fields]
            next_version = current_ver_num + 1

            db.execute(
                """INSERT INTO form_versions (form_id, version, status, fields, customized_by)
                VALUES (?, ?, ?, ?, ?)""",
                (form_id, next_version, new_status, json.dumps(validated_fields), admin_user["id"]),
            )
            version_to_return = next_version
            fields_to_return = validated_fields
            status_to_return = new_status
        else:
            version_to_return = latest_version_row["version"]
            fields_to_return = json.loads(latest_version_row["fields"])
            status_to_return = latest_version_row["status"]

        updated_form = db.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        return {
            "formId": form_id,
            "organizationId": updated_form["organization_id"],
            "title": updated_form["title"],
            "description": updated_form["description"],
            "version": version_to_return,
            "status": status_to_return,
            "fields": fields_to_return,
        }


def get_form(form_id: str, version: int | None = None) -> dict[str, Any] | None:
    with connect() as db:
        form = db.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not form:
            return None

        if version is not None:
            ver_row = db.execute(
                "SELECT * FROM form_versions WHERE form_id = ? AND version = ?",
                (form_id, version),
            ).fetchone()
        else:
            # Default to latest published version, or latest overall
            ver_row = db.execute(
                "SELECT * FROM form_versions WHERE form_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
                (form_id,),
            ).fetchone()
            if not ver_row:
                ver_row = db.execute(
                    "SELECT * FROM form_versions WHERE form_id = ? ORDER BY version DESC LIMIT 1",
                    (form_id,),
                ).fetchone()

        if not ver_row:
            return None

        return {
            "formId": form["id"],
            "organizationId": form["organization_id"],
            "title": form["title"],
            "description": form["description"],
            "version": ver_row["version"],
            "status": ver_row["status"],
            "fields": json.loads(ver_row["fields"]),
            "createdAt": form["created_at"],
            "updatedAt": form["updated_at"],
        }


def list_forms(identity: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with connect() as db:
        kind = identity.get("kind") if identity else "user"
        org_id = identity.get("organization_id") if identity else None

        if kind == "super_admin":
            forms = db.execute("SELECT * FROM forms ORDER BY created_at DESC").fetchall()
        elif kind == "organization_admin":
            forms = db.execute(
                "SELECT * FROM forms WHERE organization_id = ? OR organization_id IS NULL ORDER BY created_at DESC",
                (org_id,),
            ).fetchall()
        else:
            # End user: view forms belonging to their org, or all forms if user has no org assigned
            if org_id:
                forms = db.execute(
                    "SELECT * FROM forms WHERE organization_id = ? OR organization_id IS NULL ORDER BY created_at DESC",
                    (org_id,),
                ).fetchall()
            else:
                forms = db.execute("SELECT * FROM forms ORDER BY created_at DESC").fetchall()

        results = []
        for form in forms:
            ver_row = db.execute(
                "SELECT * FROM form_versions WHERE form_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
                (form["id"],),
            ).fetchone()
            if not ver_row and kind in ("super_admin", "organization_admin"):
                ver_row = db.execute(
                    "SELECT * FROM form_versions WHERE form_id = ? ORDER BY version DESC LIMIT 1",
                    (form["id"],),
                ).fetchone()

            if ver_row:
                results.append({
                    "formId": form["id"],
                    "organizationId": form["organization_id"],
                    "title": form["title"],
                    "description": form["description"],
                    "version": ver_row["version"],
                    "status": ver_row["status"],
                    "fields": json.loads(ver_row["fields"]),
                })

        return results


def delete_form(form_id: str, admin_user: dict[str, Any]) -> bool:
    with connect() as db:
        form = db.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not form:
            return False

        is_super = admin_user.get("kind") == "super_admin"
        admin_org = admin_user.get("organization_id")
        if not is_super and form["organization_id"] is not None and form["organization_id"] != admin_org:
            raise PermissionError("You do not have permission to delete this form.")

        db.execute("DELETE FROM forms WHERE id = ?", (form_id,))
        return True
