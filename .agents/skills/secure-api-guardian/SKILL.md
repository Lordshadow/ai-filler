---
name: secure-api-guardian
description: >-
  Audit and enforce enterprise API security across FastAPI endpoints, including
  Double-Submit Cookie CSRF protection, multi-tier RBAC (Super Admin, Org Admin,
  End User), file upload magic-byte & size validation, SQLite parameterized queries,
  and secret protection. Activate this skill when adding or modifying endpoints,
  authentication, file uploads, or database queries.
---

# Secure API Guardian Skill (`secure-api-guardian`)

Optimized via **Microsoft SkillOpt** to prevent security regressions in `ai-filler/src/ai_filler/`.

## 1. Authentication, RBAC & CSRF Guardrails
1. **Multi-Tier Role Enforcement**:
   - Every mutating or sensitive route in `main.py` must declare `actor: dict[str, Any] = Depends(get_current_actor)` or `Depends(require_admin_actor)` / `Depends(require_super_admin_actor)`.
   - Verify tenant isolation: Organization Admins (`kind == "admin"`) may only mutate forms and view applications belonging to their `organization_id`, whereas Super Admins (`kind == "super_admin"`) govern cross-organization resources.
2. **Double-Submit Cookie CSRF Protection**:
   - All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated via session cookies or bearer tokens must pass CSRF validation (`X-CSRF-Token` matching cookie `csrf_token`).

## 2. File Upload & Input Hardening
1. **Multipart Audio & Document Uploads (`/transcribe`, `/ai/fill-form/*`, `/ai/generate-form/*`)**:
   - Enforce strict file extension allowlists (`.webm`, `.wav`, `.mp3`, `.m4a`, `.ogg`, `.pdf`, `.docx`, `.txt`, `.png`, `.jpg`, `.jpeg`, `.webp`).
   - Enforce maximum byte size limits (`MAX_UPLOAD_BYTES`) while streaming chunks to a temporary file (`tempfile.NamedTemporaryFile(delete=False)`) and **always** unlink the temporary file inside a `finally:` block.
2. **Zero Secret Leakage**:
   - Never log or return `GROQ_API_KEY`, password hashes, or raw session tokens in HTTP error responses or tracebacks.
