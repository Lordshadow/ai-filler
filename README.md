# AI Filler 
### Intelligent, Multi-Modal Form Automation & Conversational Voice Platform

[![Python 3.14+](https://img.shields.io/badge/python-3.14+-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.142+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19.2+-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite 8](https://img.shields.io/badge/Vite-8.3+-646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Groq LLaMA 3.3](https://img.shields.io/badge/Groq-LLaMA_3.3_70B-F55036.svg?style=flat)](https://groq.com/)
[![Groq Whisper](https://img.shields.io/badge/Groq-Whisper_v3-F55036.svg?style=flat)](https://groq.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is AI Filler?

Let’s be honest: **nobody enjoys filling out repetitive, bureaucratic forms**. Whether you are applying for a job, onboarding a new vendor, submitting government paper records, or entering claims, traditional web forms are tedious, error-prone, and frustrating.

**AI Filler** reimagines form completion from the ground up:

1. **Talk to your form**: Complete applications entirely hands-free using an AI voice interviewer that speaks and understands both English and Tamil / Tanglish (`தமிழ்`).
2. **Scan documents in seconds**: Drag and drop any resume, certificate, invoice, or PDF document. Our local OCR pipeline (RapidOCR) and Groq LLaMA 3.3 model parse the text, structure the answers, and populate the form automatically.
3. **Admin power & customizability**: Organization and Super Admins can build, test, and publish bespoke forms in minutes with granular validation rules, mandatory field toggles, and live previews.
4. **Peace of mind with rock-solid reliability**: Continuous autosave drafts with Optimistic Concurrency Control (OCC), field-level origin provenance tracking (knowing whether an answer came from AI, an uploaded document, or manual typing), and enterprise-grade multi-tenant security.

---

## 🛠️ Tech Stack & Current Versions

Here is the exact runtime environment and dependency stack running in this repository:

| Layer | Technology | Current Version | Role in AI Filler |
| :--- | :--- | :--- | :--- |
| **Runtime** | Python | `3.14.7` (requires `>=3.14`) | High-performance backend runtime |
| **Frontend Runtime** | Node.js / npm | `v24.19.0` / `npm 11.17.0` (Node 20+) | Toolchain for Vite and client bundling |
| **Web Framework** | FastAPI | `0.142.4+` | Async REST API, OpenAPI docs, and middleware |
| **ASGI Server** | Uvicorn (standard) | `0.34.0+` | ASGI server with reload support |
| **Frontend Library** | React & React DOM | `19.2.8` (React 19) | Modern component architecture & hooks |
| **Client Routing** | React Router DOM | `7.18.4` (v7) | Declarative multi-tier portal routing |
| **Bundler & Dev Server**| Vite | `8.3.3` (Vite 8) | Lightning-fast HMR and production tree-shaking |
| **Icons & UI Assets** | Lucide React | `1.56.0` | Accessible SVG icon suite |
| **Frontend Linter** | Oxlint | `1.81.0` | Ultra-fast Rust-based static linter |
| **LLM Inference** | Groq Python SDK | `0.37.1+` | Powers `llama-3.3-70b-versatile` form filling |
| **Speech-to-Text (ASR)**| Groq Whisper | `whisper-large-v3` | High-accuracy English & Tamil transcription |
| **Multi-Agent & Chains**| LangChain / LangChain-Groq | `1.4.3+` / `1.1.3+` | Structured schema extraction and prompt pipelines |
| **Local OCR Engine** | RapidOCR ONNX Runtime | `1.2.0+` | On-device text extraction from images and PDFs |
| **Document Parsers** | PyPDF / python-docx / Pillow | `6.19.0+` / `1.2.0+` / `12.3.0+` | File ingestion for `.pdf`, `.docx`, `.png`, `.jpg` |
| **Voice & Speech** | Sarvam AI & ElevenLabs | `0.1.37+` / `2.72.0+` | Multilingual neural voice synthesis & speech APIs |
| **Password Security** | pwdlib (Argon2id) | `0.3.1+` | Memory-hard password hashing with per-user salt |
| **Build & Packaging** | uv / uv_build | `0.12.23+` | Fast Python package management and virtualenvs |
| **Design Language** | Monochromatic Glassmorphism 2.0 | Custom CSS Tokens | Frosted liquid-ice glass, specular edges, WCAG AA contrast |

---

## ✨ Core Features & Workflows

### 1. 🎙️ Multilingual Conversational Voice Interviewer
- **Hands-Free Turn-Taking**: Step through any form field by field without touching the keyboard.
- **Code-Switching Support**: Understands English, native Tamil script (`தமிழ்`), and colloquial Romanized Tanglish (e.g., *"Enoda name Rahul, DOB 15 August 1995"*).
- **Voice Activity Detection (VAD)**: Built using the browser's Web Audio API `AnalyserNode` with silence hangover auto-stop, preventing accidental speech cutoffs.
- **Natural Voice Navigation**: Say *"skip"*, *"repeat"*, *"previous"*, *"clear"*, or *"stop"* to control the interview naturally.
- **Self-Correction Recovery**: Spoke the wrong value? Simply say *"sorry, change that to..."* or *"illa illa, actual date is..."* and the AI will automatically update the field.

### 2. 📄 Instant Doc-to-Form AI Wizard & OCR
- Upload your resume, ID proof, or scanned document (`.pdf`, `.docx`, `.png`, `.jpg`).
- The embedded **RapidOCR** engine extracts raw text on-device with zero cloud leakage of unparsed files.
- Groq LLaMA 3.3 processes the text against the form schema, auto-populating fields and assigning a **confidence score** and **provenance badge** (`document`, `AI`, or `manual`).

### 3. 🛠️ Dynamic Form Builder (Admin Customizable)
- Admins can build custom forms using a rich drag-and-drop designer.
- Supported field types: `text`, `number`, `date`, `dropdown`, `multiselect`, `file upload`.
- Set custom regex validations, error messages, and mandatory/optional toggles.
- Live interactive preview modal rendered via React portals to test-drive forms before publishing immutable versions ($v1 \to v2$).

### 4. 🛡️ Enterprise Security & Multi-Tier RBAC
- **Three Isolated Portals**:
  -  **Applicant / End User**: Self-registers, tracks personal applications, edits drafts.
  - **Organization Admin**: Manages tenant forms, reviews applicant submissions, audits field origins.
  - **Super Admin**: Provisions organizations, creates Org Admins, inspects platform-wide logs.
- **Defense in Depth**:
  - Argon2id password hashing with timing-safe comparison.
  - Double-Submit Cookie CSRF protection (`X-CSRF-Token`).
  - Strict input sanitization and parameterized SQLite queries.
  - Optimistic Concurrency Control (OCC) using `If-Match` ETags to avoid merge conflicts.
  - Submission idempotency via `Idempotency-Key` headers.

---

## 🚀 Quickstart Guide (Up and Running in 3 Minutes)

### Step 1: Clone the Repository

```bash
git clone https://github.com/Lordshadow/Filler_AI.git
cd Filler_AI/ai-filler
```

### Step 2: Set Up Environment Variables

Create your local `.env` file inside `ai-filler/`:

```bash
cp .env.example .env 2>/dev/null || cat << 'EOF' > .env
# Groq API Key for LLaMA 3.3 and Whisper STT
GROQ_API_KEY=gsk_your_actual_groq_api_key_here

# Local Development Settings
AI_FILLER_COOKIE_SECURE=false
AI_FILLER_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
EOF
```

> **Note**: Grab a free, fast Groq API key from [console.groq.com](https://console.groq.com/). Setting `AI_FILLER_COOKIE_SECURE=false` allows session authentication cookies to work locally over standard HTTP.

### Step 3: Install Dependencies

#### Backend (Python 3.14+)
If you use [`uv`](https://github.com/astral-sh/uv):
```bash
uv sync
```

Or activate the pre-configured virtual environment:
```bash
source .venv/bin/activate
```

#### Frontend (Node 20+ / 24+)
```bash
npm --prefix frontend install
```

---

### Step 4: Bootstrap the Initial Super Admin

Because AI Filler enforces strict Role-Based Access Control, the initial Super Admin account is created via a one-time, secure CLI tool:

```bash
.venv/bin/python -m ai_filler.auth.bootstrap
```

- Enter an identifier for the root Super Admin (e.g., `superadmin`).
- Enter a strong password (minimum 12 characters, including uppercase, lowercase, numbers, and symbols).
- *Once created, this CLI tool locks itself so credentials can never be overwritten from the outside.*

---

### Step 5: Start the Development Servers

Open two terminal windows:

#### Terminal 1 — Start the FastAPI Backend
```bash
# From the ai-filler directory:
AI_FILLER_COOKIE_SECURE=false .venv/bin/uvicorn ai_filler.main:app --reload --port 8000
```
- 🌐 **API Base**: <http://127.0.0.1:8000/>
- 🩺 **Health Check**: <http://127.0.0.1:8000/health>
- 📚 **Interactive Swagger UI**: <http://127.0.0.1:8000/docs>
- 📖 **ReDoc Documentation**: <http://127.0.0.1:8000/redoc>

#### Terminal 2 — Start the React Frontend (Vite)
```bash
# From the ai-filler directory:
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```
- 💻 **Frontend Web App**: <http://127.0.0.1:5173/>

---

## 🔑 Portals & Access Points

The application provides dedicated portals tailored to each persona:

| User Tier | Portal URL | How to Sign In | Typical Use Case |
| :--- | :--- | :--- | :--- |
| **Applicant / End User** | `http://127.0.0.1:5173/login` | Self-register via `/register` (requires valid phone & age 18+) | Fill forms by voice, upload documents, review & submit applications. |
| **Organization Admin** | `http://127.0.0.1:5173/admin/login` | Login ID (`ADM-...`) & password issued by Super Admin | Build custom forms, view incoming tenant applications, audit provenance. |
| **Super Admin** | `http://127.0.0.1:5173/super-admin/login` | Bootstrapped identifier & password | Create organizations, provision Org Admins, review platform metrics. |

---

## 📁 Project Structure

Here is how the project is organized:

```text
Filler_AI/
├── AGENTS.md                  # Workspace skill routing & guardrail definitions
├── ai-filler/                 # Main application directory
│   ├── .env                   # Local environment configuration
│   ├── pyproject.toml         # Backend dependencies & metadata (uv)
│   ├── review.md              # Append-only chronological AI agent work log
│   ├── src/ai_filler/         # Python backend source code
│   │   ├── main.py            # FastAPI entry point, routes & middleware
│   │   ├── storage.py         # SQLite persistence & parameterized queries
│   │   ├── groq_client.py     # Groq Whisper STT & LLaMA 3.3 LLM wrapper
│   │   ├── agents/
│   │   │   └── form_agents.py # Multi-agent extraction & voice interview engine
│   │   └── auth/              # Authentication, RBAC, sessions & bootstrap CLI
│   ├── frontend/              # Modern React + Vite frontend
│   │   ├── package.json       # React 19, Vite 8, Lucide React dependencies
│   │   ├── vite.config.js     # Vite build & proxy configuration
│   │   └── src/
│   │       ├── App.jsx        # Root routing & layout orchestration
│   │       ├── FormBuilder.jsx# Admin drag-and-drop form creation suite
│   │       ├── UserPanel.jsx  # Applicant form completion & voice interview
│   │       ├── AdminPanel.jsx # Organization Admin dashboard & submissions
│   │       ├── SuperAdminPanel.jsx # Super Admin tenant & admin management
│   │       └── index.css      # Monochromatic Glassmorphism 2.0 design tokens
│   └── tests/                 # Automated test suite (Pytest)
│       ├── test_platform_workflows.py # 24-step end-to-end integration suite
│       └── ...                # Security, RBAC, CSRF, and voice unit tests
```

---

## 🧪 Verification & Automated Testing

We take quality and reliability seriously. The codebase is backed by a 6-layer automated test matrix:

```bash
# Run the complete platform workflow integration test suite:
.venv/bin/python -m pytest -o pythonpath=src tests/test_platform_workflows.py

# Run all backend unit, boundary, and security tests:
.venv/bin/python -m pytest -o pythonpath=src

# Test the frontend production build:
npm --prefix frontend run build

# Run the MS-SkillOpt held-out validation gate (asserts 100% score):
.venv/bin/python ../.agents/skills/ms-skillopt/scripts/validate_skill_gate.py
```

---

## 💡 Helpful Tips & Troubleshooting

- **"Why do I get 401 / CSRF errors when testing locally?"**  
  Ensure `AI_FILLER_COOKIE_SECURE=false` is set in your `.env`. When running on `http://localhost` without SSL, browsers will reject cookies marked with the `Secure` flag.
- **"Microphone access denied in Voice Interview?"**  
  Modern browsers only permit Web Audio and Speech APIs on `http://127.0.0.1`, `http://localhost`, or `https://` origins. Make sure you are accessing the app using `127.0.0.1` or `localhost`.
- **"Can I reset a forgotten Super Admin password?"**  
  You can run `.venv/bin/python -m ai_filler.auth.configure_super_admin_recovery` to attach a verified email, or re-initialize a fresh development database by clearing `ai_filler.db`.

---

## 🤝 Contributing & Community

Contributions, feature ideas, and feedback are always welcome! Feel free to open an issue or submit a pull request.

- **Author**: Lordshadow ([kaadithiya@gmail.com](mailto:kaadithiya@gmail.com))
- **License**: MIT
