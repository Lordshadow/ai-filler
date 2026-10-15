# Filler_AI — Automatic Agent Skill Routing & SkillOpt Guardrails

This file is an **Always-On Workspace Rule**. On every user request, automatically activate and follow the matching workspace skills in `.agents/skills/` without waiting for the user to name them.

> **Mandatory Combined Core Skills (Every Task & Every Project)**:
> Always combine and apply **[`production-logging-observability`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/production-logging-observability/SKILL.md)** (`~/.gemini/config/skills/production-logging-observability/SKILL.md`) AND **[`production-qa-testing`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/production-qa-testing/SKILL.md)** (`~/.gemini/config/skills/production-qa-testing/SKILL.md`) on every feature, bugfix, or architectural change. Every task must be verified by automated 6-layer QA testing and logged as an append-only audit entry in [`ai-filler/review.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/ai-filler/review.md) documenting what the AI agent did in the project (while keeping the end-user UI free of technical logs).

## 1. Automatic Skill Routing Table

| Task / Trigger Condition | Skill to Auto-Load (`view_file` on `SKILL.md`) |
| :--- | :--- |
| **Project execution audit logging in `ai-filler/review.md` (what the AI agent did), backend `X-Correlation-ID` tracing, PII redaction, and keeping user-side UI free of logs (ALWAYS ON with QA)** | [`.agents/skills/production-logging-observability/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/production-logging-observability/SKILL.md) |
| **QA testing, TDD, boundary testing, audio/voice state-machine invariants, API contract/CSRF tests, or Vite build checks (ALWAYS ON with Logging)** | [`.agents/skills/production-qa-testing/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/production-qa-testing/SKILL.md) |
| **Voice STT, Whisper, Tamil script (`தமிழ்`), Tamil slang, Tanglish, or NLP extraction (`groq_client.py`, `form_agents.py`)** | [`.agents/skills/tamil-tanglish-voice-nlp/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/tamil-tanglish-voice-nlp/SKILL.md) |
| **Automated field-by-field voice interviews, TTS question synthesis, Web Audio VAD, silence auto-stop, or AI/User speaking indicators** | [`.agents/skills/conversational-voice-interviewer/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/conversational-voice-interviewer/SKILL.md) |
| **Frontend UI/UX, React components, voice recording banners, form builder, confidence/provenance badges (`frontend/src/`)** | [`.agents/skills/ui-ux-frontend-architect/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/ui-ux-frontend-architect/SKILL.md) |
| **Web research, Groq/LangChain/FastAPI documentation checks, accuracy improvements, or benchmarking** | [`.agents/skills/professional-researcher/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/professional-researcher/SKILL.md) |
| **Authentication, RBAC, CSRF cookies, file uploads, or SQLite queries (`main.py`, `storage.py`)** | [`.agents/skills/secure-api-guardian/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/secure-api-guardian/SKILL.md) |
| **Test failures, exceptions, tracebacks, or extraction bugs** | [`.agents/skills/systematic-debugger/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/systematic-debugger/SKILL.md) |
| **New feature design, module refactoring, or multi-agent architecture changes** | [`.agents/skills/clean-architecture-modularizer/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/clean-architecture-modularizer/SKILL.md) |
| **Creating, editing, or optimizing skills, prompts, or multi-agent instructions** | [`.agents/skills/ms-skillopt/SKILL.md`](file:///home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/ms-skillopt/SKILL.md) |

## 2. Always-On Execution Guardrails (Consolidated via `ms-skillopt`)
1. **Combined Logging (`review.md`) + QA Gate**: Every code change must be verified via `ai-filler/.venv/bin/python -m pytest -o pythonpath=src` + `npm run build` (`production-qa-testing`) and logged as a new `[Log Entry #N]` in `ai-filler/review.md` (`production-logging-observability`). Never show internal logs on the user-facing UI.
2. **Groq Whisper Accuracy**: Keep `temperature=0.0`, cap `prompt` builders at `<= 450` chars (`< 224` tokens), use `language=None` for `auto`/`tanglish` code-switching or `"ta"` for Tamil, and strip trailing silence hallucinations.
3. **Held-Out Validation Gate**: After modifying NLP/Whisper logic or any `SKILL.md`, run `.agents/skills/ms-skillopt/scripts/validate_skill_gate.py` and confirm `Gate Score: 100.0%`.
