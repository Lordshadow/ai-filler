from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request

from .service import CSRFError, authenticate


def _extract_token(
    session_token: str | None,
    authorization: str | None,
) -> tuple[str | None, bool]:
    """Extract token and return (token, is_bearer)."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip(), True
    return session_token, False


def current_identity(
    session_token: Annotated[str | None, Cookie()] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> dict[str, object]:
    token, _ = _extract_token(session_token, authorization)
    try:
        return authenticate(token, csrf_token, require_csrf=False)
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


def current_write_identity(
    request: Request,
    session_token: Annotated[str | None, Cookie()] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> dict[str, object]:
    token, is_bearer = _extract_token(session_token, authorization)
    try:
        # Bearer tokens in headers are not subject to CSRF vulnerabilities.
        # Safe HTTP methods (GET, HEAD, OPTIONS) do not mutate state and do not require CSRF tokens.
        is_safe_method = request is not None and request.method in ("GET", "HEAD", "OPTIONS")
        require_csrf = (not is_bearer) and (not is_safe_method)
        return authenticate(token, csrf_token, require_csrf=require_csrf)
    except CSRFError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


def current_super_admin(
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, object]:
    if identity.get("kind") != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required.")
    return identity


def current_admin(
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, object]:
    """Allows Super Admin or Organization Admin."""
    if identity.get("kind") not in ("super_admin", "organization_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return identity


def current_org_admin(
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, object]:
    if identity.get("kind") not in ("organization_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Organization admin access required.")
    return identity
