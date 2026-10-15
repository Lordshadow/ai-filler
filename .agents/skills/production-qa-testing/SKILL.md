---
name: production-qa-testing
description: >-
  Enforce production-grade Quality Assurance (QA) and Test-Driven Development (TDD) across
  unit, boundary, state-machine invariant, security/CSRF/RBAC, multi-agent NLP, and structured
  logging verification gates. ALWAYS combine and use this skill alongside
  production-logging-observability in every project and task.
---

# Production QA & Testing Skill (`production-qa-testing`)

> **Always-On Pairing Rule**: This skill MUST always be combined and executed alongside `production-logging-observability` in every project and task. Every code change must be verified by automated QA tests covering functional correctness, boundary conditions, state-machine invariants, and structured log/correlation-ID emission.

---

## 1. Environment & Execution Guardrails

1. **Backend Pytest Gate**:
   - Always run the test suite from `ai-filler/` using the virtualenv interpreter:
     ```bash
     .venv/bin/python -m pytest -o pythonpath=src
     ```
   - Use `-k "<pattern>"` for rapid Red-Green-Refactor iteration before running the full regression suite.
2. **Frontend Production Build Gate**:
   - Always run `npm run build` in `ai-filler/frontend/` and require `0` compilation or bundle errors.
3. **MS-SkillOpt Held-Out Validation Gate**:
   - Run `.agents/skills/ms-skillopt/scripts/validate_skill_gate.py` and require `Gate Score: 100.0%`.

---

## 2. The 6-Layer Production QA Testing Matrix

Every feature or bugfix must be validated across these 6 QA layers:

### Layer 1: Unit & Boundary Value Analysis (BVA)
- Test minimum/maximum numeric bounds (`validation.min`, `validation.max`), empty strings, whitespace-only inputs, malformed regexes, invalid email formats (missing `@` or domain), and unsupported file extensions.
- Test multilingual edge cases across **English**, **Tamil script (`தமிழ்`)**, and **Romanized Tanglish** (including self-corrections like `"illa illa"` / `"sorry"` and spoken numbers/dates/emails).

### Layer 2: Conversational & Audio State Machine Invariants
- Verify turn-taking transitions (`IDLE -> AI_SPEAKING -> LISTENING_WAITING -> USER_SPEAKING -> PROCESSING_TURN -> CONFIRMING_ADVANCE / RETRYING_FIELD -> COMPLETED`).
- Verify spoken navigation commands (`skip`, `repeat`, `previous`, `clear`, `stop`) across English, Tamil, and Tanglish.
- Ensure command collision safety: if a user speaks a word that matches a valid `dropdown` or `multiselect` option for the active field, prioritize the option over generic navigation triggers.
- Verify single-field validation failure recovery: when `target_field_key` receives an invalid answer (e.g., invalid email or out-of-range number), `interview_turn.field_populated` must be `False` and `spoken_retry_prompt` must guide the user clearly.

### Layer 3: API Contract, Concurrency & Security QA
- **RBAC & Tenant Isolation**: Verify `Super Admin`, `Org Admin`, and `End User` permission boundaries (`401`/`403` on unauthorized access).
- **CSRF Protection**: Verify mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require valid Double-Submit `X-CSRF-Token` headers while safe methods (`GET`, `HEAD`, `OPTIONS`) remain exempt.
- **Concurrency & Idempotency**: Verify draft OCC `ETag`/`If-Match` conflict detection (`409`) and submission `Idempotency-Key` replay safety (`422` on payload mismatch).

### Layer 4: Observability & Logging Verification (Paired with `production-logging-observability`)
- Assert that HTTP responses include `X-Correlation-ID` (matching the request's `X-Correlation-ID` when supplied, or auto-generated when omitted).
- Assert that structured log events are recorded in the telemetry ring buffer with PII redaction applied to sensitive fields.

### Layer 5: Deterministic AI & ASR Monkeypatching
- Never rely on live external network calls in automated unit/integration tests.
- Mock external Groq boundaries at the consuming module namespace:
  - LLM calls: `monkeypatch.setattr("ai_filler.agents.form_agents._invoke_structured_json", ...)`
  - Voice endpoints (`/ai/fill-form/voice`, `/ai/generate-form/voice`): `monkeypatch.setattr("ai_filler.agents.form_agents.transcribe_audio", ...)`
  - Low-level Whisper client: `monkeypatch.setattr("ai_filler.groq_client._create_groq_client", ...)`
- Preserve default function signatures in `main.py` so existing monkeypatches continue to pass without regression.
