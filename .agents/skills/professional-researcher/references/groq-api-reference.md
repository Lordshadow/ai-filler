# Verified GroqCloud API Reference (STT & LLM)

## 1. Speech-to-Text (`audio.transcriptions.create`)

| Model ID | WER (Multilingual) | Speed Factor | Translations Support | Best Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `whisper-large-v3` | ~10.3% | 189x | Yes (`/audio/translations`) | Highest accuracy for Tamil, Tanglish slang, Indian accents, and code-switched audio |
| `whisper-large-v3-turbo` | ~12.0% | 216x | No (transcription only) | Low-latency English-only dictation |

### Critical Parameters for Maximum Accuracy
- **`temperature=0.0`**: Forces greedy deterministic decoding; prevents random lexical hallucinations during pauses.
- **`prompt` (Max 224 tokens / ~450 chars)**:
  - Whisper only attends to the **final 224 tokens** of `prompt`.
  - Acts as a **prior transcript continuation**, NOT an instruction. Never write *"Please transcribe accurately"*; instead provide sample domain labels, options, Tamil script (`தமிழ்`), and Romanized Tanglish phrases (`en peru, vayasu, porandha thedhi, mail id`).
- **`language` (ISO-639-1)**:
  - Pass `"ta"` when audio is predominantly Tamil.
  - Omit (`None`) when audio is **Tanglish** (code-switched Tamil + English) so Whisper can emit both Latin technical terms and Tamil/Tanglish tokens guided by `prompt`.
- **Silence Hallucination & Loop Filtering**:
  - Filter known Whisper trailing-silence artifacts (`"Thank you for watching."`, `"Subtitles by..."`, `"amara.org"`) and collapse 3+ consecutive phrase repetitions.

## 2. LLM Extraction & Critic Models (`chat.completions.create`)

- **`llama-3.3-70b-versatile`**:
  - 131k context window, 32k max output tokens, ~280 tokens/sec.
  - Set `temperature=0.0` for deterministic JSON field extraction and schema synthesis.
- **`llama-3.1-8b-instant`**:
  - ~560 tokens/sec; suitable for fast lightweight text normalization.
