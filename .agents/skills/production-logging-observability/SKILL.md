---
name: production-logging-observability
description: >-
  Enforce production-grade AI Agent execution audit logging in review.md (append-only
  Work Review & Verification Log of what the AI agent did in the project), paired with
  backend structured JSON logging, X-Correlation-ID trace propagation, and Shift-Left PII
  redaction, while keeping the end-user UI completely free of technical logs. ALWAYS combine
  and use this skill alongside production-qa-testing in every project and task.
---

# Production Logging & Project Audit Skill (`production-logging-observability`)

> **Always-On Pairing Rule**: This skill MUST always be combined and executed alongside `production-qa-testing` across every project and feature change. Every task must be verified by automated QA tests AND logged as a structured, append-only entry in `ai-filler/review.md` documenting what the AI agent did in the project.

---

## 1. End-User UI Cleanliness Guardrail (No User-Side Logs)

- **Strict Prohibition on User-Facing Technical Logs**:
  - End users (`UserPanel.jsx`, `VoiceInterviewStudio.jsx`, `FormBuilder.jsx`) do **NOT** need to see internal telemetry drawers, correlation IDs, or debug log tables.
  - Never render `"Logs"` buttons, JSON telemetry drawers, or stack traces on the user side of the UI.
  - User-facing UI must only display clean, human-centric feedback (e.g., **AI Speaking** / **User Speaking** visualizers, spoken question subtitles, field confidence pills, and application review statuses).

---

## 2. Append-Only Project Execution & Audit Log (`ai-filler/review.md`)

On every feature implementation, bugfix, or architectural improvement, record what the AI coding agent did in the project by appending a new chronological entry to `ai-filler/review.md`:

1. **Append-Only Invariant**:
   - Never delete, overwrite, or truncate prior `[Log Entry #1] ... [Log Entry #N]` records in `ai-filler/review.md`.
   - Always append the next sequential `## [Log Entry #<N+1>] YYYY-MM-DD HH:MM:SS UTC - <Concise Title>` at the bottom of `ai-filler/review.md`.
2. **Mandatory Log Entry Structure**:
   - **`### Metadata`**:
     - `Summary`: Concise architectural summary of what the AI agent built, fixed, or refactored.
     - `Delta`: Count and scope of files modified/added across backend, frontend, skills, and tests.
     - `Deterministic Gate`: Exact pass/fail metrics from `pytest`, `npm run build`, and `validate_skill_gate.py`.
   - **`### Audit Findings Matrix`**:
     - Markdown table with columns: `Ref (File:Line) | Severity | Category | Issue & Evidence | Recommended Action / Status`.
   - **`### Verification Sign-Off`**:
     - Checklist confirming `pytest`, `npm run build`, `validate_skill_gate.py`, and security/UX invariants.

---

## 3. Backend Structured JSON Logging & `X-Correlation-ID` (`logging_utils.py`)

For server-side observability (invisible to end users):

1. **Correlation ID Context (`contextvars.ContextVar`)**:
   - Extract or generate `X-Correlation-ID` in FastAPI HTTP middleware, bind it to `ContextVar("correlation_id", default="n/a")`, and echo `X-Correlation-ID` in response headers.
2. **Shift-Left PII & Secret Redaction**:
   - Automatically mask any dictionary key matching `password`, `secret`, `token`, `csrf`, `authorization`, `cookie`, `api_key`, `aadhaar`, or `pan` with `"[REDACTED]"`.
   - Scrub inline API keys (`gsk_...`, `sk-...`) and raw email addresses in log strings before writing to server logs.
