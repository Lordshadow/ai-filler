from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import datetime
from typing import Any

from ai_filler.auth.db import connect
from ai_filler.services.forms import get_form


class ValidationError(Exception):
    """Base validation error conforming to RFC 7807 problem details."""
    def __init__(self, code: str, title: str, detail: str, invalid_params: list[dict[str, Any]] | None = None):
        super().__init__(detail)
        self.code = code
        self.title = title
        self.detail = detail
        self.invalid_params = invalid_params or []


class MissingRequiredFieldsError(ValidationError):
    def __init__(self, missing_fields: list[str]):
        invalid_params = [
            {"field": f"/{field}", "rule": "required", "message": f"Field '{field}' is mandatory."}
            for field in missing_fields
        ]
        super().__init__(
            code="MISSING_REQUIRED_FIELDS",
            title="Mandatory Fields Missing",
            detail="The submission is missing required fields defined in the form schema.",
            invalid_params=invalid_params,
        )


class FieldRegexMismatchError(ValidationError):
    def __init__(self, field: str, expected_regex: str, actual_value: Any):
        invalid_params = [{
            "field": f"/{field}",
            "rule": "regex",
            "expected": expected_regex,
            "message": f"Value '{actual_value}' does not match pattern '{expected_regex}'.",
        }]
        super().__init__(
            code="FIELD_REGEX_MISMATCH",
            title="Field Validation Failed",
            detail=f"Field '{field}' failed regular expression validation.",
            invalid_params=invalid_params,
        )


class FieldConstraintError(ValidationError):
    def __init__(self, field: str, rule: str, message: str):
        invalid_params = [{"field": f"/{field}", "rule": rule, "message": message}]
        super().__init__(
            code="FIELD_CONSTRAINT_VIOLATION",
            title="Field Constraint Violation",
            detail=message,
            invalid_params=invalid_params,
        )


class IdempotencyPayloadMismatchError(Exception):
    """Raised when an Idempotency-Key is reused with a different request payload."""
    def __init__(self, key: str):
        super().__init__(f"Idempotency key '{key}' was previously used with a different request payload.")
        self.code = "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"
        self.key = key


def compute_payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def execute_schema_validation(form_version_def: dict[str, Any], data: dict[str, Any]) -> None:
    fields = form_version_def.get("fields", [])
    missing_fields: list[str] = []

    for field in fields:
        field_key = field.get("fieldKey") or field.get("field_key")
        field_type = field.get("type", "text")
        required = bool(field.get("required", False))
        validation = field.get("validation") or {}

        val = data.get(field_key)

        # 1. Required check
        if required:
            if val is None or val == "" or (isinstance(val, list) and len(val) == 0):
                missing_fields.append(field_key)
                continue

        if val is None or val == "":
            continue

        # 2. Type and bounds checks
        if field_type == "number":
            if not isinstance(val, (int, float)):
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    raise FieldConstraintError(field_key, "type", f"Field '{field_key}' must be a numeric value.")
            min_val = validation.get("min")
            if min_val is not None and val < min_val:
                raise FieldConstraintError(field_key, "min", f"Field '{field_key}' must be at least {min_val}.")
            max_val = validation.get("max")
            if max_val is not None and val > max_val:
                raise FieldConstraintError(field_key, "max", f"Field '{field_key}' cannot exceed {max_val}.")

        elif field_type == "date":
            try:
                datetime.strptime(str(val), "%Y-%m-%d")
            except ValueError:
                raise FieldConstraintError(field_key, "date", f"Field '{field_key}' must be in YYYY-MM-DD date format.")

        elif field_type == "dropdown":
            options = validation.get("options", [])
            if str(val) not in options:
                raise FieldConstraintError(field_key, "options", f"Value '{val}' is not one of valid options: {options}.")

        elif field_type == "multiselect":
            options = validation.get("options", [])
            if not isinstance(val, list) or not all(str(item) in options for item in val):
                raise FieldConstraintError(field_key, "options", f"All selections must be within valid options: {options}.")

        # 3. Dynamic Regex validation
        regex_pattern = validation.get("regex")
        if regex_pattern and isinstance(val, (str, int)):
            compiled = re.compile(regex_pattern)
            if not compiled.match(str(val)):
                raise FieldRegexMismatchError(field=field_key, expected_regex=regex_pattern, actual_value=val)

    if missing_fields:
        raise MissingRequiredFieldsError(missing_fields)


