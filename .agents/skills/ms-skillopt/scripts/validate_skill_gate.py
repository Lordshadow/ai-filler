#!/usr/bin/env python3
"""Microsoft SkillOpt Held-Out Validation Gate for Filler_AI Workspace Skills.

Validates:
1. Structural & Token-Budget Compliance of all `.agents/skills/*/SKILL.md` files
   (valid YAML frontmatter, proactive trigger descriptions, compact token footprint).
2. Held-Out Tamil Slang / Tanglish / Tamil Script & Groq Whisper Accuracy Benchmarks
   (including spoken emails, compound Tamil numbers, dates, suffixes, and self-corrections).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
SKILLS_DIR = WORKSPACE_ROOT / ".agents" / "skills"
SRC_DIR = WORKSPACE_ROOT / "ai-filler" / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def validate_skills_structure() -> tuple[int, int, list[str]]:
    """Validate every SKILL.md in .agents/skills/ against SkillOpt compactness & frontmatter gates."""
    passed = 0
    total = 0
    errors: list[str] = []

    skill_files = sorted(SKILLS_DIR.glob("*/SKILL.md"))
    if not skill_files:
        return 0, 1, ["No SKILL.md files found in .agents/skills/"]

    for skill_md in skill_files:
        total += 1
        content = skill_md.read_text(encoding="utf-8")
        lines = content.splitlines()

        if not content.startswith("---\n"):
            errors.append(f"{skill_md.parent.name}: Missing YAML frontmatter opening '---'")
            continue
        end_idx = content.find("\n---\n", 4)
        if end_idx == -1:
            errors.append(f"{skill_md.parent.name}: Missing YAML frontmatter closing '---'")
            continue

        frontmatter = content[4:end_idx]
        if "name:" not in frontmatter or "description:" not in frontmatter:
            errors.append(f"{skill_md.parent.name}: Frontmatter must include 'name' and 'description'")
            continue

        if len(lines) > 400:
            errors.append(f"{skill_md.parent.name}: Exceeds SkillOpt compactness gate ({len(lines)} > 400 lines)")
            continue

        passed += 1

    return passed, total, errors


def validate_held_out_nlp_and_whisper_benchmarks() -> tuple[int, int, list[str]]:
    """Run held-out evaluation tasks for Groq Whisper conditioning and Tamil slang / Tanglish extraction."""
    from ai_filler.groq_client import (
        DEFAULT_WHISPER_TEMPERATURE,
        clean_whisper_hallucinations,
        normalize_whisper_language,
    )
    from ai_filler.agents.form_agents import (
        build_form_creation_whisper_prompt,
        build_whisper_vocabulary_prompt,
        clean_tamil_slang_value,
        fill_form_multi_agent,
    )

    passed = 0
    total = 0
    errors: list[str] = []

    def check(condition: bool, label: str) -> None:
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
        else:
            errors.append(f"Benchmark failed: {label}")

    # Gate 1: Whisper temperature & language normalization
    check(DEFAULT_WHISPER_TEMPERATURE == 0.0, "Whisper temperature == 0.0")
    check(normalize_whisper_language("tamil") == "ta", "normalize_whisper_language('tamil') == 'ta'")
    check(normalize_whisper_language("tanglish") is None, "normalize_whisper_language('tanglish') is None")

    # Gate 2: Whisper 224-token prompt budget (<= 450 chars)
    fields = [
        {"fieldKey": "full_name", "label": "Full Legal Name", "type": "text", "required": True},
        {"fieldKey": "email", "label": "Email Address", "type": "email", "required": True},
        {"fieldKey": "age", "label": "Age", "type": "number", "required": False},
        {
            "fieldKey": "department",
            "label": "Department",
            "type": "dropdown",
            "required": True,
            "validation": {"options": ["Engineering", "Sales", "Marketing", "HR"]},
        },
        {
            "fieldKey": "skills",
            "label": "Technical Skills",
            "type": "multiselect",
            "required": False,
            "validation": {"options": ["Python", "React", "SQL", "Docker"]},
        },
    ]
    vp = build_whisper_vocabulary_prompt(fields, "Engineering Application")
    cp = build_form_creation_whisper_prompt(fields)
    check(len(vp) <= 450, f"Vocabulary prompt length <= 450 (got {len(vp)})")
    check(len(cp) <= 450, f"Creation prompt length <= 450 (got {len(cp)})")

    # Gate 3: Hallucination & loop stripping
    cleaned_h = clean_whisper_hallucinations("En peru Arun da. Thank you for watching.")
    check(cleaned_h == "En peru Arun da.", f"Trailing hallucination stripped (got {cleaned_h!r})")

    # Gate 4: Self-correction & slang normalization
    check(clean_tamil_slang_value("machi vandhu Sales illa illa Engineering-la irukken da") == "Engineering", "Self-correction & slang stripping")

    # Gate 5: Held-out end-to-end Tanglish multi-agent extraction (deterministic mode)
    import ai_filler.agents.form_agents as fa
    orig_invoke = fa._invoke_structured_json
    fa._invoke_structured_json = lambda *a, **kw: None
    try:
        held_out_utterance = (
            "Vanakkam anna, ennoda peru Surya Prakash da\n"
            "en mail id vandhu surya dot prakash at techjays dot com\n"
            "en vayasu vandhu 24 illa illa muppathi rendu\n"
            "department vandhu Marketing illa Engineering la vela seiren\n"
            "skills vandhu Python-um Docker-um SQL-um theriyum nga\n"
        )
        res = fill_form_multi_agent(
            source_text=held_out_utterance,
            fields=fields,
            form_title="Engineering Application",
        )
        ext = res["fields"]
        check(ext.get("full_name") == "Surya Prakash", f"Held-out name == 'Surya Prakash' (got {ext.get('full_name')!r})")
        check(ext.get("email") == "surya.prakash@techjays.com", f"Held-out email (got {ext.get('email')!r})")
        check(ext.get("age") == 32, f"Held-out self-corrected age == 32 (got {ext.get('age')!r})")
        check(ext.get("department") == "Engineering", f"Held-out self-corrected department == 'Engineering' (got {ext.get('department')!r})")
        check(set(ext.get("skills", [])) == {"Python", "Docker", "SQL"}, f"Held-out skills (got {ext.get('skills')!r})")

        # Gate 6: Automated Voice Interviewer commands & option collision guard
        from ai_filler.agents.form_agents import detect_voice_interview_command
        check(detect_voice_interview_command("machi vittudu da") == "skip", "Tanglish 'vittudu' -> skip")
        check(detect_voice_interview_command("மறுபடியும் சொல்லு") == "repeat", "Tamil 'மறுபடியும் சொல்லு' -> repeat")
        check(
            detect_voice_interview_command("Engineering", active_field=fields[3]) is None,
            "Dropdown option 'Engineering' not shadowed by voice command detector",
        )

        # Gate 7: Production Logging & PII Redaction
        from ai_filler.logging_utils import redact_pii
        redacted_sample = redact_pii({"password": "123", "note": "mail surya@techjays.com with key gsk-1234567890abcdef"})
        check(
            redacted_sample["password"] == "[REDACTED]" and "[REDACTED_EMAIL]" in redacted_sample["note"],
            "Shift-left PII & secret redaction verified",
        )
    finally:
        fa._invoke_structured_json = orig_invoke

    return passed, total, errors


def main() -> int:
    s_pass, s_total, s_errs = validate_skills_structure()
    b_pass, b_total, b_errs = validate_held_out_nlp_and_whisper_benchmarks()

    total_pass = s_pass + b_pass
    total_checks = s_total + b_total
    score = (total_pass / total_checks * 100.0) if total_checks else 0.0

    print(f"[MS-SkillOpt Validation Gate] Skills Checked: {s_pass}/{s_total} | Held-Out Benchmarks: {b_pass}/{b_total} | Gate Score: {score:.1f}%")
    for err in s_errs + b_errs:
        print(f"  [FAIL] {err}")

    return 0 if score == 100.0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
