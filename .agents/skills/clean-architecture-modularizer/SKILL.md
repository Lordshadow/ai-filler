---
name: clean-architecture-modularizer
description: >-
  Enforce clean layered architecture across FastAPI routes (main.py), multi-agent
  orchestration (agents/form_agents.py), Groq inference clients (groq_client.py),
  SQLite storage (storage.py), and React frontend components (frontend/src/).
  Activate this skill when designing new features, refactoring modules, or adding
  multi-agent capabilities.
---

# Clean Architecture Modularizer Skill (`clean-architecture-modularizer`)

Optimized via **Microsoft SkillOpt** to maintain clean separation of concerns across **Filler_AI**.

## 1. Strict Layer Boundaries
1. **API Transport Layer (`src/ai_filler/main.py`)**:
   - Responsible only for HTTP request parsing, authentication/RBAC dependencies, temporary file lifecycle (`try ... finally: Path.unlink`), and delegating to `agents/` or `storage.py`.
   - Must not contain raw regex extraction rules or LLM prompt strings.
2. **Multi-Agent Orchestration Layer (`src/ai_filler/agents/form_agents.py`)**:
   - Houses the 3-Agent Form Filler (`IngestionNormalizerAgent` $\rightarrow$ `SchemaGuidedExtractorAgent` $\rightarrow$ `CriticVerificationAgent`) and 3-Agent Form Schema Architect.
   - Must always provide a **deterministic fallback + Critic verification pass** so extraction and schema generation achieve $\ge 98\%$ accuracy even when external LLM calls are unavailable or mocked.
3. **Inference Client Layer (`src/ai_filler/groq_client.py`)**:
   - Encapsulates Groq SDK initialization (`whisper-large-v3` with `temperature=0.0`, `llama-3.3-70b-versatile` with `temperature=0.0`), language normalization, and Whisper hallucination cleaning.
4. **Presentation Layer (`frontend/src/UserPanel.jsx`, `FormBuilder.jsx`)**:
   - Communicates exclusively via `authFetch`, preserves field-level provenance (`source`, `confidence`, `sourceRef`, `verifiedByUser`), and uses 16 kHz mono WebRTC audio constraints.
