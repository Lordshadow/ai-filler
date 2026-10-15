---
name: tamil-tanglish-voice-nlp
description: >-
  Optimize Tamil script (தமிழ்), spoken Tamil slang (பேச்சுத் தமிழ்), and Romanized
  Tanglish code-switched speech transcription and multi-agent form extraction.
  Activate this skill when working on Whisper prompt engineering, Tamil/Tanglish
  slang normalization, spoken Tamil numbers/dates/emails, self-correction repair,
  or multi-agent form filling and schema generation in groq_client.py and form_agents.py.
---

# Tamil & Tanglish Voice NLP Skill

Use this skill when maintaining or extending the Tamil slang, Tanglish, and Tamil script voice-to-form and voice-to-schema pipelines in `ai-filler/src/ai_filler/groq_client.py` and `ai-filler/src/ai_filler/agents/form_agents.py`.

## 1. Whisper-Large-v3 Conditioning Rules
1. **Token Budget (`<= 450` chars / `< 224` tokens)**:
   - Whisper only reads the last 224 tokens of `prompt`. Keep `build_whisper_vocabulary_prompt()` and `build_form_creation_whisper_prompt()` under 450 characters so the Tamil script + Romanized Tanglish slang primer at the tail is never truncated.
2. **Language Selection (`normalize_whisper_language`)**:
   - `"ta"` / `"tamil"` $\rightarrow$ `"ta"` (forces Tamil phonetic decoding).
   - `"auto"` / `"tanglish"` / `"tamil_slang"` $\rightarrow$ `None` (enables bilingual Tamil + English code-switching).
   - `"en"` / `"english"` $\rightarrow$ `"en"`.

## 2. Colloquial Tamil Slang & Tanglish Normalization (`clean_tamil_slang_value`)
Consult [tamil-tanglish-lexicon.md](./references/tamil-tanglish-lexicon.md) for the complete mapping of:
- **Vocatives & Conversational Fillers**: `machi`, `machan`, `maapla`, `anna`, `thambi`, `akka`, `bro`, `boss`, `thala`, `vandhu`, `adhavadhu`, `seri`, `apram`.
- **Agglutinative Case Suffixes**:
  - Locative `-la` / `-le` / `-ல` (`"engineering-la"` $\rightarrow$ `"Engineering"`, `"chennai-la"` $\rightarrow$ `"Chennai"`).
  - Conjunctive `-um` / `-உம்` (`"Python-um React-um"` $\rightarrow$ `["Python", "React"]`).
  - Dative `-ku` / `-க்கு` (`"sales-ku"` $\rightarrow$ `"Sales"`).
- **Trailing Copulas & Particles**: `irukken`, `irukku`, `vela seiren`, `theriyum`, `padichen`, `da`, `pa`, `ma`, `nga`, `bro`.
- **Mid-Sentence Self-Corrections**:
  - When a speaker corrects themselves mid-utterance using `"illa illa"`, `"sorry"`, `"no wait"`, `"இல்ல இல்ல"`, or `"அல்ல"` (e.g., `"vayasu 27 illa illa 28"` or `"department sales illa engineering"`), discard the retracted span before the correction marker and keep the repaired value (`28`, `Engineering`).

## 3. Validation Checklist
- Run `pytest` on the Tamil slang & Whisper test suite after any change:
  `.venv/bin/python -m pytest -o pythonpath=src tests/test_platform_workflows.py -k "tamil_slang or groq_whisper"`
