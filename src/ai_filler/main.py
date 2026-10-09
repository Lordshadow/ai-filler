from pathlib import Path
import os
import re
import secrets
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, Query, Response, UploadFile, status
from fastapi import Cookie, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .services.main import create_application, process_documents, transcribe_audio
from .auth.dependencies import (
    current_admin,
    current_identity,
    current_org_admin,
    current_super_admin,
    current_write_identity,
)
from .auth.email import password_reset_email_configured, send_password_reset_email
from .auth.service import (
    create_organization_admin,
    create_password_reset,
    discard_password_reset,
    get_user_profile,
    login,
    logout,
    register_user,
    reset_password,
    signup,
    update_user_profile,
)
from .services.forms import create_form, customize_form, delete_form, get_form, list_forms
from .services.drafts import OCCConflictError, get_draft, save_draft
from .services.submissions import (
    IdempotencyPayloadMismatchError,
    ValidationError,
    get_all_applications_global,
    get_application_by_id,
    get_applications,
    submit_application,
)
from .test import test_function

app = FastAPI(title="AI Filler")
cors_origins = [origin.strip() for origin in os.getenv(
    "AI_FILLER_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
).split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)


class ApplicationFormatRequest(BaseModel):
    transcript: str


class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    date_of_birth: str
    phone_number: str


class LoginRequest(BaseModel):
    identifier: str
    password: str


class OrganizationAdminRequest(BaseModel):
    organization_name: str
    full_name: str
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    identifier: str


class PasswordResetConfirmRequest(BaseModel):
    token: str
    password: str


