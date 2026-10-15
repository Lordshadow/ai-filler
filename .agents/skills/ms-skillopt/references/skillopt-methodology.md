# Microsoft SkillOpt Methodology & Rejected-Edit Buffer

## 1. Text-Space Hyperparameters
| Deep Learning Concept | SkillOpt Text-Space Equivalent | Filler_AI Standard |
| :--- | :--- | :--- |
| **Trainable Weights ($\theta$)** | `SKILL.md` / `best_skill.md` instructions & few-shot exemplars | Stored in `.agents/skills/<name>/SKILL.md` |
| **Learning Rate ($\eta$)** | Maximum bounded edits per iteration (max 3 rules added/replaced per pass) | Prevents catastrophic prompt drift |
| **Loss Function ($\mathcal{L}$)** | Failed assertions, WER errors, schema compliance misses, or build warnings | Computed by `scripts/validate_skill_gate.py` |
| **Validation Gate** | Held-out test suite (`pytest` + `npm run build` + `SKILL.md` lint check) | Must score `100.0%` to accept edit |
| **SkillOpt-Sleep** | Offline trajectory mining from `transcript.jsonl` | Consolidates multi-step debugging discoveries into permanent skill rules |

## 2. Consolidated Trajectory Learnings (From `SkillOpt-Sleep`)
1. **Virtualenv Shebang Resilience**: Always invoke pytest via `.venv/bin/python -m pytest -o pythonpath=src` rather than `.venv/bin/pytest` directly, because legacy shebang paths with spaces break direct script execution.
2. **Whisper Prompt Token Budget Gate**: Whisper only reads the last 224 tokens (`<= 450` chars) of `prompt`. Putting Tamil/Tanglish priming at the end of a $>700$-char prompt truncates the primer; always cap prompt builders at `[:450]` characters.
3. **Trailing Silence Hallucination Stripping**: Whisper silence hallucinations (`"Thank you for watching."`) frequently appear appended at the *end* of valid speech, not only as full-string utterances. Regex patterns must match `(?:^|\s+)...$`.
4. **Module-Scoped Monkeypatching**: When mocking `transcribe_audio` for `/ai/fill-form/voice`, patch `ai_filler.agents.form_agents.transcribe_audio` (where it is imported and called), whereas for `/transcribe` patch `ai_filler.main.transcribe_audio`.

## 3. Rejected-Edit Buffer (Do Not Re-Introduce)
- ❌ **Rejected Edit #1**: Hardcoding `language="ta"` for all voice requests. *Reason*: Causes Whisper to transliterate English email addresses and dropdown options into Tamil script during Tanglish code-switching. Keep `language=None` (`auto`) as default and only pass `"ta"` when explicitly selected.
- ❌ **Rejected Edit #2**: Full-string-only hallucination regex `^\s*thank you for watching.*$`. *Reason*: Fails when trailing silence occurs after valid Tamil slang speech.
- ❌ **Rejected Edit #3**: Unbounded Whisper vocabulary prompts (`[:680]`+ chars). *Reason*: Exceeds 224-token window when Tamil Unicode script is tokenized into multi-byte BPE tokens.
