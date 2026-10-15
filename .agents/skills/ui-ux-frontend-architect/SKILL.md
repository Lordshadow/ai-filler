---
name: ui-ux-frontend-architect
description: >-
  Design and implement high-craft enterprise React UI/UX for Filler_AI, including
  dynamic Form Builders, AI Smart-Fill toolbars, real-time voice recording indicators
  (timers, language mode selectors, pipeline steppers), field-level confidence pills,
  and source provenance badges. Activate this skill when building, styling, or refining
  frontend components in ai-filler/frontend/src/.
---

# UI/UX Frontend Architect Skill

Use this skill when designing, building, or upgrading React UI components in `ai-filler/frontend/src/` (`UserPanel.jsx`, `FormBuilder.jsx`, `SubmissionsManager.jsx`, `App.css`).

## 1. Visual & Aesthetic Standards
- **Enterprise Precision Palette**:
  - Crisp slate/zinc surfaces (`#f8fafc`, `#ffffff`), subtle `1px solid #e2e8f0` structural borders, and high-contrast slate typography (`#0f172a` primary, `#475569` secondary).
  - Semantic status colors:
    - **High Confidence (`≥ 85%`)**: Emerald (`#dcfce7` bg, `#166534` text, `#22c55e` accent)
    - **Needs Review (`60% – 84%`)**: Amber (`#fef3c7` bg, `#92400e` text, `#f59e0b` accent)
    - **Recording / Error (`< 60%`)**: Rose/Red (`#fef2f2` bg, `#dc2626` text, `#ef4444` border)
    - **Multi-Agent Processing**: Royal Blue (`#eff6ff` bg, `#1d4ed8` text, `#3b82f6` border)

## 2. Voice Capture & Multi-Agent Feedback UX
1. **16 kHz Mono WebRTC Audio Constraints**:
   - Always request `navigator.mediaDevices.getUserMedia` with:
     ```js
     {
       audio: {
         channelCount: 1,
         sampleRate: 16000,
         echoCancellation: true,
         noiseSuppression: true,
         autoGainControl: true,
       }
     }
     ```
2. **3-State Voice Control Experience**:
   - **Ready State**: Display the **Voice Language Mode Selector** (`🌐 Auto (Tamil Slang / Tanglish / EN)`, `🇮🇳 Tamil & Slang (தமிழ்)`, `🇬🇧 English`) alongside the microphone button.
   - **Recording State**: Show a pulsing indicator, live elapsed duration timer (`MM:SS`), and clear "Stop Voice" CTA with `aria-live="polite"`.
   - **Multi-Agent Processing State**: Display the active 3-Agent pipeline stage (`Whisper-v3 STT → Tanglish/Slang Normalizer → Schema Extractor & Critic`) and render a collapsible **Voice Transcript & Accuracy Banner** once completed.

## 3. Field-Level Provenance & Confidence Badges
- Every field populated by Voice or Document AI must display:
  - **Source Tag**: `🎤 AI Voice` or `📄 AI Document` or `✍️ Manual`.
  - **Confidence Score Pill**: Formatted percentage (e.g., `99%`) color-coded by confidence tier.
  - **Automatic Switch to Manual Provenance**: Whenever a user edits an AI-populated field, update its provenance source to `"manual"` and `verifiedByUser: true`.

## 4. Verification Step
- Always verify frontend changes by running a production build inside `ai-filler/frontend`:
  `npm run build`
