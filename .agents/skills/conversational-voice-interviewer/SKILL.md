---
name: conversational-voice-interviewer
description: Design and implement production-grade, fully automated field-by-field conversational voice form interviews using Web Speech API TTS (English & Tamil ta-IN), Web Audio API AnalyserNode Voice Activity Detection (VAD) with silence hangover auto-stop, acoustic feedback loop prevention, multilingual voice navigation commands, and real-time AI-Speaking vs. User-Speaking UI indicators. Activate this skill whenever working on automated voice interviews, TTS question synthesis, hands-free turn-taking, or voice UI visualizers.
---

# Conversational Voice Interviewer Skill (`conversational-voice-interviewer`)

Use this skill whenever building, refining, or debugging **hands-free, field-by-field automated voice form filling**, **Text-to-Speech (TTS) question prompting**, **Web Audio API Voice Activity Detection (VAD)**, or **AI-Speaking / User-Speaking visual indicators**.

---

## 1. Turn-Taking State Machine Architecture

A production-grade automated voice interview must operate as a **strictly serialized, single-owner state machine** so the AI never speaks while the microphone is recording (preventing acoustic self-transcription loops):

```
IDLE
 └─► AI_SPEAKING (TTS speaks field question; Mic & VAD muted)
      └─► LISTENING_WAITING (150ms acoustic buffer elapsed; Mic & VAD open, waiting for speech onset)
           ├─► USER_SPEAKING (RMS > speechThreshold; live waveform + 1.7s silence hangover detector active)
           │    └─► PROCESSING_TURN (Silence hangover reached; MediaRecorder stopped, audio sent to Groq Whisper + Multi-Agent Extractor)
           │         ├─► CONFIRMING_ADVANCE (Field valid -> fill value, speak brief confirmation, advance to next field)
           │         ├─► RETRYING_FIELD (Validation failed or empty -> AI speaks helpful retry prompt, stays on current field)
           │         └─► COMMAND_EXECUTED (Voice command: skip / repeat / previous / stop / clear)
           └─► NO_SPEECH_TIMEOUT (10s elapsed without speech onset -> AI prompts retry or pauses cleanly)
```

### Mandatory State Machine Guardrails
1. **Abort Token / Session Generation Counter (`interviewSessionIdRef`)**:
   - Increment `interviewSessionIdRef.current` whenever the user pauses, stops, skips, or switches forms.
   - Every async callback (`utterance.onend`, VAD interval, `/ai/fill-form/voice` response, `setTimeout`) must verify `sessionId === interviewSessionIdRef.current` before mutating state or starting the next turn.
2. **Acoustic Echo & Feedback Prevention**:
   - **Never** connect `audioContext.createMediaStreamSource(stream)` to `audioContext.destination`. Connect it strictly to `analyserNode`.
   - Call `window.speechSynthesis.cancel()` before starting any recording.
   - Wait **150ms** after TTS completion before enabling `MediaRecorder` and VAD energy sampling.
   - Request microphone constraints with hardware/browser acoustic guards enabled:
     ```javascript
     navigator.mediaDevices.getUserMedia({
       audio: {
         echoCancellation: true,
         noiseSuppression: true,
         autoGainControl: true,
       }
     })
     ```

---

## 2. Web Audio API Voice Activity Detection (VAD) & Silence Auto-Stop

Hands-free field-by-field filling requires **automatic end-of-speech detection** so the user never has to click "Stop" after every answer.

### RMS Energy Calculation (`AnalyserNode`)
Use time-domain waveform samples (`getByteTimeDomainData`) to compute normalized Root-Mean-Square (RMS) energy in `[0.0, 1.0]`:

```javascript
function computeRmsAndBars(analyser, dataArray, freqArray) {
  analyser.getByteTimeDomainData(dataArray);
  let sumSquares = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = (dataArray[i] - 128) / 128.0;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / dataArray.length);

  analyser.getByteFrequencyData(freqArray);
  // Extract 12 visual equalizer bars from human speech frequencies (85Hz - 4000Hz)
  const bars = [];
  const step = Math.max(1, Math.floor((freqArray.length * 0.45) / 12));
  for (let b = 0; b < 12; b++) {
    const val = freqArray[Math.min(freqArray.length - 1, (b + 1) * step)] || 0;
    bars.push(Math.max(8, Math.round((val / 255) * 100)));
  }
  return { rms, bars };
}
```

### VAD Thresholds & Timing Constants
| Parameter | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `SPEECH_ONSET_RMS` | `0.024` (adaptive above ambient noise floor) | Transitions UI from `LISTENING_WAITING` to `USER_SPEAKING` |
| `SILENCE_FLOOR_RMS` | `0.016` | Below this threshold after speech onset counts toward silence hangover |
| `MIN_SPEECH_DURATION_MS` | `350 ms` | Prevents brief clicks/coughs from triggering an immediate false turn |
| `SILENCE_HANGOVER_MS` | `1700 ms` (`2100 ms` for `textarea`/`email`) | Continuous silence required after speech before auto-stopping recording |
| `NO_SPEECH_TIMEOUT_MS` | `10000 ms` | Max wait in `LISTENING_WAITING` before prompting user or pausing |
| `MAX_TURN_DURATION_MS` | `25000 ms` | Safety cap per single-field voice answer |

---

## 3. Resilient Bilingual TTS (`window.speechSynthesis` + Fallback)

