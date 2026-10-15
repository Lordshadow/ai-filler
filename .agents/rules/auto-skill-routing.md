---
trigger: always_on
description: Automatically route tasks to workspace & global skills and ALWAYS combine production-logging-observability + production-qa-testing on every task and project.
---

# Automatic Skill Routing & Mandatory Logging + QA Combination Rule

Always auto-select and read (`view_file`) the matching skill in `.agents/skills/<skill-name>/SKILL.md` (and global `~/.gemini/config/skills/<skill-name>/SKILL.md`) whenever a user prompt touches its domain.

**Mandatory Core Pairing (Every Task & Every Project)**:
- **Always Combine Logging + QA Testing**: Every feature or bugfix MUST simultaneously activate `production-logging-observability` AND `production-qa-testing` (replacing legacy `review.md` workflows).

Domain Routing:
- Structured JSON Logging / `X-Correlation-ID` / PII Redaction / State Telemetry $\rightarrow$ `production-logging-observability` *(Always combined with `production-qa-testing`)*
- Pytest / Boundary QA / Audio & State Machine Invariants / Vite Build Verification $\rightarrow$ `production-qa-testing` *(Always combined with `production-logging-observability`)*
- Voice/Whisper/Tamil slang/Tanglish/Extraction $\rightarrow$ `tamil-tanglish-voice-nlp`
- Automated Voice Interview/TTS/VAD/Silence Auto-Stop/Speaking Indicators $\rightarrow$ `conversational-voice-interviewer`
- React UI/FormBuilder/UserPanel/Styling $\rightarrow$ `ui-ux-frontend-architect`
- Web/API Research & Accuracy Benchmarking $\rightarrow$ `professional-researcher`
- FastAPI Security/RBAC/CSRF/Uploads $\rightarrow$ `secure-api-guardian`
- Tracebacks/Failing Tests/Bug Fixes $\rightarrow$ `systematic-debugger`
- Architecture/Refactoring/Multi-Agent Design $\rightarrow$ `clean-architecture-modularizer`
- Skill/Prompt Optimization & Validation Gate $\rightarrow$ `ms-skillopt`