def _set_session(response: Response, result: dict[str, object]) -> None:
    secure_cookie = os.getenv("AI_FILLER_COOKIE_SECURE", "true").lower() in {"1", "true", "yes"}
    response.set_cookie(
        "session_token", str(result["token"]), httponly=True, secure=secure_cookie,
        samesite="lax", max_age=7 * 24 * 60 * 60,
    )
    response.set_cookie(
        "csrf_token", str(result["csrf_token"]), httponly=False, secure=secure_cookie,
        samesite="lax", max_age=7 * 24 * 60 * 60,
    )


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "AI Filler API is running"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/signup")
def signup_endpoint(request: SignupRequest) -> dict[str, object]:
    try:
        return {"user": signup(**request.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/auth/user/login")
def user_login(request: LoginRequest, response: Response) -> dict[str, object]:
    try:
        result = login(identifier=request.identifier, password=request.password, kind="user")
        _set_session(response, result)
        return {"user": result["user"]}
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.post("/auth/admin/login")
def admin_login(request: LoginRequest, response: Response) -> dict[str, object]:
    try:
        result = login(
            identifier=request.identifier,
            password=request.password,
            kind="organization_admin",
        )
        _set_session(response, result)
        return {"user": result["user"]}
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.post("/auth/super/login")
def super_admin_login(request: LoginRequest, response: Response) -> dict[str, object]:
    try:
        result = login(identifier=request.identifier, password=request.password, kind="super_admin")
        _set_session(response, result)
        return {"user": result["user"]}
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.post("/auth/super/organization-admins")
def create_organization_admin_endpoint(
    request: OrganizationAdminRequest,
    identity: dict[str, object] = Depends(current_super_admin),
) -> dict[str, object]:
    admin_id = f"ADM-{secrets.token_hex(6).upper()}"
    try:
        admin = create_organization_admin(
            organization_name=request.organization_name,
            full_name=request.full_name,
            email=request.email,
            password=request.password,
            admin_id=admin_id,
        )
        return {"admin": admin, "admin_id": admin_id}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def _request_password_reset(identifier: str, role: str) -> dict[str, str]:
    if not password_reset_email_configured():
        raise HTTPException(
            status_code=503,
            detail="Password recovery is unavailable. Contact the system administrator.",
        )
    reset = create_password_reset(identifier=identifier, kind=role)
    if reset:
        token, recipient = reset
        try:
            send_password_reset_email(recipient=recipient, token=token, role=role)
        except Exception as error:
            discard_password_reset(token=token)
            raise HTTPException(
                status_code=503,
                detail="Password recovery is temporarily unavailable. Try again later.",
            ) from error
    return {"message": "If the account is eligible, password reset instructions will be sent."}


@app.post("/auth/user/password-reset/request", status_code=202)
def request_user_password_reset(request: PasswordResetRequest) -> dict[str, str]:
    return _request_password_reset(request.identifier, "user")


@app.post("/auth/admin/password-reset/request", status_code=202)
def request_admin_password_reset(request: PasswordResetRequest) -> dict[str, str]:
    return _request_password_reset(request.identifier, "organization_admin")


@app.post("/auth/super/password-reset/request", status_code=202)
def request_super_password_reset(request: PasswordResetRequest) -> dict[str, str]:
    return _request_password_reset(request.identifier, "super_admin")


def _confirm_password_reset(request: PasswordResetConfirmRequest, role: str) -> dict[str, str]:
    try:
        changed = reset_password(token=request.token, password=request.password, kind=role)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not changed:
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired.")
    return {"message": "Password updated. Please sign in with your new password."}


@app.post("/auth/user/password-reset/confirm")
def confirm_user_password_reset(request: PasswordResetConfirmRequest) -> dict[str, str]:
    return _confirm_password_reset(request, "user")


@app.post("/auth/admin/password-reset/confirm")
def confirm_admin_password_reset(request: PasswordResetConfirmRequest) -> dict[str, str]:
    return _confirm_password_reset(request, "organization_admin")


@app.post("/auth/super/password-reset/confirm")
def confirm_super_password_reset(request: PasswordResetConfirmRequest) -> dict[str, str]:
    return _confirm_password_reset(request, "super_admin")


@app.get("/auth/me")
def auth_me(identity: dict[str, object] = Depends(current_identity)) -> dict[str, object]:
    return {"user": identity}


@app.post("/auth/logout")
def auth_logout(
    response: Response,
    token: str | None = Cookie(default=None, alias="session_token"),
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, str]:
    logout(token)
    response.delete_cookie("session_token")
    response.delete_cookie("csrf_token")
    return {"status": "ok"}

@app.get("/test")
def test_endpoint():
    return test_function()


@app.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    suffix = Path(file.filename).suffix or ".webm"
    temporary_file = NamedTemporaryFile(suffix=suffix, delete=False)
    temporary_path = Path(temporary_file.name)
    try:
        temporary_file.write(await file.read())
        temporary_file.close()
        return {"text": transcribe_audio(file_path=temporary_path)}
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    finally:
        temporary_path.unlink(missing_ok=True)
        await file.close()


@app.post("/format-application")
def format_application_endpoint(
    request: ApplicationFormatRequest,
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, dict[str, str]]:
    try:
        return {"application": create_application(transcript=request.transcript)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/extract-document")
async def extract_document_endpoint(
    files: list[UploadFile] = File(...),
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, object]:
    if not files:
        raise HTTPException(status_code=400, detail="At least one document file is required.")

    temporary_paths: list[Path] = []
    extracted_documents: list[tuple[str, Path]] = []
    try:
        for file in files:
            if not file.filename:
                raise HTTPException(status_code=400, detail="Each upload must have a filename.")

            temporary_file = NamedTemporaryFile(
                suffix=Path(file.filename).suffix.lower(),
                delete=False,
            )
            temporary_path = Path(temporary_file.name)
            temporary_paths.append(temporary_path)
            temporary_file.write(await file.read())
            temporary_file.close()
            extracted_documents.append((file.filename, temporary_path))

        return process_documents(documents=extracted_documents)
    except (RuntimeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Document processing failed: {error}") from error
    finally:
        for temporary_path in temporary_paths:
            temporary_path.unlink(missing_ok=True)
        for file in files:
            await file.close()


# ── User Management Service (UserService) ──────────────────────────────


class UserRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    date_of_birth: str
    phone_number: str
    organization_id: int | None = None
    role: str = "user"


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None
    phone_number: str | None = None


@app.post("/auth/register", status_code=201)
def register_endpoint(request: UserRegisterRequest) -> dict[str, object]:
    """User registration enforcing ITU-T E.164 phone and ISO 8601 DOB (age >= 18)."""
    try:
        user = register_user(
            full_name=request.full_name,
            email=request.email,
            password=request.password,
            date_of_birth=request.date_of_birth,
            phone_number=request.phone_number,
            organization_id=request.organization_id,
            role=request.role,
        )
        return {"user": user}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/users/me")
def get_current_user_profile(
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, object]:
    profile = get_user_profile(int(identity["id"]))
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found.")
    return {"user": profile}


@app.get("/users/{user_id}")
def get_user_profile_endpoint(
    user_id: int,
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, object]:
    caller_id = int(identity["id"])
    caller_kind = identity.get("kind")
    caller_org = identity.get("organization_id")

    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")

    is_self = caller_id == user_id
    is_super = caller_kind == "super_admin"
    is_org_admin = caller_kind == "organization_admin" and profile.get("organization_id") == caller_org

    if not (is_self or is_super or is_org_admin):
        raise HTTPException(status_code=403, detail="Access to user profile is forbidden.")

    return {"user": profile}


@app.patch("/users/{user_id}")
def update_user_profile_endpoint(
    user_id: int,
    request: UserUpdateRequest,
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, object]:
    caller_id = int(identity["id"])
    caller_kind = identity.get("kind")

    if caller_id != user_id and caller_kind != "super_admin":
        raise HTTPException(status_code=403, detail="Permission denied to modify this user.")

    try:
        updated = update_user_profile(user_id, request.model_dump())
        return {"user": updated}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ── Form Definition Service (FormService) ──────────────────────────────


class FormCreateRequest(BaseModel):
    form_id: str
    title: str
    description: str | None = None
    fields: list[dict[str, Any]]
    organization_id: int | None = None
    publish: bool = True


class FormCustomizeRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    fields: list[dict[str, Any]] | None = None
    publish: bool = True


@app.post("/forms", status_code=201)
def create_form_endpoint(
    request: FormCreateRequest,
    identity: dict[str, object] = Depends(current_admin),
) -> dict[str, Any]:
    """Admin creates a customizable form schema definition."""
    org_id = request.organization_id
    if identity.get("kind") != "super_admin":
        org_id = identity.get("organization_id")

    try:
        created = create_form(
            form_id=request.form_id,
            title=request.title,
            description=request.description,
            fields=request.fields,
            created_by=int(identity["id"]),
            organization_id=org_id,
            publish=request.publish,
        )
        return {"form": created}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/forms")
def list_forms_endpoint(
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, Any]:
    forms = list_forms(identity)
    return {"forms": forms}


@app.get("/forms/{form_id}")
def get_form_endpoint(
    form_id: str,
    version: int | None = Query(default=None),
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, Any]:
    form = get_form(form_id, version=version)
    if not form:
        raise HTTPException(status_code=404, detail=f"Form '{form_id}' not found.")
    return {"form": form}


@app.put("/forms/{form_id}")
@app.post("/forms/{form_id}/customize")
def customize_form_endpoint(
    form_id: str,
    request: FormCustomizeRequest,
    identity: dict[str, object] = Depends(current_admin),
) -> dict[str, Any]:
    """Admin customizes existing form definition, fields, regex, and bumps version."""
    try:
        updated = customize_form(
            form_id=form_id,
            admin_user=identity,
            title=request.title,
            description=request.description,
            fields=request.fields,
            publish=request.publish,
        )
        return {"form": updated}
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/forms/{form_id}")
def delete_form_endpoint(
    form_id: str,
    identity: dict[str, object] = Depends(current_admin),
) -> dict[str, Any]:
    """Admin deletes a form."""
    try:
        deleted = delete_form(form_id, identity)
        if not deleted:
            raise HTTPException(status_code=404, detail="Form not found.")
        return {"status": "ok", "message": f"Form '{form_id}' deleted successfully."}
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


# ── Draft Service (DraftService) ──────────────────────────────────────


class DraftSaveRequest(BaseModel):
    form_id: str
    form_version: int
    version: int | None = None
    data: dict[str, Any]
    provenance: dict[str, Any] | None = None


def _parse_etag_version(if_match_header: str | None) -> int | None:
    if not if_match_header:
        return None
    cleaned = if_match_header.strip().strip('"').lstrip("W/").strip('"')
    if cleaned.startswith("v") or cleaned.startswith("V"):
        cleaned = cleaned[1:]
    try:
        return int(cleaned)
    except ValueError:
        return None


@app.put("/drafts/{draft_id}")
def save_draft_endpoint(
    draft_id: str,
    request: DraftSaveRequest,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    identity: dict[str, object] = Depends(current_write_identity),
) -> dict[str, Any]:
    """Autosaves draft state with OCC versioning and field provenance tracking."""
    client_version = request.version
    if client_version is None and if_match is not None:
        client_version = _parse_etag_version(if_match)

    try:
        saved = save_draft(
            draft_id=draft_id,
            form_id=request.form_id,
            form_version=request.form_version,
            user=identity,
            data=request.data,
            provenance=request.provenance,
            client_version=client_version,
        )
        response.headers["ETag"] = saved["etag"]
        return {"draft": saved}
    except OCCConflictError as conflict:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "type": "https://api.platform.internal/errors/version-conflict",
                "title": "Draft Version Conflict",
                "status": 409,
                "detail": str(conflict),
                "code": "DRAFT_VERSION_CONFLICT",
                "clientVersion": conflict.client_version,
                "serverVersion": conflict.server_version,
                "currentDraft": conflict.current_draft,
            },
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/drafts/{draft_id}")
def get_draft_endpoint(
    draft_id: str,
    response: Response,
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, Any]:
    try:
        draft = get_draft(draft_id, identity)
        if not draft:
            raise HTTPException(status_code=404, detail="Draft not found.")
        response.headers["ETag"] = draft["etag"]
        return {"draft": draft}
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


# ── Submission Service (SubmissionService) ────────────────────────────


class ApplicationSubmitRequest(BaseModel):
    form_id: str
    form_version: int
    data: dict[str, Any]
    draft_id: str | None = None
    provenance: dict[str, Any] | None = None


@app.post("/applications", status_code=201)
def submit_application_endpoint(
    request: ApplicationSubmitRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    identity: dict[str, object] = Depends(current_write_identity),
) -> Response:
    """Submits application, executes server-side dynamic schema validation, and decouples provenance."""
    try:
        result_body, status_code = submit_application(
            idempotency_key=idempotency_key,
            form_id=request.form_id,
            form_version=request.form_version,
            user=identity,
            data=request.data,
            draft_id=request.draft_id,
            provenance=request.provenance,
        )
        return JSONResponse(status_code=status_code, content={"application": result_body})
    except IdempotencyPayloadMismatchError as error:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "type": "https://api.platform.internal/errors/idempotency-payload-mismatch",
                "title": "Idempotency Conflict",
                "status": 422,
                "detail": str(error),
                "code": error.code,
            },
        )
    except ValidationError as val_err:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "type": "https://api.platform.internal/errors/validation-failed",
                "title": val_err.title,
                "status": 422,
                "detail": val_err.detail,
                "code": val_err.code,
                "invalidParams": val_err.invalid_params,
            },
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/applications")
def list_applications_endpoint(
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, Any]:
    apps = get_applications(identity)
    return {"applications": apps}


@app.get("/applications/all")
def list_all_applications_endpoint(
    identity: dict[str, object] = Depends(current_super_admin),
) -> dict[str, Any]:
    """Platform-wide cross-tenant query view reserved for Super Admin."""
    try:
        apps = get_all_applications_global(identity)
        return {"applications": apps}
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@app.get("/applications/{application_id}")
def get_application_endpoint(
    application_id: str,
    identity: dict[str, object] = Depends(current_identity),
) -> dict[str, Any]:
    try:
        app_record = get_application_by_id(application_id, identity)
        if not app_record:
            raise HTTPException(status_code=404, detail="Application not found.")
        return {"application": app_record}
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