1. **Voice Selection (`en-IN`, `en-US`, `ta-IN`)**:
   - Listen to `window.speechSynthesis.onvoiceschanged` to cache available voices.
   - When `voiceLanguage === 'ta'`, prefer a `ta-IN` / `ta` voice and speak bilingual/Tamil prompts (`"உங்கள் முழு பெயர் என்ன? Please state your Full Name."`).
   - When `voiceLanguage === 'tanglish'` or `'auto'` or `'en'`, prefer `en-IN` or `en-US` with clear pacing (`rate = 1.0`, `pitch = 1.0`).
2. **Headless / Linux OS Voice Fallback**:
   - On Linux environments without speech-dispatcher voices, `speechSynthesis.getVoices()` may be empty or `utterance.onend` may either fire in `<50ms` or stall indefinitely.
   - Always guard `speakQuestion(text)` with:
     - **Minimum visual/reading floor** (`minDurationMs = Math.min(4500, Math.max(1400, text.length * 42))`) if `onend` fires suspiciously fast (`< 120ms`) due to missing OS TTS voices.
     - **Maximum watchdog timeout** (`maxDurationMs = Math.max(6000, text.length * 95)`) so a hung browser TTS engine never deadlocks the interview.
     - **Web Audio API Earcon Chimes**: Play a soft, pleasant rising two-tone sine chime (`440Hz -> 587Hz`, `90ms`) when the mic opens for the user's turn, and a soft descending confirmation tone (`587Hz -> 784Hz`) when a field is captured.

---

## 4. Multilingual Voice Navigation Commands

Before extracting a field value, inspect the transcript for explicit **spoken control intents** across English, Tamil script (`தமிழ்`), and Romanized Tanglish:

| Command Intent | Trigger Phrases (Case-Insensitive Exact/Short Utterance Match) | Action |
| :--- | :--- | :--- |
| **`skip`** | `"skip"`, `"next"`, `"next field"`, `"pass"`, `"vittudu"`, `"aduthadhu"`, `"adutha kelvi"`, `"அடுத்தது"`, `"விட்டுடு"` | If field is optional, advance to `index + 1`. If `required`, AI explains field is required and re-prompts (unless user clicks Force Skip). |
| **`repeat`** | `"repeat"`, `"say again"`, `"repeat question"`, `"pardon"`, `"what was the question"`, `"marupadiyum sollu"`, `"innoru thadava sollu"`, `"மறுபடியும் சொல்லு"` | Re-speak the current field prompt and listen again. |
| **`previous`** | `"go back"`, `"previous"`, `"previous field"`, `"back"`, `"munnadi po"`, `"munthaiya kelvi"`, `"முந்தைய கேள்வி"`, `"பின்னாடி போ"` | Move to `Math.max(0, index - 1)` and prompt that field. |
| **`clear`** | `"clear"`, `"clear field"`, `"reset"`, `"azhichidu"`, `"அழிச்சிடு"` | Clear current field value and re-listen. |
| **`stop`** | `"stop"`, `"stop interview"`, `"pause"`, `"cancel"`, `"exit"`, `"niruthu"`, `"pothum"`, `"நிறுத்து"`, `"போதும்"` | Gracefully exit automated voice interview mode and release microphone. |

---

## 5. Production-Grade UI Indicators (AI Speaking vs. User Speaking)

Every phase of the automated voice interview must have unmistakable, accessible (`aria-live="polite"`) visual telemetry:

1. **Voice Interview Studio Banner / HUD**:
   - **Progress Header**: `Field X of N` progress bar, percentage complete, and a toggleable `"Auto-Advance"` mode.
   - **AI Speaking Indicator (`AI_SPEAKING`)**:
     - Animated indigo/purple concentric soundwave orb (`ai-speaking-orb`).
     - Status badge: `"🔊 AI Assistant Speaking"`.
     - Live subtitle card showing the exact question being spoken + option pills if the field is a `dropdown` or `multiselect`.
   - **User Listening / Speaking Indicator (`LISTENING_WAITING` & `USER_SPEAKING`)**:
     - Status badge switches dynamically from `"🎙️ Ready — Waiting for your voice..."` (teal pulse) to `"🗣️ User Speaking — Listening Live"` (vibrant emerald pulse).
     - **12-Bar Live Frequency Equalizer** driven by `AnalyserNode` RMS/frequency data.
     - **Auto-Stop Silence Progress Bar / Ring**: Once the user finishes speaking, displays `"Auto-submitting in 1.5s..."` with a smooth progress bar that resets immediately if the user continues speaking.
     - Manual `"Done Speaking ✓"` instant-submit button for noisy environments where background noise exceeds the silence floor.
   - **Processing & Validation Indicator (`PROCESSING_TURN` / `RETRYING_FIELD`)**:
     - Shows `"🧠 Transcribing & Validating Answer..."` with the captured transcript preview and either a green `"✓ Filled: <value>"` confirmation toast or an amber `"⚠️ Needs clarification: <reason>"` retry banner.
2. **Active Field Card Spotlight**:
   - Smoothly scroll the active form field card into the center of the viewport (`scrollIntoView({ behavior: 'smooth', block: 'center' })`).
   - Highlight the active field card with a state-matched border glow (`indigo` when AI is asking, `emerald` when user is speaking, `amber` when validating/retrying).