def submit_application(
    *,
    idempotency_key: str,
    form_id: str,
    form_version: int,
    user: dict[str, Any],
    data: dict[str, Any],
    draft_id: str | None = None,
    provenance: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int]:
    user_id = user["id"]
    org_id = user.get("organization_id")
    request_payload = {
        "formId": form_id,
        "formVersion": form_version,
        "data": data,
        "draftId": draft_id,
    }
    payload_hash = compute_payload_hash(request_payload)

    with connect() as db:
        # Check idempotency
        idemp = db.execute(
            "SELECT * FROM idempotency_records WHERE key = ? AND user_id = ?",
            (idempotency_key, user_id),
        ).fetchone()

        if idemp:
            if idemp["payload_hash"] != payload_hash:
                raise IdempotencyPayloadMismatchError(idempotency_key)
            return json.loads(idemp["response_json"]), idemp["status_code"]

        # Dynamic Schema Validation
        form_def = get_form(form_id, version=form_version)
        if not form_def:
            raise ValueError(f"Form '{form_id}' version {form_version} does not exist.")

        execute_schema_validation(form_def, data)

        # Resolve provenance
        collected_provenance = provenance or {}
        if draft_id and not collected_provenance:
            draft_row = db.execute("SELECT provenance FROM drafts WHERE id = ?", (draft_id,)).fetchone()
            if draft_row and draft_row["provenance"]:
                collected_provenance = json.loads(draft_row["provenance"])

        # Persist Application
        app_id = f"app_{uuid.uuid4().hex[:16]}"
        db.execute(
            """INSERT INTO applications
            (id, draft_id, form_id, form_version, user_id, organization_id, status, data)
            VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)""",
            (app_id, draft_id, form_id, form_version, user_id, org_id, json.dumps(data)),
        )

        # Decouple Provenance into Audit Ledger
        if collected_provenance:
            db.execute(
                """INSERT INTO application_provenance_audit (application_id, provenance)
                VALUES (?, ?)""",
                (app_id, json.dumps(collected_provenance)),
            )

        # Mark Draft Submitted if applicable
        if draft_id:
            db.execute(
                "UPDATE drafts SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (draft_id,),
            )

        row = db.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
        response_body = {
            "applicationId": row["id"],
            "draftId": row["draft_id"],
            "formId": row["form_id"],
            "formVersion": row["form_version"],
            "userId": row["user_id"],
            "organizationId": row["organization_id"],
            "status": row["status"],
            "data": json.loads(row["data"]),
            "submittedAt": row["submitted_at"],
        }

        # Cache Idempotency
        db.execute(
            """INSERT INTO idempotency_records (key, user_id, payload_hash, status_code, response_json)
            VALUES (?, ?, ?, 201, ?)""",
            (idempotency_key, user_id, payload_hash, json.dumps(response_body)),
        )

        return response_body, 201


def get_applications(user: dict[str, Any]) -> list[dict[str, Any]]:
    with connect() as db:
        kind = user.get("kind")
        user_id = user["id"]
        org_id = user.get("organization_id")

        if kind == "super_admin":
            rows = db.execute("SELECT * FROM applications ORDER BY submitted_at DESC").fetchall()
        elif kind == "organization_admin":
            rows = db.execute(
                "SELECT * FROM applications WHERE organization_id = ? ORDER BY submitted_at DESC",
                (org_id,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM applications WHERE user_id = ? ORDER BY submitted_at DESC",
                (user_id,),
            ).fetchall()

        return [
            {
                "applicationId": r["id"],
                "draftId": r["draft_id"],
                "formId": r["form_id"],
                "formVersion": r["form_version"],
                "userId": r["user_id"],
                "organizationId": r["organization_id"],
                "status": r["status"],
                "data": json.loads(r["data"]),
                "submittedAt": r["submitted_at"],
            }
            for r in rows
        ]


def get_application_by_id(app_id: str, user: dict[str, Any]) -> dict[str, Any] | None:
    with connect() as db:
        r = db.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
        if not r:
            return None

        kind = user.get("kind")
        user_id = user["id"]
        org_id = user.get("organization_id")

        is_owner = r["user_id"] == user_id
        is_org_admin = kind == "organization_admin" and r["organization_id"] == org_id
        is_super = kind == "super_admin"

        if not (is_owner or is_org_admin or is_super):
            raise PermissionError("Access to this application is forbidden.")

        result = {
            "applicationId": r["id"],
            "draftId": r["draft_id"],
            "formId": r["form_id"],
            "formVersion": r["form_version"],
            "userId": r["user_id"],
            "organizationId": r["organization_id"],
            "status": r["status"],
            "data": json.loads(r["data"]),
            "submittedAt": r["submitted_at"],
            "updatedAt": r["updated_at"],
        }

        # Include provenance audit trail for Admins
        if is_org_admin or is_super:
            audit_rows = db.execute(
                "SELECT provenance, recorded_at FROM application_provenance_audit WHERE application_id = ?",
                (app_id,),
            ).fetchall()
            result["provenanceAudit"] = [
                {"provenance": json.loads(a["provenance"]), "recordedAt": a["recorded_at"]}
                for a in audit_rows
            ]

        return result


def get_all_applications_global(user: dict[str, Any]) -> list[dict[str, Any]]:
    if user.get("kind") != "super_admin":
        raise PermissionError("Tenant access denied: Super-admin clearance required.")

    with connect() as db:
        rows = db.execute(
            """SELECT a.*, o.name AS organization_name, i.email AS user_email
            FROM applications a
            LEFT JOIN organizations o ON a.organization_id = o.id
            LEFT JOIN identities i ON a.user_id = i.id
            ORDER BY a.submitted_at DESC"""
        ).fetchall()

        return [
            {
                "applicationId": r["id"],
                "draftId": r["draft_id"],
                "formId": r["form_id"],
                "formVersion": r["form_version"],
                "userId": r["user_id"],
                "userEmail": r["user_email"],
                "organizationId": r["organization_id"],
                "organizationName": r["organization_name"],
                "status": r["status"],
                "data": json.loads(r["data"]),
                "submittedAt": r["submitted_at"],
            }
            for r in rows
        ]
