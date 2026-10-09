"""
Integration and workflow test suite for:
1. User Management Service (UserService)
2. Form Definition Service (FormService) - with Admin Customization
3. Draft Service (DraftService) - with Field Provenance & OCC
4. Submission Service (SubmissionService) - with Schema Execution & Idempotency
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from ai_filler.main import app
from ai_filler.auth.service import create_super_admin, create_organization_admin

client = TestClient(app)


def _auth_headers(identifier: str, password: str, kind: str) -> dict[str, str]:
    endpoint = (
        "/auth/user/login"
        if kind == "user"
        else ("/auth/admin/login" if kind == "organization_admin" else "/auth/super/login")
    )
    resp = client.post(endpoint, json={"identifier": identifier, "password": password})
    assert resp.status_code == 200, f"Login failed for {identifier}: {resp.text}"
    token = resp.cookies.get("session_token")
    csrf = resp.cookies.get("csrf_token")
    return {
        "Authorization": f"Bearer {token}",
        "X-CSRF-Token": csrf,
    }


@pytest.fixture
def test_setup():
    # 1. Provision super admin
    super_admin = create_super_admin(identifier="superadmin", password="SuperPassword123!")

    # 2. Provision Org 1 and Org Admin
    org_admin = create_organization_admin(
        organization_name="Apex Healthcare",
        full_name="Dr. Apex",
        email="admin@apex.com",
        password="AdminPassword123!",
        admin_id="ADM-APEX01",
    )

    # 3. Provision End User under Org 1 via registration
    reg_resp = client.post(
        "/auth/register",
        json={
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "password": "UserPassword123!",
            "date_of_birth": "1995-05-20",
            "phone_number": "+14155552671",
            "organization_id": org_admin["organization_id"],
            "role": "user",
        },
    )
    assert reg_resp.status_code == 201, reg_resp.text
    user = reg_resp.json()["user"]

    super_headers = _auth_headers("superadmin", "SuperPassword123!", "super_admin")
    admin_headers = _auth_headers("ADM-APEX01", "AdminPassword123!", "organization_admin")
    user_headers = _auth_headers("jane@example.com", "UserPassword123!", "user")

    return {
        "super_admin": super_admin,
        "org_admin": org_admin,
        "user": user,
        "super_headers": super_headers,
        "admin_headers": admin_headers,
        "user_headers": user_headers,
    }


# ── 1. User Management Service Tests ────────────────────────────────────


def test_user_registration_dob_and_phone_validation(test_setup):
    # Underage user (< 18)
    underage_resp = client.post(
        "/auth/register",
        json={
            "full_name": "Kiddo",
            "email": "kid@example.com",
            "password": "Password123!",
            "date_of_birth": "2015-01-01",
            "phone_number": "+14155552671",
        },
    )
    assert underage_resp.status_code == 400
    assert "at least 18 years old" in underage_resp.json()["detail"]

    # Invalid E.164 phone
    invalid_phone_resp = client.post(
        "/auth/register",
        json={
            "full_name": "Adult",
            "email": "adult@example.com",
            "password": "Password123!",
            "date_of_birth": "1990-01-01",
            "phone_number": "12345",
        },
    )
    assert invalid_phone_resp.status_code == 400
    assert "E.164" in invalid_phone_resp.json()["detail"]


def test_user_profile_lookup_and_update(test_setup):
    user_headers = test_setup["user_headers"]
    user_id = test_setup["user"]["id"]

    # GET /users/me
    me_resp = client.get("/users/me", headers=user_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["email"] == "jane@example.com"

    # PATCH /users/{id}
    patch_resp = client.patch(
        f"/users/{user_id}",
        json={"phone_number": "+14155559999", "full_name": "Jane Updated"},
        headers=user_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["user"]["phone_number"] == "+14155559999"
    assert patch_resp.json()["user"]["full_name"] == "Jane Updated"


# ── 2. Form Definition Service & Admin Customization Tests ──────────────


def test_admin_form_creation_and_customization(test_setup):
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]
    form_id = f"frm_kyc_{uuid.uuid4().hex[:6]}"

    initial_fields = [
        {
            "fieldKey": "nationalId",
            "type": "text",
            "label": "National Identity Number",
            "required": True,
            "validation": {"regex": r"^[A-Z]{2}\d{6}$"},
        },
        {
            "fieldKey": "annualIncome",
            "type": "number",
            "label": "Annual Income USD",
            "required": True,
            "validation": {"min": 10000},
        },
    ]

    # Admin creates customizable form
    create_resp = client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Patient KYC Form",
            "description": "Standard registration questionnaire",
            "fields": initial_fields,
            "publish": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    created_form = create_resp.json()["form"]
    assert created_form["version"] == 1
    assert len(created_form["fields"]) == 2

    # End users cannot customize form (403)
    user_forbidden = client.put(
        f"/forms/{form_id}",
        json={"title": "Hacked Form"},
        headers=user_headers,
    )
    assert user_forbidden.status_code == 403

    # Admin customizes form: adds a new field and modifies an existing label
    updated_fields = [
        *initial_fields,
        {
            "fieldKey": "employmentStatus",
            "type": "dropdown",
            "label": "Employment Status",
            "required": True,
            "validation": {"options": ["EMPLOYED", "SELF_EMPLOYED", "RETIRED"]},
        },
    ]

    customize_resp = client.put(
        f"/forms/{form_id}",
        json={
            "title": "Patient KYC Form - Enhanced",
            "fields": updated_fields,
            "publish": True,
        },
        headers=admin_headers,
    )
    assert customize_resp.status_code == 200, customize_resp.text
    customized_form = customize_resp.json()["form"]
    assert customized_form["version"] == 2
    assert customized_form["title"] == "Patient KYC Form - Enhanced"
    assert len(customized_form["fields"]) == 3

    # Form fetch retrieves latest published version (v2)
    get_v2 = client.get(f"/forms/{form_id}", headers=user_headers)
    assert get_v2.status_code == 200
    assert get_v2.json()["form"]["version"] == 2

    # Fetching explicit previous version v1
    get_v1 = client.get(f"/forms/{form_id}?version=1", headers=user_headers)
    assert get_v1.status_code == 200
    assert get_v1.json()["form"]["version"] == 1


# ── 3. Draft Service & Provenance Tracking Tests ─────────────────────────


def test_draft_autosave_provenance_and_occ_conflict(test_setup):
    user_headers = test_setup["user_headers"]
    draft_id = f"dft_{uuid.uuid4().hex[:12]}"
    form_id = "frm_test_draft"

    # Seed test form
    client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Draft Test Form",
            "fields": [{"fieldKey": "sample", "type": "text", "label": "Sample", "required": False}],
            "publish": True,
        },
        headers=test_setup["super_headers"],
    )

    # 1. Initial autosave creates draft with v1
    draft_payload_1 = {
        "form_id": form_id,
        "form_version": 1,
        "data": {"sample": "Extracted via OCR"},
        "provenance": {
            "/sample": {
                "source": "doc",
                "confidence": 0.98,
                "sourceRef": "doc_dl_front.pdf",
                "capturedAt": "2026-10-09T05:00:00Z",
                "verifiedByUser": True,
            }
        },
    }

    save_resp_1 = client.put(f"/drafts/{draft_id}", json=draft_payload_1, headers=user_headers)
    assert save_resp_1.status_code == 200
    assert save_resp_1.headers["ETag"] == 'W/"v1"'
    assert save_resp_1.json()["draft"]["version"] == 1

    # 2. Subsequent autosave from Voice input with ETag If-Match: W/"v1" -> advances to v2
    draft_payload_2 = {
        "form_id": form_id,
        "form_version": 1,
        "data": {"sample": "Corrected via Voice"},
        "provenance": {
            "/sample": {
                "source": "voice",
                "confidence": 0.91,
                "sourceRef": "audio_stream_44",
                "capturedAt": "2026-10-09T05:01:00Z",
                "verifiedByUser": False,
            }
        },
    }

    save_resp_2 = client.put(
        f"/drafts/{draft_id}",
        json=draft_payload_2,
        headers={**user_headers, "If-Match": 'W/"v1"'},
    )
    assert save_resp_2.status_code == 200
    assert save_resp_2.headers["ETag"] == 'W/"v2"'
    assert save_resp_2.json()["draft"]["version"] == 2

    # 3. OCC Race Condition: Stale write using If-Match W/"v1" triggers 409 Conflict
    stale_write = client.put(
        f"/drafts/{draft_id}",
        json=draft_payload_1,
        headers={**user_headers, "If-Match": 'W/"v1"'},
    )
    assert stale_write.status_code == 409
    conflict_json = stale_write.json()
    assert conflict_json["code"] == "DRAFT_VERSION_CONFLICT"
    assert conflict_json["clientVersion"] == 1
    assert conflict_json["serverVersion"] == 2


# ── 4. Submission Service & Dynamic Validation Tests ────────────────────


def test_submission_dynamic_validation_regex_and_required(test_setup):
    user_headers = test_setup["user_headers"]
    form_id = f"frm_kyc_sub_{uuid.uuid4().hex[:6]}"

    # Admin registers form requiring nationalId (regex ^[A-Z]{2}\\d{6}$) and annualIncome (number)
    client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Loan Application",
            "fields": [
                {
                    "fieldKey": "nationalId",
                    "type": "text",
                    "label": "National ID",
                    "required": True,
                    "validation": {"regex": r"^[A-Z]{2}\d{6}$"},
                },
                {
                    "fieldKey": "annualIncome",
                    "type": "number",
                    "label": "Annual Income",
                    "required": True,
                    "validation": {"min": 5000},
                },
            ],
            "publish": True,
        },
        headers=test_setup["admin_headers"],
    )

    idempotency_key = str(uuid.uuid4())

    # Case A: Missing required field
    missing_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"nationalId": "AB123456"},  # Missing annualIncome
        },
        headers={**user_headers, "Idempotency-Key": idempotency_key},
    )
    assert missing_resp.status_code == 422
    assert missing_resp.json()["code"] == "MISSING_REQUIRED_FIELDS"

    # Case B: Regex validation failure
    regex_fail_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"nationalId": "123INVALID", "annualIncome": 55000},
        },
        headers={**user_headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert regex_fail_resp.status_code == 422
    assert regex_fail_resp.json()["code"] == "FIELD_REGEX_MISMATCH"

    # Case C: Valid submission succeeds (201 Created)
    valid_key = str(uuid.uuid4())
    success_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"nationalId": "AB123456", "annualIncome": 85000},
            "provenance": {
                "/nationalId": {"source": "doc", "confidence": 0.99, "sourceRef": "id_card.png"}
            },
        },
        headers={**user_headers, "Idempotency-Key": valid_key},
    )
    assert success_resp.status_code == 201, success_resp.text
    app_data = success_resp.json()["application"]
    app_id = app_data["applicationId"]
    assert app_data["status"] == "SUBMITTED"
    assert app_data["data"]["nationalId"] == "AB123456"

    # Case D: Idempotency Replay with identical payload returns cached 201
    replay_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"nationalId": "AB123456", "annualIncome": 85000},
        },
        headers={**user_headers, "Idempotency-Key": valid_key},
    )
    assert replay_resp.status_code == 201
    assert replay_resp.json()["application"]["applicationId"] == app_id

    # Case E: Idempotency Key reused with different payload returns 422 Mismatch
    mismatch_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"nationalId": "XY999999", "annualIncome": 90000},
        },
        headers={**user_headers, "Idempotency-Key": valid_key},
    )
    assert mismatch_resp.status_code == 422
    assert mismatch_resp.json()["code"] == "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"


def test_application_multi_tier_query_views(test_setup):
    super_headers = test_setup["super_headers"]
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]

    # End user queries /applications
    user_apps = client.get("/applications", headers=user_headers)
    assert user_apps.status_code == 200
    assert isinstance(user_apps.json()["applications"], list)

    # Org Admin queries /applications
    admin_apps = client.get("/applications", headers=admin_headers)
    assert admin_apps.status_code == 200
    assert isinstance(admin_apps.json()["applications"], list)

    # Non-super admin calling /applications/all returns 403 Forbidden
    forbidden_all = client.get("/applications/all", headers=admin_headers)
    assert forbidden_all.status_code == 403

    # Super Admin calling /applications/all succeeds
    super_all = client.get("/applications/all", headers=super_headers)
    assert super_all.status_code == 200
    assert isinstance(super_all.json()["applications"], list)


def test_email_field_type_validation_and_registration(test_setup):
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]
    form_id = f"frm_email_{uuid.uuid4().hex[:8]}"

    # 1. Admin creates form with dedicated "email" field type
    create_resp = client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Email Test Form",
            "description": "Form with email field",
            "publish": True,
            "fields": [
                {
                    "fieldKey": "applicant_email",
                    "type": "email",
                    "label": "Applicant Email",
                    "required": True,
                }
            ],
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()["form"]
    assert created["fields"][0]["type"] == "email"

    # 2. Submitting without "@" fails with 422 FieldConstraintError
    bad_sub = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"applicant_email": "myemailwithoutat"},
        },
        headers={**user_headers, "Idempotency-Key": f"idem_{uuid.uuid4().hex}"},
    )
    assert bad_sub.status_code == 422
    assert "email" in bad_sub.text
    assert "@" in bad_sub.text

    # 3. Submitting with valid email succeeds
    good_sub = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"applicant_email": "jane.doe@example.com"},
        },
        headers={**user_headers, "Idempotency-Key": f"idem_{uuid.uuid4().hex}"},
    )
    assert good_sub.status_code == 201

    # 4. Provisioning/registering user with invalid email without "@" fails with 400
    bad_reg = client.post(
        "/auth/register",
        json={
            "full_name": "Invalid Email User",
            "email": "notanemail",
            "password": "Password123!",
            "date_of_birth": "1995-01-01",
            "phone_number": "+14155552671",
            "organization_id": test_setup["org_admin"]["organization_id"],
            "role": "user",
        },
    )
    assert bad_reg.status_code == 400
    assert "@" in bad_reg.json()["detail"]
