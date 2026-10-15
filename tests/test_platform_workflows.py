"""
Integration and workflow test suite for:
1. User Management Service (UserService)
2. Form Definition Service (FormService) - with Admin Customization
3. Draft Service (DraftService) - with Field Provenance & OCC
4. Submission Service (SubmissionService) - with Schema Execution & Idempotency
"""

import asyncio
import importlib
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ai_filler.main import app

main_module = importlib.import_module("ai_filler.main")
from ai_filler.auth.service import create_super_admin, create_organization_admin
from ai_filler.groq_client import (
    build_voice_transcription_prompt,
    synthesize_english_speech,
    transcribe_audio,
)

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




def test_form_fill_uploads_enforce_size_limit(monkeypatch):
    monkeypatch.setattr(main_module, "MAX_UPLOAD_BYTES", 4)
    async def save_oversized_upload():
        async def read(_size):
            return b"12345"
        upload = SimpleNamespace(filename="profile.pdf", read=read)
        await main_module._save_document_upload_to_temp(upload)

    with pytest.raises(HTTPException) as error:
        asyncio.run(save_oversized_upload())
    assert error.value.status_code == 413


def test_browser_audio_upload_checks_signature_and_size(monkeypatch, tmp_path):
    valid_webm = b"\x1aE\xdf\xa3audio"
    audio_path = tmp_path / "answer.webm"
    audio_path.write_bytes(valid_webm)
    assert main_module._audio_signature_matches(audio_path, ".webm")
    assert not main_module._audio_signature_matches(audio_path, ".wav")

    monkeypatch.setattr(main_module, "MAX_UPLOAD_BYTES", 4)

    async def save_oversized_audio():
        async def read(_size):
            return valid_webm

        upload = SimpleNamespace(filename="answer.webm", read=read)
        await main_module._save_voice_upload_to_temp(upload)

    with pytest.raises(HTTPException) as error:
        asyncio.run(save_oversized_audio())
    assert error.value.status_code == 413


def test_voice_transcription_prompt_stays_within_whisper_budget():
    prompt = build_voice_transcription_prompt(
        form_title="A very long form title " * 30,
        field_label="Full legal name " * 30,
        options=["Engineering", "Sales", "Finance"],
    )
    assert len(prompt) <= 450
    assert prompt.startswith("Transcribe faithfully; do not translate.")
    assert "do not translate" in prompt
    assert "Tanglish" in prompt


