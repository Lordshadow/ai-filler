---
name: ms-skillopt
description: >-
  Microsoft Research SkillOpt text-space skill optimizer and validation gate.
  Treats SKILL.md and agent system prompts as trainable text parameters using
  Forward Rollout, Trajectory Reflection, Bounded Edits (Add/Delete/Replace),
  Held-Out Validation Gating, and SkillOpt-Sleep transcript consolidation.
  Activate this skill when creating, optimizing, evaluating, or self-improving
  agent skills, prompts, or multi-agent workflows.
---

# Microsoft SkillOpt (`ms-skillopt`) — Text-Space Skill Optimizer

Based on **Microsoft Research's `microsoft/SkillOpt`** framework (*"Training the Text, Not the Weights"*), this skill treats every `SKILL.md` and multi-agent prompt as a **mutable text-space parameter** governed by a strict **Held-Out Validation Gate**.

## 1. The 4-Stage SkillOpt Optimization Loop

Whenever optimizing an existing skill, system prompt, or agent workflow:

1. **Stage 1 — Forward Pass (Rollout)**:
   - Execute the target coding or extraction task using the current `SKILL.md` / prompt configuration.
   - Capture the full execution trajectory: tool calls, latency, intermediate agent traces, and test outcomes.

2. **Stage 2 — Backward Pass (Trajectory Reflection & Bounded Edits)**:
   - Analyze failure modes or suboptimal steps in the trajectory (e.g., Whisper token truncation $>224$ tokens, monkeypatch target mismatch, unhandled Tamil slang suffix).
   - Propose **bounded text-space edits** (`ADD`, `REPLACE`, `DELETE`) to the target `SKILL.md` or agent prompt:
     - Keep total `SKILL.md` length compact ($< 400$ lines / $< 1,500$ tokens) for zero inference-time overhead.
     - Check the **Rejected-Edit Buffer** in [skillopt-methodology.md](./references/skillopt-methodology.md) so previously rejected rules are never re-introduced.

3. **Stage 3 — Held-Out Validation Gate (Mandatory)**:
   - Run the executable SkillOpt validation gate script before accepting any edit:
     ```bash
     /home/shadow/Documents/Techjays_training/Filler_AI/ai-filler/.venv/bin/python \
       /home/shadow/Documents/Techjays_training/Filler_AI/.agents/skills/ms-skillopt/scripts/validate_skill_gate.py
     ```
   - **Acceptance Rule**: A candidate edit is committed to `SKILL.md` (and exported to `best_skill.md` metadata) **if and only if** the validation gate score is $\ge$ the baseline score with $100\%$ test pass rate.

4. **Stage 4 — `SkillOpt-Sleep` (Offline Transcript Consolidation)**:
   - Inspect recent session transcripts in `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
   - Mine recurring friction points (e.g., environment shebang quirks, import paths, spoken self-corrections) and consolidate them into the appropriate workspace `SKILL.md` behind the validation gate.
