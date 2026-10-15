---
name: professional-researcher
description: >-
  Conduct deep technical web and codebase research, verify primary API documentation
  (Groq Whisper STT, Llama-3.3-70B, LangChain, FastAPI, React), benchmark model accuracy
  (WER, F1, schema compliance), and produce evidence-backed engineering recommendations
  with exact source citations. Activate this skill whenever the user asks to research
  API improvements, increase model accuracy, evaluate libraries, or benchmark pipelines.
---

# Professional Researcher Skill

Use this skill to perform rigorous, primary-source-verified technical research and accuracy optimization for **Filler_AI**.

## Core Workflow

1. **Primary-Source API Verification**:
   - Never rely solely on training weights for fast-evolving APIs (GroqCloud, Whisper, Llama, Pydantic, FastAPI).
   - Use `/browser` or `search_web` + `read_url_content` to verify official documentation (`console.groq.com/docs/speech-to-text`, `console.groq.com/docs/models`, `console.groq.com/docs/structured-outputs`).
   - Check [groq-api-reference.md](./references/groq-api-reference.md) for verified Groq STT and LLM parameters, token budgets, and rate/accuracy trade-offs.

2. **Hypothesis-Driven Accuracy Optimization**:
   - Identify failure modes first (e.g., Whisper silence hallucinations, Tanglish code-switching misspellings, spoken email/date formatting, self-corrections).
   - Formulate targeted interventions at each stage:
     - **Audio Capture Layer**: 16 kHz mono WebRTC constraints (`sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true`).
     - **ASR Decoding Layer**: `whisper-large-v3` with `temperature=0.0`, `<224`-token stylistic/glossary `prompt` priming, and appropriate `language` selection (`"ta"` for pure Tamil, `None` for Tanglish code-switching).
     - **Post-Processing & Multi-Agent Layer**: Hallucination/loop stripping $\rightarrow$ deterministic normalizer $\rightarrow$ `llama-3.3-70b-versatile` (`temperature=0.0`) schema extractor $\rightarrow$ Critic verification.

3. **Citation & Provenance Standard**:
   - Every architectural claim or parameter change must cite both the external documentation source and the exact codebase location (`[file.py](file:///absolute/path#L10-L25)`).
   - Distinguish clearly between **Empirical Test Results** (verified via `pytest`) and **Theoretical Benchmarks**.

4. **Verification & Benchmarking Step**:
   - Always write or update deterministic unit/integration tests in `ai-filler/tests/test_platform_workflows.py` and run:
     `.venv/bin/python -m pytest -o pythonpath=src tests/test_platform_workflows.py`
