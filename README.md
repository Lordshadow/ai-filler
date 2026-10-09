# AI Filler

AI Filler is an enterprise-grade platform for intelligent, multi-modal form automation and dynamic workflow orchestration. It combines speech-to-text (Groq Whisper), OCR and document ingestion (RapidOCR + LangChain), dynamic admin-customizable forms, autosave drafts with field-level provenance tracking, and server-side contract validation across three user tiers: **Super Admin**, **Organization Admin**, and **End User**.

---

## How to Start the Application

Follow these steps to set up and run both the Backend API and Frontend application locally.

### 1. Prerequisites
- **Python**: Version 3.14+ (the pre-configured `.venv` virtual environment in the repository includes all dependencies)
- **Node.js**: Version 20+ with `npm`
- **Groq API Key**: Obtainable from [console.groq.com](https://console.groq.com/) for Whisper audio transcription and LLM application formatting.

---

### 2. Configure Environment Variables

Create or verify the `.env` file in the project root (`ai-filler/.env`):

```bash
# Set your Groq API Key
GROQ_API_KEY=gsk_your_actual_groq_api_key_here

# For local development over HTTP (disables Secure cookie flag)
AI_FILLER_COOKIE_SECURE=false

# Allowed CORS origins (defaults to local Vite frontend)
AI_FILLER_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

---

### 3. Install Dependencies

#### Backend
If you have `uv` installed:
```bash
uv sync
```

Alternatively, you can use the pre-built virtual environment directly:
```bash
source .venv/bin/activate
```

#### Frontend
Install node packages in the `frontend/` directory:
```bash
npm --prefix frontend install
```

---

### 4. Bootstrap Initial Super Admin (One-Time Setup)

The system enforces multi-tenant RBAC. The initial Super Admin account is provisioned via a dedicated one-time local bootstrap CLI:

```bash
# Using the project's virtual environment:
.venv/bin/python -m ai_filler.auth.bootstrap
```
*You will be prompted to enter a Super Admin username/identifier and a secure password (at least 12 characters, uppercase, lowercase, number, special character).*

---

### 5. Launch the Application

To run the complete platform, start the **Backend API** in one terminal and the **Frontend** in a second terminal.

#### Terminal 1: Start Backend API (FastAPI)

```bash
# Option A: Using the project .venv directly
AI_FILLER_COOKIE_SECURE=false .venv/bin/uvicorn ai_filler.main:app --reload --port 8000

# Option B: If using uv
AI_FILLER_COOKIE_SECURE=false uv run uvicorn ai_filler.main:app --reload --port 8000
```
- API Base URL: <http://127.0.0.1:8000/>
- Health Check: <http://127.0.0.1:8000/health>
- Interactive API Documentation (Swagger UI): <http://127.0.0.1:8000/docs>
- ReDoc Documentation: <http://127.0.0.1:8000/redoc>

#### Terminal 2: Start Frontend Server (Vite + React)

```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```
- Frontend Web App: <http://127.0.0.1:5173/>

---

## Access Points & Role Login Pages

The platform features dedicated, isolated authentication portals for each user tier:

| Role | Web Login URL | Description & Credentials |
| :--- | :--- | :--- |
| **End User** | <http://127.0.0.1:5173/login> | Email & Password. Can self-register at `/register` with phone & age verification. |
| **Organization Admin** | <http://127.0.0.1:5173/admin/login> | Admin ID (`ADM-...`) & Password. Created by Super Admin. |
| **Super Admin** | <http://127.0.0.1:5173/super-admin/login> | Super Admin Identifier & Password provisioned during bootstrap. |

---

## Core System Services & Endpoints

### 1. User Management Service (`UserService`)
- `POST /auth/register`: Enforces ITU-T E.164 phone formatting (`^\+[1-9]\d{1,14}$`) and ISO 8601 Date of Birth ($\ge 18$ age verification).
- `GET /users/me`: Current user profile.
- `GET /users/{id}`: Profile lookup with tenant scoping (User views self; Org Admin views org users; Super Admin views all).
- `PATCH /users/{id}`: Profile updates.

### 2. Form Definition Service (`FormService`) - Admin Customizable
- Forms are fully **customizable by Admins** (Organization Admins customize for their organization; Super Admins manage platform-wide templates).
- `POST /forms`: Admin creates dynamic form with fields, labels, types (`text`, `number`, `date`, `dropdown`, `multiselect`, `file`), validation regex, and mandatory flags.
- `PUT /forms/{id}` (or `POST /forms/{id}/customize`): Admin customizes fields, updates regex rules, and publishes new immutable versions ($v1 \to v2$).
- `GET /forms`: Lists accessible forms.
- `GET /forms/{id}`: Fetches form definition and compiled schema (supports optional `?version={n}`).

### 3. Draft Service (`DraftService`)
- `PUT /drafts/{id}`: Autosaves state with field-level origin provenance (`voice`, `doc`, `user`) and Optimistic Concurrency Control (OCC) using `If-Match` ETags (`W/"v{version}"`). Returns `409 Conflict` on race conditions.
- `GET /drafts/{id}`: Resumes draft with ETag and provenance intact.

### 4. Submission Service (`SubmissionService`)
- `POST /applications`: Dynamically validates payload against the form version's registered schema rules (regex patterns, required fields, min/max). Decouples provenance to an audit ledger and enforces distributed idempotency via the `Idempotency-Key` header.
- `GET /applications`: Scoped query view (End User views own; Org Admin views tenant applications).
- `GET /applications/{id}`: Application details. Org Admins and Super Admins receive attached provenance audit logs.
- `GET /applications/all`: Global cross-tenant index reserved for Super Admin (returns `403 Forbidden` for non-super admins).

---

## Running the Automated Test Suite

To run the complete test suite including security tests, authentication regressions, and the new platform workflows:

```bash
# Run the platform workflow integration suite (UserService, FormService, DraftService, SubmissionService):
.venv/bin/pytest tests/test_platform_workflows.py

# Run all test suites:
.venv/bin/pytest
```

---

## Password Recovery Configuration (Optional)

Password recovery is disabled until outbound SMTP email is configured. To enable recovery in production or testing, supply:

```text
AI_FILLER_SMTP_HOST=smtp.example.com
AI_FILLER_SMTP_PORT=587
AI_FILLER_SMTP_USERNAME=...
AI_FILLER_SMTP_PASSWORD=...
AI_FILLER_SMTP_FROM=AI Filler <no-reply@example.com>
AI_FILLER_PUBLIC_URL=https://your-app.example.com
AI_FILLER_ENV=production
```

Configure recovery email for Super Admin using:
```bash
.venv/bin/python -m ai_filler.auth.configure_super_admin_recovery
```
