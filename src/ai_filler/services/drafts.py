from __future__ import annotations

import json
import sqlite3
from typing import Any

from ai_filler.auth.db import connect


class OCCConflictError(Exception):
    """Raised when an autosave write encounters an Optimistic Concurrency Control conflict."""

    def __init__(self, client_version: int, server_version: int, current_draft: dict[str, Any]):
        super().__init__(f"Draft version conflict: client submitted v{client_version}, server is at v{server_version}.")
        self.client_version = client_version
        self.server_version = server_version
        self.current_draft = current_draft


def _serialize_draft(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "draftId": row["id"],
        "formId": row["form_id"],
        "formVersion": row["form_version"],
        "userId": row["user_id"],
        "organizationId": row["organization_id"],
        "version": row["version"],
        "status": row["status"],
        "data": json.loads(row["data"] or "{}"),
        "provenance": json.loads(row["provenance"] or "{}"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "etag": f'W/"v{row["version"]}"',
    }


def save_draft(
    *,
    draft_id: str,
    form_id: str,
    form_version: int,
    user: dict[str, Any],
    data: dict[str, Any],
    provenance: dict[str, Any] | None = None,
    client_version: int | None = None,
) -> dict[str, Any]:
    draft_id = draft_id.strip()
    if not draft_id:
        raise ValueError("draft_id is required.")
    
    provenance = provenance or {}
    user_id = user["id"]
    org_id = user.get("organization_id")

    with connect() as db:
        existing = db.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()

        if existing:
            # Authorization check
            is_owner = existing["user_id"] == user_id
            is_super = user.get("kind") == "super_admin"
            is_org_admin = user.get("kind") == "organization_admin" and existing["organization_id"] == org_id

            if not (is_owner or is_super or is_org_admin):
                raise PermissionError("You do not have permission to modify this draft.")

            if existing["status"] == "submitted":
                raise ValueError("Cannot modify an already submitted draft.")

            server_version = existing["version"]
            if client_version is not None and client_version != server_version:
                raise OCCConflictError(
                    client_version=client_version,
                    server_version=server_version,
                    current_draft=_serialize_draft(existing),
                )

            next_version = server_version + 1
            db.execute(
                """UPDATE drafts
                SET form_id = ?, form_version = ?, version = ?, data = ?, provenance = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
                (
                    form_id,
                    form_version,
                    next_version,
                    json.dumps(data),
                    json.dumps(provenance),
                    draft_id,
                ),
            )
        else:
            # Insert new draft
            next_version = 1
            db.execute(
                """INSERT INTO drafts
                (id, form_id, form_version, user_id, organization_id, version, data, provenance, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')""",
                (
                    draft_id,
                    form_id,
                    form_version,
                    user_id,
                    org_id,
                    next_version,
                    json.dumps(data),
                    json.dumps(provenance),
                ),
            )

        updated_row = db.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        return _serialize_draft(updated_row)


def get_draft(draft_id: str, user: dict[str, Any]) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if not row:
            return None

        user_id = user["id"]
        org_id = user.get("organization_id")
        is_owner = row["user_id"] == user_id
        is_super = user.get("kind") == "super_admin"
        is_org_admin = user.get("kind") == "organization_admin" and row["organization_id"] == org_id

        if not (is_owner or is_super or is_org_admin):
            raise PermissionError("Access to this draft is forbidden.")

        return _serialize_draft(row)
