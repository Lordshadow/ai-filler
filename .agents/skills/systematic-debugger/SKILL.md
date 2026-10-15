---
name: systematic-debugger
description: >-
  Perform scientific root-cause debugging for Python/FastAPI tracebacks, Groq API
  errors, regex/NLP extraction mismatches, and React build/runtime errors.
  Activate this skill whenever a test fails, an exception occurs, or an extraction
  produces unexpected output.
---

# Systematic Debugger Skill (`systematic-debugger`)

Optimized via **Microsoft SkillOpt** to eliminate guesswork and fix root causes on the first pass.

## 1. Scientific 4-Step Debugging Loop
1. **Inspect Exact Failure Telemetry**:
   - Read the exact assertion diff and stack trace line numbers first. Never guess a fix before viewing the failing code and test lines via `view_file`.
2. **Classify the Failure Layer**:
   - **Call-Signature / Keyword Mismatch**: Check whether functions use keyword-only parameters (`def transcribe_audio(*, file_path: ...)`).
   - **Namespace / Import Binding**: Check where a symbol is imported (`from ai_filler.groq_client import transcribe_audio` inside `form_agents.py` binds `ai_filler.agents.form_agents.transcribe_audio`).
   - **Regex Greedy / Boundary Over-Match**: Test regexes against edge cases (trailing punctuation, Unicode Tamil script boundaries `\u0B80-\u0BFF`, comma-separated repetition loops).
3. **Minimal Surgical Fix**:
   - Apply the smallest self-contained fix at the root-cause layer (`replace_file_content`).
4. **Validation Gate Check**:
   - Re-run the failing test immediately (`-k "<test_name>"`) and run the `ms-skillopt` validation gate (`validate_skill_gate.py`) to confirm zero collateral regressions.