def test_groq_voice_clients_use_configured_models_without_network(tmp_path):
    calls = {}

    class FakeTranscriptions:
        def create(self, **kwargs):
            calls["transcription"] = kwargs
            return "தமிழ் Tanglish answer. Thank you for watching."

    class FakeSpeech:
        def create(self, **kwargs):
            calls["speech"] = kwargs
            return SimpleNamespace(content=b"RIFFaudio")

    fake_client = SimpleNamespace(
        audio=SimpleNamespace(
            transcriptions=FakeTranscriptions(),
            speech=FakeSpeech(),
        )
    )
    recording = tmp_path / "answer.webm"
    recording.write_bytes(b"\x1aE\xdf\xa3audio")

    transcript = transcribe_audio(
        file_path=str(recording), language=None, prompt="Form answer context", client=fake_client
    )
    speech = synthesize_english_speech(text="What is your name?", voice="hannah", client=fake_client)

    assert transcript == "தமிழ் Tanglish answer."
    assert calls["transcription"]["model"] == "whisper-large-v3"
    assert calls["transcription"]["language"] is None
    assert calls["transcription"]["temperature"] == 0.0
    assert calls["speech"]["model"] == "canopylabs/orpheus-v1-english"
    assert calls["speech"]["voice"] == "hannah"
    assert calls["speech"]["input"] == "What is your name?"
    assert speech == b"RIFFaudio"

    synthesize_english_speech(text="x" * 200, voice="hannah", client=fake_client)
    assert len(calls["speech"]["input"]) == 200
    with pytest.raises(ValueError):
        synthesize_english_speech(text="x" * 201, voice="hannah", client=fake_client)


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

    # 2. Subsequent autosave with ETag If-Match: W/"v1" -> advances to v2
    draft_payload_2 = {
        "form_id": form_id,
        "form_version": 1,
        "data": {"sample": "Corrected manually"},
        "provenance": {
            "/sample": {
                "source": "manual",
                "confidence": 0.91,
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


def test_available_forms_published_visibility_and_empty_state(test_setup):
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]

    # 1. Independent user without an organization registers and logs in
    indep_client = TestClient(app)
    indep_email = f"indep_{uuid.uuid4().hex[:6]}@example.com"
    reg_resp = indep_client.post(
        "/auth/signup",
        json={
            "full_name": "Independent User",
            "email": indep_email,
            "password": "Password123!",
            "date_of_birth": "1994-03-15",
            "phone_number": "+14155558899",
        },
    )
    assert reg_resp.status_code == 200
    login_resp = indep_client.post(
        "/auth/user/login",
        json={"identifier": indep_email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200

    # 2. Before any forms are published, or for a draft form
    draft_form_id = f"frm_draft_{uuid.uuid4().hex[:8]}"
    create_draft_resp = client.post(
        "/forms",
        json={
            "form_id": draft_form_id,
            "title": "Unpublished Draft Form",
            "description": "Internal work in progress",
            "fields": [{"fieldKey": "notes", "type": "text", "label": "Notes", "required": False}],
            "publish": False,
        },
        headers=admin_headers,
    )
    assert create_draft_resp.status_code == 201

    # End users must NOT see the unpublished draft form
    indep_forms_resp = indep_client.get("/forms")
    assert indep_forms_resp.status_code == 200
    indep_form_ids = [f["formId"] for f in indep_forms_resp.json()["forms"]]
    assert draft_form_id not in indep_form_ids

    # 3. Admin publishes a new form
    published_form_id = f"frm_pub_{uuid.uuid4().hex[:8]}"
    create_pub_resp = client.post(
        "/forms",
        json={
            "form_id": published_form_id,
            "title": "Job Application 2026",
            "description": "Please complete all personal and contact details",
            "fields": [
                {"fieldKey": "applicant_name", "type": "text", "label": "Full Name", "required": True},
                {"fieldKey": "applicant_email", "type": "email", "label": "Email Address", "required": True},
            ],
            "publish": True,
        },
        headers=admin_headers,
    )
    assert create_pub_resp.status_code == 201

    # 4. User immediately sees the newly published form
    user_forms_resp = client.get("/forms", headers=user_headers)
    assert user_forms_resp.status_code == 200
    user_forms = user_forms_resp.json()["forms"]
    pub_form = next((f for f in user_forms if f["formId"] == published_form_id), None)
    assert pub_form is not None
    assert pub_form["title"] == "Job Application 2026"
    assert pub_form["status"] == "published"
    assert len(pub_form["fields"]) == 2

    # Independent user also sees the published form
    indep_forms_resp2 = indep_client.get("/forms")
    assert indep_forms_resp2.status_code == 200
    indep_pub_form = next((f for f in indep_forms_resp2.json()["forms"] if f["formId"] == published_form_id), None)
    assert indep_pub_form is not None
    assert indep_pub_form["title"] == "Job Application 2026"

    # 5. User submits application for the published form
    csrf_token = indep_client.cookies.get("csrf_token", "")
    sub_resp = indep_client.post(
        "/applications",
        json={
            "form_id": published_form_id,
            "form_version": 1,
            "data": {
                "applicant_name": "Independent User",
                "applicant_email": indep_email,
            },
        },
        headers={
            "Idempotency-Key": f"idem_{uuid.uuid4().hex}",
            "X-CSRF-Token": csrf_token,
        },
    )
    assert sub_resp.status_code == 201
    assert sub_resp.json()["application"]["status"] == "SUBMITTED"


def test_admin_submissions_list_and_status_update(test_setup):
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]

    # 1. Admin creates and publishes a new form
    form_id = f"frm_rev_{uuid.uuid4().hex[:8]}"
    create_resp = client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Onboarding Review Form",
            "description": "Form for review testing",
            "fields": [
                {"fieldKey": "applicant_name", "type": "text", "label": "Full Name", "required": True},
                {"fieldKey": "experience_years", "type": "number", "label": "Years of Experience", "required": False},
            ],
            "publish": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 201

    # 2. User submits an application
    sub_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {
                "applicant_name": "Jane Doe",
                "experience_years": 5,
            },
        },
        headers={
            **user_headers,
            "Idempotency-Key": f"idem_{uuid.uuid4().hex}",
        },
    )
    assert sub_resp.status_code == 201
    application_id = sub_resp.json()["application"]["applicationId"]
    assert sub_resp.json()["application"]["status"] == "SUBMITTED"

    # 3. Admin retrieves applications list and verifies enriched metadata
    list_resp = client.get("/applications", headers=admin_headers)
    assert list_resp.status_code == 200
    apps = list_resp.json()["applications"]
    target_app = next((a for a in apps if a["applicationId"] == application_id), None)
    assert target_app is not None
    assert target_app["formTitle"] == "Onboarding Review Form"
    assert target_app["userName"] == "Jane Doe"
    assert target_app["userEmail"] == "jane@example.com"
    assert target_app["status"] == "SUBMITTED"

    # 4. Admin updates status to UNDER_REVIEW
    patch_resp1 = client.patch(
        f"/applications/{application_id}/status",
        json={"status": "UNDER_REVIEW"},
        headers=admin_headers,
    )
    assert patch_resp1.status_code == 200
    assert patch_resp1.json()["application"]["status"] == "UNDER_REVIEW"

    # 5. Admin updates status to APPROVED
    patch_resp2 = client.patch(
        f"/applications/{application_id}/status",
        json={"status": "APPROVED"},
        headers=admin_headers,
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["application"]["status"] == "APPROVED"

    # 6. Admin updates status to REJECTED
    patch_resp3 = client.patch(
        f"/applications/{application_id}/status",
        json={"status": "REJECTED"},
        headers=admin_headers,
    )
    assert patch_resp3.status_code == 200
    assert patch_resp3.json()["application"]["status"] == "REJECTED"

    # 7. Validation: Invalid status fails with 400
    invalid_resp = client.patch(
        f"/applications/{application_id}/status",
        json={"status": "INVALID_STATUS"},
        headers=admin_headers,
    )
    assert invalid_resp.status_code == 400
    assert "Invalid status" in invalid_resp.json()["detail"]

    # 8. RBAC: Regular user cannot update application status (403)
    user_patch_resp = client.patch(
        f"/applications/{application_id}/status",
        json={"status": "APPROVED"},
        headers=user_headers,
    )
    assert user_patch_resp.status_code == 403

    # 9. 404 for non-existent application
    not_found_resp = client.patch(
        "/applications/non_existent_app_9999/status",
        json={"status": "APPROVED"},
        headers=admin_headers,
    )
    assert not_found_resp.status_code == 404


def test_user_profile_edit_and_password_change(test_setup):
    user_headers = test_setup["user_headers"]
    user_id = test_setup["user"]["id"]

    # 1. Fetch current profile via /users/me
    me_resp = client.get("/users/me", headers=user_headers)
    assert me_resp.status_code == 200
    user_data = me_resp.json()["user"]
    assert user_data["id"] == user_id
    assert user_data["email"] == "jane@example.com"
    assert user_data["organization_name"] == "Apex Healthcare"

    # 2. Update profile via PATCH /users/me
    new_email = f"jane_updated_{uuid.uuid4().hex[:6]}@example.com"
    patch_resp = client.patch(
        "/users/me",
        json={
            "full_name": "Jane D. Updated",
            "email": new_email,
            "phone_number": "+14155559999",
            "date_of_birth": "1994-06-15",
        },
        headers=user_headers,
    )
    assert patch_resp.status_code == 200
    updated_user = patch_resp.json()["user"]
    assert updated_user["full_name"] == "Jane D. Updated"
    assert updated_user["email"] == new_email
    assert updated_user["phone_number"] == "+14155559999"
    assert updated_user["date_of_birth"] == "1994-06-15"

    # 3. Validation: Duplicate email rejected
    dup_resp = client.patch(
        "/users/me",
        json={"email": test_setup["org_admin"]["email"]},
        headers=user_headers,
    )
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]

    # 4. Validation: Invalid phone rejected
    invalid_phone_resp = client.patch(
        "/users/me",
        json={"phone_number": "invalid-phone"},
        headers=user_headers,
    )
    assert invalid_phone_resp.status_code == 400
    assert "E.164" in invalid_phone_resp.json()["detail"]

    # 5. Validation: Underage date of birth rejected
    underage_resp = client.patch(
        "/users/me",
        json={"date_of_birth": "2015-01-01"},
        headers=user_headers,
    )
    assert underage_resp.status_code == 400
    assert "at least 18 years old" in underage_resp.json()["detail"]

    # 6. Change Password: Wrong current password fails
    wrong_pwd_resp = client.post(
        "/auth/change-password",
        json={
            "current_password": "WrongPassword!",
            "new_password": "NewUserPassword123!",
        },
        headers=user_headers,
    )
    assert wrong_pwd_resp.status_code == 400
    assert "incorrect" in wrong_pwd_resp.json()["detail"]

    # 7. Change Password: Short password (< 8 chars) fails
    short_pwd_resp = client.post(
        "/auth/change-password",
        json={
            "current_password": "UserPassword123!",
            "new_password": "short",
        },
        headers=user_headers,
    )
    assert short_pwd_resp.status_code == 400
    assert "at least 8 characters" in short_pwd_resp.json()["detail"]

    # 8. Change Password: Success
    change_resp = client.post(
        "/auth/change-password",
        json={
            "current_password": "UserPassword123!",
            "new_password": "BrandNewPassword123!",
        },
        headers=user_headers,
    )
    assert change_resp.status_code == 200
    assert change_resp.json()["status"] == "ok"

    # 9. Verify login with new email and new password
    login_resp = client.post(
        "/auth/user/login",
        json={"identifier": new_email, "password": "BrandNewPassword123!"},
    )
    assert login_resp.status_code == 200


def test_admin_profile_edit_and_organization_update(test_setup):
    admin_headers = test_setup["admin_headers"]

    # 1. Admin gets own profile via /users/me
    admin_me_resp = client.get("/users/me", headers=admin_headers)
    assert admin_me_resp.status_code == 200
    admin_profile = admin_me_resp.json()["user"]
    assert admin_profile["admin_id"] == "ADM-APEX01"
    assert admin_profile["organization_name"] == "Apex Healthcare"

    # 2. Admin edits profile & updates organization name
    new_admin_email = f"apex_lead_{uuid.uuid4().hex[:6]}@apex.com"
    new_org_name = f"Apex Medical Group {uuid.uuid4().hex[:4]}"
    patch_admin_resp = client.patch(
        "/users/me",
        json={
            "full_name": "Dr. Apex Senior",
            "email": new_admin_email,
            "phone_number": "+14155558888",
            "organization_name": new_org_name,
        },
        headers=admin_headers,
    )
    assert patch_admin_resp.status_code == 200
    updated_admin = patch_admin_resp.json()["user"]
    assert updated_admin["full_name"] == "Dr. Apex Senior"
    assert updated_admin["email"] == new_admin_email
    assert updated_admin["phone_number"] == "+14155558888"
    assert updated_admin["organization_name"] == new_org_name

    # 3. Admin changes password
    change_resp = client.post(
        "/auth/change-password",
        json={
            "current_password": "AdminPassword123!",
            "new_password": "NewAdminPassword123!",
        },
        headers=admin_headers,
    )
    assert change_resp.status_code == 200

    # 4. Admin logs in with ADM-APEX01 and new password
    admin_login_resp = client.post(
        "/auth/admin/login",
        json={"identifier": "ADM-APEX01", "password": "NewAdminPassword123!"},
    )
    assert admin_login_resp.status_code == 200


def test_super_admin_governance_of_organizations_and_admins(test_setup):
    super_headers = test_setup["super_headers"]
    user_headers = test_setup["user_headers"]

    # 1. Super Admin lists organizations
    list_orgs_resp = client.get("/organizations", headers=super_headers)
    assert list_orgs_resp.status_code == 200
    orgs = list_orgs_resp.json()["organizations"]
    assert len(orgs) >= 1
    apex_org = next((o for o in orgs if "Apex" in o["name"]), None)
    assert apex_org is not None
    assert apex_org["adminCount"] >= 1

    # 2. Super Admin creates a new organization
    new_org_name = f"BioTech Enterprise {uuid.uuid4().hex[:4]}"
    create_org_resp = client.post(
        "/organizations",
        json={"name": new_org_name},
        headers=super_headers,
    )
    assert create_org_resp.status_code == 201
    created_org = create_org_resp.json()["organization"]
    org_id = created_org["id"]
    assert created_org["name"] == new_org_name

    # 3. Super Admin updates/renames an organization
    renamed_org = f"BioTech Global {uuid.uuid4().hex[:4]}"
    update_org_resp = client.patch(
        f"/organizations/{org_id}",
        json={"name": renamed_org},
        headers=super_headers,
    )
    assert update_org_resp.status_code == 200
    assert update_org_resp.json()["organization"]["name"] == renamed_org

    # 4. Super Admin lists organization admins
    list_admins_resp = client.get("/auth/super/organization-admins", headers=super_headers)
    assert list_admins_resp.status_code == 200
    admins = list_admins_resp.json()["admins"]
    assert len(admins) >= 1
    target_admin = admins[0]
    target_admin_id = target_admin["id"]

    # 5. Super Admin updates admin details (e.g. phone, full name, is_active)
    update_admin_resp = client.patch(
        f"/auth/super/organization-admins/{target_admin_id}",
        json={"phone_number": "+14155557777", "full_name": "Updated Admin Leader"},
        headers=super_headers,
    )
    assert update_admin_resp.status_code == 200
    assert update_admin_resp.json()["admin"]["fullName"] == "Updated Admin Leader"
    assert update_admin_resp.json()["admin"]["phoneNumber"] == "+14155557777"

    # 6. Super Admin resets admin's password
    reset_pwd_resp = client.post(
        f"/auth/super/organization-admins/{target_admin_id}/reset-password",
        json={"new_password": "TemporaryAdmin123!"},
        headers=super_headers,
    )
    assert reset_pwd_resp.status_code == 200
    assert reset_pwd_resp.json()["status"] == "ok"

    # 7. Admin can now sign in with the reset password
    admin_login_resp = client.post(
        "/auth/admin/login",
        json={"identifier": target_admin["adminId"], "password": "TemporaryAdmin123!"},
    )
    assert admin_login_resp.status_code == 200

    # 8. RBAC: Regular user is forbidden from super admin endpoints
    forbidden_org_create = client.post("/organizations", json={"name": "Hacker Org"}, headers=user_headers)
    assert forbidden_org_create.status_code == 403
    forbidden_admins = client.get("/auth/super/organization-admins", headers=user_headers)
    assert forbidden_admins.status_code == 403


def test_multi_agent_admin_form_generation_and_user_form_filling(test_setup, monkeypatch):
    import json as _json
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]

    # Disable external Groq network calls in unit test so deterministic + critic pipeline is tested deterministically
    monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", lambda *args, **kwargs: None)

    # 1. Admin generates a form schema via Multi-Agent Document Upload (/ai/generate-form/document)
    questionnaire_doc = (
        "Title: Senior Engineer Application\n"
        "Description: Engineering candidate evaluation form.\n"
        "Full Legal Name *:\n"
        "Contact Email *:\n"
        "Date of Birth:\n"
        "Years of Experience:\n"
        "Department: [Engineering, Product, Design]\n"
        "Core Skills (select all that apply): [Python, React, SQL, Docker]\n"
    )
    gen_doc_resp = client.post(
        "/ai/generate-form/document",
        files=[("files", ("questionnaire.txt", questionnaire_doc.encode("utf-8"), "text/plain"))],
        headers=admin_headers,
    )
    assert gen_doc_resp.status_code == 200
    gen_data = gen_doc_resp.json()
    assert gen_data["accuracy_score"] >= 98.0
    assert len(gen_data["agent_trace"]) == 3
    assert len(gen_data["fields"]) >= 5

    # 2. Admin saves and publishes the AI-generated form via POST /forms
    form_id = f"frm_ai_{uuid.uuid4().hex[:6]}"
    create_form_resp = client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": gen_data["title"],
            "description": gen_data["description"],
            "fields": gen_data["fields"],
            "publish": True,
        },
        headers=admin_headers,
    )
    assert create_form_resp.status_code == 201
    published_fields = create_form_resp.json()["form"]["fields"]

    # 3. User fills the form using Multi-Agent text endpoint (/ai/fill-form/text)
    spoken_dictation = (
        "Full Legal Name: Alex Rivera\n"
        "Contact Email: alex.rivera at techcorp dot io\n"
        "Date of Birth: May 14, 1995\n"
        "Years of Experience: 8\n"
        "Department: engineering\n"
        "Core Skills: Python and React\n"
    )
    fill_text_resp = client.post(
        "/ai/fill-form/text",
        json={
            "text": spoken_dictation,
            "fields": published_fields,
            "form_title": gen_data["title"],
            "source_type": "AI_TEXT",
        },
        headers=user_headers,
    )
    assert fill_text_resp.status_code == 200
    filled = fill_text_resp.json()
    assert filled["accuracy_score"] >= 98.0
    assert len(filled["agent_trace"]) == 3

    extracted_fields = filled["fields"]
    # Verify spoken email normalization ("at" -> "@", "dot" -> ".") and date normalization ("May 14, 1995" -> "1995-05-14")
    email_key = next(f["fieldKey"] for f in published_fields if f["type"] == "email")
    date_key = next(f["fieldKey"] for f in published_fields if f["type"] == "date")
    dropdown_key = next(f["fieldKey"] for f in published_fields if f["type"] == "dropdown")
    multi_key = next(f["fieldKey"] for f in published_fields if f["type"] == "multiselect")

    assert extracted_fields[email_key] == "alex.rivera@techcorp.io"
    assert extracted_fields[date_key] == "1995-05-14"
    assert extracted_fields[dropdown_key] == "Engineering"
    assert set(extracted_fields[multi_key]) == {"Python", "React"}

    # 4. User fills the form via Multi-Agent Document Upload (/ai/fill-form/document)
    applicant_doc = (
        "Full Legal Name: Alex Rivera\n"
        "Contact Email: alex.rivera@techcorp.io\n"
        "Date of Birth: 1995-05-14\n"
        "Years of Experience: 8\n"
        "Department: Engineering\n"
        "Core Skills: Python, React, SQL\n"
    )
    fill_doc_resp = client.post(
        "/ai/fill-form/document",
        data={
            "fields_json": _json.dumps(published_fields),
            "form_title": gen_data["title"],
        },
        files=[("files", ("applicant_resume.txt", applicant_doc.encode("utf-8"), "text/plain"))],
        headers=user_headers,
    )
    assert fill_doc_resp.status_code == 200
    doc_filled = fill_doc_resp.json()
    assert doc_filled["accuracy_score"] >= 98.0
    assert doc_filled["fields"][email_key] == "alex.rivera@techcorp.io"
    assert "Python" in doc_filled["fields"][multi_key]

    # 5. User submits the AI-filled application with provenance to POST /applications
    sub_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": doc_filled["fields"],
            "provenance": doc_filled["provenance"],
        },
        headers={
            **user_headers,
            "Idempotency-Key": f"idem_ai_{uuid.uuid4().hex}",
        },
    )
    assert sub_resp.status_code == 201
    assert sub_resp.json()["application"]["status"] == "SUBMITTED"




def test_tamil_slang_and_tanglish_multi_agent_form_filling(test_setup, monkeypatch):
    import json as _json

    user_headers = test_setup["user_headers"]
    monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", lambda *args, **kwargs: None)

    fields = [
        {"fieldKey": "full_name", "label": "Full Legal Name", "type": "text", "required": True},
        {"fieldKey": "contact_email", "label": "Contact Email", "type": "email", "required": True},
        {"fieldKey": "age", "label": "Applicant Age", "type": "number", "required": False},
        {"fieldKey": "dob", "label": "Date of Birth", "type": "date", "required": False},
        {
            "fieldKey": "department",
            "label": "Department",
            "type": "dropdown",
            "required": True,
            "validation": {"options": ["Engineering", "Sales", "Marketing", "HR"]},
        },
        {
            "fieldKey": "skills",
            "label": "Core Skills",
            "type": "multiselect",
            "required": False,
            "validation": {"options": ["Python", "React", "SQL", "Docker"]},
        },
    ]

    # 1. Colloquial Tanglish / Tamil Slang text input (including mid-sentence "illa illa" self-correction)
    tanglish_slang_dictation = (
        "Machi en peru Karthik Kumar da\n"
        "en email vandhu karthik dot kumar at gmail dot com\n"
        "en vayasu vandhu 25 illa illa iruvathi ettu\n"
        "pirantha thethi: 15 august 1998\n"
        "department vandhu sales illa engineering la irukken\n"
        "skills vandhu Python-um React-um theriyum pa\n"
    )

    resp = client.post(
        "/ai/fill-form/text",
        json={
            "text": tanglish_slang_dictation,
            "fields": fields,
            "form_title": "Employee Onboarding",
            "source_type": "AI_TEXT",
        },
        headers=user_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    extracted = data["fields"]
    assert extracted["full_name"] == "Karthik Kumar"
    assert extracted["contact_email"] == "karthik.kumar@gmail.com"
    assert extracted["age"] == 28
    assert extracted["dob"] == "1998-08-15"
    assert extracted["department"] == "Engineering"
    assert set(extracted["skills"]) == {"Python", "React"}

    # 2. Native Tamil script text input
    tamil_script_dictation = (
        "என் பெயர்: கார்த்திக் குமார்\n"
        "மின்னஞ்சல்: karthik.kumar@gmail.com\n"
        "வயது: இருபத்தி எட்டு\n"
        "பிறந்த தேதி: 15 ஆகஸ்ட் 1998\n"
        "துறை: பொறியியல்\n"
        "திறன்கள்: பைதான் மற்றும் ரியாக்ட்\n"
    )
    resp_ta = client.post(
        "/ai/fill-form/text",
        json={
            "text": tamil_script_dictation,
            "fields": fields,
            "form_title": "Employee Onboarding",
            "source_type": "AI_TEXT",
        },
        headers=user_headers,
    )
    assert resp_ta.status_code == 200
    extracted_ta = resp_ta.json()["fields"]
    assert extracted_ta["full_name"] == "கார்த்திக் குமார்"
    assert extracted_ta["contact_email"] == "karthik.kumar@gmail.com"
    assert extracted_ta["age"] == 28
    assert extracted_ta["dob"] == "1998-08-15"
    assert extracted_ta["department"] == "Engineering"
    assert set(extracted_ta["skills"]) == {"Python", "React"}



def test_tamil_slang_admin_form_schema_generation(test_setup, monkeypatch):
    admin_headers = test_setup["admin_headers"]
    monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", lambda *args, **kwargs: None)

    tanglish_schema_prompt = (
        "Create a Candidate Application form with Full Name, Email Address, "
        "Vayasu, Department dropdown with Engineering, Sales, HR, "
        "and Skills multiselect with Python, React, SQL"
    )
    resp = client.post(
        "/ai/generate-form/text",
        json={
            "text": tanglish_schema_prompt,
            "source_type": "AI_TEXT",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    schema = resp.json()
    assert schema["accuracy_score"] >= 98.0
    field_types = {f["fieldKey"]: f["type"] for f in schema["fields"]}
    assert "email" in field_types.values()
    assert "number" in field_types.values()
    assert "dropdown" in field_types.values()
    assert "multiselect" in field_types.values()


def test_user_form_review_and_status_tracking(test_setup):
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]
    form_id = f"frm_status_track_{uuid.uuid4().hex[:6]}"

    # 1. Admin creates and publishes a form
    create_resp = client.post(
        "/forms",
        json={
            "form_id": form_id,
            "title": "Scholarship Review Form",
            "description": "Trackable application form",
            "publish": True,
            "fields": [
                {"fieldKey": "applicant_name", "label": "Applicant Name", "type": "text", "required": True},
                {"fieldKey": "email", "label": "Email Address", "type": "email", "required": True},
            ],
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 201

    # 2. User submits the form with AI text assistance provenance
    sub_resp = client.post(
        "/applications",
        json={
            "form_id": form_id,
            "form_version": 1,
            "data": {"applicant_name": "Karthik Raja", "email": "karthik.raja@example.com"},
            "provenance": {
                "applicant_name": {"source": "AI_TEXT", "confidence": 0.99},
                "email": {"source": "AI_DOCUMENT", "confidence": 0.98},
            },
        },
        headers={**user_headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert sub_resp.status_code == 201
    app_id = sub_resp.json()["application"]["applicationId"]

    # 3. User reviews their submitted forms list (GET /applications) -> status is SUBMITTED & provenance is included
    user_list_resp = client.get("/applications", headers=user_headers)
    assert user_list_resp.status_code == 200
    my_apps = user_list_resp.json()["applications"]
    my_sub = next((a for a in my_apps if a["applicationId"] == app_id), None)
    assert my_sub is not None
    assert my_sub["formTitle"] == "Scholarship Review Form"
    assert my_sub["status"] == "SUBMITTED"
    assert my_sub["data"]["applicant_name"] == "Karthik Raja"
    assert my_sub["provenance"]["applicant_name"]["source"] == "AI_TEXT"

    # 4. Admin updates status to UNDER_REVIEW and then APPROVED
    patch_review = client.patch(
        f"/applications/{app_id}/status",
        json={"status": "UNDER_REVIEW"},
        headers=admin_headers,
    )
    assert patch_review.status_code == 200
    assert patch_review.json()["application"]["status"] == "UNDER_REVIEW"

    # User checks individual application review endpoint (GET /applications/{id})
    detail_resp = client.get(f"/applications/{app_id}", headers=user_headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["application"]["status"] == "UNDER_REVIEW"
    assert detail_resp.json()["application"]["provenance"]["email"]["source"] == "AI_DOCUMENT"

    patch_approve = client.patch(
        f"/applications/{app_id}/status",
        json={"status": "APPROVED"},
        headers=admin_headers,
    )
    assert patch_approve.status_code == 200

    # User refreshes list and sees APPROVED status
    final_list = client.get("/applications", headers=user_headers).json()["applications"]
    final_sub = next(a for a in final_list if a["applicationId"] == app_id)
    assert final_sub["status"] == "APPROVED"






def test_production_logging_correlation_id_and_pii_redaction(test_setup):
    from ai_filler.logging_utils import (
        clear_telemetry_events,
        get_recent_telemetry_events,
        log_structured_event,
        redact_pii,
    )

    clear_telemetry_events()
    user_headers = test_setup["user_headers"]
    custom_corr_id = "corr_qa_observability_2026"

    # 1. Verify X-Correlation-ID header round-trip and HTTP telemetry emission
    resp = client.get(
        "/forms",
        headers={**user_headers, "X-Correlation-ID": custom_corr_id},
    )
    assert resp.status_code == 200
    assert resp.headers.get("X-Correlation-ID") == custom_corr_id

    events = get_recent_telemetry_events(correlation_id=custom_corr_id)
    assert any(e["event"] == "http_request_completed" and e["context"]["path"] == "/forms" for e in events)

    # 2. Verify Shift-Left PII & Secret Redaction
    raw_payload = {
        "password": "SuperSecretPassword123!",
        "csrf_token": "tok_abc_123",
        "prompt": "Contact applicant at arun.kumar@techjays.com using key gsk-1234567890abcdef1234",
    }
    redacted = redact_pii(raw_payload)
    assert redacted["password"] == "[REDACTED]"
    assert redacted["csrf_token"] == "[REDACTED]"
    assert "[REDACTED_EMAIL]" in redacted["prompt"]
    assert "[REDACTED_KEY]" in redacted["prompt"]
    assert "arun.kumar@techjays.com" not in redacted["prompt"]

    ev = log_structured_event(
        "security_audit_check",
        component="qa_test",
        user_email_note="Reach out to test.user@example.org",
        api_token="secret_val",
    )
    assert ev["context"]["api_token"] == "[REDACTED]"
    assert "[REDACTED_EMAIL]" in ev["context"]["user_email_note"]


def test_admin_document_form_generation_analysis(test_setup, monkeypatch):
    """Verify AI document analysis converts realistic paper forms into dynamic schemas with exact field types and choice options."""
    admin_headers = test_setup["admin_headers"]

    # Disable external LLM calls to test deterministic + critic document parsing
    monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", lambda *args, **kwargs: None)

    realistic_doc = (
        "EMPLOYEE REGISTRATION FORM\n"
        "Please complete all details accurately before onboarding.\n\n"
        "Full Legal Name: _________________ *\n"
        "Official Email Address: _________________ *\n"
        "Date of Birth (DD/MM/YYYY): __________\n"
        "Contact Phone Number: _________________\n"
        "Gender: [ ] Male [ ] Female [ ] Other\n"
        "Department: ( ) Engineering ( ) Marketing ( ) Sales ( ) Human Resources\n"
        "Technical Skills (Check all that apply): [ ] Python [ ] React [ ] SQL [ ] Docker\n"
        "Upload Resume or CV (PDF/DOCX) *\n"
        "Years of Experience: _______\n"
    )

    resp = client.post(
        "/ai/generate-form/document",
        files=[("files", ("employee_registration.txt", realistic_doc.encode("utf-8"), "text/plain"))],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["title"] == "Employee Registration Form"
    assert "Please complete all details accurately" in data["description"]
    assert "analysis_summary" in data
    assert len(data["fields"]) == 9

    field_map = {f["label"]: f for f in data["fields"]}
    assert "Full Legal Name" in field_map
    assert field_map["Full Legal Name"]["type"] == "text"
    assert field_map["Full Legal Name"]["required"] is True

    assert "Official Email Address" in field_map
    assert field_map["Official Email Address"]["type"] == "email"

    assert "Date of Birth (DD/MM/YYYY)" in field_map
    assert field_map["Date of Birth (DD/MM/YYYY)"]["type"] == "date"

    assert "Gender" in field_map
    assert field_map["Gender"]["type"] == "dropdown"
    assert field_map["Gender"]["validation"]["options"] == ["Male", "Female", "Other"]

    assert "Department" in field_map
    assert field_map["Department"]["type"] == "dropdown"
    assert field_map["Department"]["validation"]["options"] == ["Engineering", "Marketing", "Sales", "Human Resources"]

    assert "Technical Skills" in field_map
    assert field_map["Technical Skills"]["type"] == "multiselect"
    assert field_map["Technical Skills"]["validation"]["options"] == ["Python", "React", "SQL", "Docker"]

    assert "Upload Resume or CV (PDF/DOCX)" in field_map
    assert field_map["Upload Resume or CV (PDF/DOCX)"]["type"] == "file"
    assert field_map["Upload Resume or CV (PDF/DOCX)"]["required"] is True

    assert "Years of Experience" in field_map
    assert field_map["Years of Experience"]["type"] == "number"


def test_admin_resume_to_form_generation_analysis(test_setup, monkeypatch):
    """Verify uploading a candidate Resume/CV synthesizes a tailored Job Application Form with extracted skills."""
    admin_headers = test_setup["admin_headers"]

    # Disable external LLM calls to test deterministic + critic document parsing
    monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", lambda *args, **kwargs: None)

    realistic_resume = (
        "ALEX MORGAN\n"
        "Senior Full Stack Engineer\n"
        "alex.morgan@example.com | +1 (555) 234-5678 | San Francisco, CA\n"
        "linkedin.com/in/alexmorgan | github.com/alexmorgan\n\n"
        "PROFESSIONAL SUMMARY\n"
        "Results-driven Senior Full Stack Engineer with 7+ years of experience building distributed systems,\n"
        "responsive React interfaces, and high-throughput Python microservices in enterprise cloud environments.\n\n"
        "TECHNICAL SKILLS\n"
        "Languages: Python, TypeScript, JavaScript, Go, SQL\n"
        "Frameworks & Libraries: FastAPI, React, Node.js, Next.js, Redux, TailwindCSS\n"
        "Cloud & DevOps: AWS, Docker, Kubernetes, Terraform, PostgreSQL, Redis, CI/CD\n\n"
        "WORK EXPERIENCE\n"
        "Senior Staff Engineer - Techcorp Solutions (2021 - Present)\n"
        "- Architected real-time event streaming pipeline using Kafka and FastAPI.\n"
        "- Scaled frontend React applications serving 2M daily active users.\n\n"
        "Full Stack Developer - CloudWave Inc (2018 - 2021)\n"
        "- Developed RESTful microservices and PostgreSQL database schemas.\n\n"
        "EDUCATION\n"
        "Bachelor of Science in Computer Science - University of California, Berkeley (2014 - 2018)\n"
    )

    resp = client.post(
        "/ai/generate-form/document",
        files=[("files", ("alex_morgan_resume.txt", realistic_resume.encode("utf-8"), "text/plain"))],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["document_category"] == "resume"
    assert data["document_type_label"] == "Candidate Resume / CV"
    assert "Senior Full Stack Engineer" in data["title"]
    assert "Senior Full Stack Engineer" in data["description"]
    assert "analysis_summary" in data
    assert "Candidate Resume / CV" in data["analysis_summary"]

    field_map = {f["fieldKey"]: f for f in data["fields"]}
    assert "full_name" in field_map
    assert field_map["full_name"]["type"] == "text"
    assert field_map["full_name"]["required"] is True

    assert "email_address" in field_map
    assert field_map["email_address"]["type"] == "email"
    assert field_map["email_address"]["required"] is True

    assert "phone_number" in field_map
    assert field_map["phone_number"]["type"] == "text"

    assert "highest_education" in field_map
    assert field_map["highest_education"]["type"] == "dropdown"
    assert "Bachelor's Degree" in field_map["highest_education"]["validation"]["options"]

    assert "technical_skills" in field_map
    assert field_map["technical_skills"]["type"] == "multiselect"
    skills_options = field_map["technical_skills"]["validation"]["options"]
    # Check that extracted technical skills from the resume are populated
    for expected_skill in ["Python", "TypeScript", "FastAPI", "React", "Docker", "AWS"]:
        assert any(expected_skill.lower() == opt.lower() for opt in skills_options), f"Missing skill {expected_skill} in {skills_options}"

    assert "resume_file_upload" in field_map
    assert field_map["resume_file_upload"]["type"] == "file"
    assert field_map["resume_file_upload"]["required"] is True


def test_form_voice_and_doc_upload_feature_flags(test_setup):
    """Verify admin can enable/disable voice and doc upload per form, and flags are exposed in API."""
    admin_headers = test_setup["admin_headers"]
    user_headers = test_setup["user_headers"]

    # 1. Create form with voice disabled, doc upload enabled
    form_id_1 = f"form_voff_{uuid.uuid4().hex[:8]}"
    resp_1 = client.post(
        "/forms",
        json={
            "form_id": form_id_1,
            "title": "Voice Disabled Form",
            "description": "Form without voice",
            "publish": True,
            "enable_voice": False,
            "enable_doc_upload": True,
            "fields": [
                {"fieldKey": "applicant_name", "type": "text", "label": "Name", "required": True}
            ],
        },
        headers=admin_headers,
    )
    assert resp_1.status_code == 201, resp_1.text
    form_1 = resp_1.json()["form"]
    assert form_1["enableVoice"] is False
    assert form_1["enableDocUpload"] is True
    assert form_1["enable_voice"] is False
    assert form_1["enable_doc_upload"] is True

    # Verify GET /forms/{id} returns the flags
    get_resp_1 = client.get(f"/forms/{form_id_1}", headers=user_headers)
    assert get_resp_1.status_code == 200
    fetched_1 = get_resp_1.json()["form"]
    assert fetched_1["enableVoice"] is False
    assert fetched_1["enableDocUpload"] is True

    # 2. Customize form to enable voice, disable doc upload
    cust_resp = client.put(
        f"/forms/{form_id_1}",
        json={
            "enable_voice": True,
            "enable_doc_upload": False,
        },
        headers=admin_headers,
    )
    assert cust_resp.status_code == 200, cust_resp.text
    cust_form = cust_resp.json()["form"]
    assert cust_form["enableVoice"] is True
    assert cust_form["enableDocUpload"] is False

    # Verify GET /forms list returns the updated flags
    list_resp = client.get("/forms", headers=user_headers)
    assert list_resp.status_code == 200
    listed_forms = list_resp.json()["forms"]
    matching = [f for f in listed_forms if f["formId"] == form_id_1]
    assert len(matching) == 1
    assert matching[0]["enableVoice"] is True
    assert matching[0]["enableDocUpload"] is False

    # 3. Create form using camelCase enableVoice=False and enableDocUpload=False
    form_id_2 = f"form_both_off_{uuid.uuid4().hex[:8]}"
    resp_2 = client.post(
        "/forms",
        json={
            "form_id": form_id_2,
            "title": "Both Disabled Form",
            "publish": True,
            "enableVoice": False,
            "enableDocUpload": False,
            "fields": [
                {"fieldKey": "test_field", "type": "text", "label": "Field", "required": False}
            ],
        },
        headers=admin_headers,
    )
    assert resp_2.status_code == 201, resp_2.text
    form_2 = resp_2.json()["form"]
    assert form_2["enableVoice"] is False
    assert form_2["enableDocUpload"] is False



