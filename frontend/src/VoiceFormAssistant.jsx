import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Mic, MicOff, Repeat2, Send, SkipForward, Sparkles, Volume2, X } from "lucide-react";
import "./VoiceFormAssistant.css";

const COMMANDS = {
  repeat: ["repeat", "say again", "repeat question", "marupadiyum sollu", "innoru thadava sollu", "மறுபடியும் சொல்லு"],
  previous: ["previous", "go back", "previous question", "back", "munnadi po", "munthaiya kelvi", "முந்தைய கேள்வி", "பின்னாடி போ"],
  skip: ["skip", "next", "next question", "pass", "vittudu", "aduthadhu", "adutha kelvi", "அடுத்தது", "விட்டுடு"],
  clear: ["clear", "clear field", "reset", "azhichidu", "அழிச்சிடு"],
  stop: ["stop", "stop interview", "pause", "exit", "cancel", "niruthu", "pothum", "நிறுத்து", "போதும்"],
};

function fieldPrompt(field, language) {
  const hint = field.description || field.helpText;
  const options = field.validation?.options;
  const typeHint = options?.length ? ` You can choose ${options.join(", ")}.` : "";
  const question = language === "ta"
    ? `உங்கள் ${field.label} என்ன${field.required ? "" : " (விருப்பம்)"}?`
    : `Please provide your ${field.label}${field.required ? "" : ", if you want"}.`;
  return `${question}${hint ? ` ${hint}` : ""}${typeHint}`;
}

export default function VoiceFormAssistant({
  form,
  values,
  language,
  onLanguageChange,
  onAnswer,
  onAudioAnswer,
  onSpeak,
  onClearField,
  onClose,
}) {
  const fields = (form.fields || []).filter((field) => field.type !== "file");
  const [phase, setPhase] = useState("ready"); // ready | speaking | listening | processing | complete | error
  const [fieldIndex, setFieldIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [interim, setInterim] = useState("");
  const [englishVoice, setEnglishVoice] = useState("alice"); // Alice (ElevenLabs default)
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [audioEnergy, setAudioEnergy] = useState(0);

  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const recognitionResultRef = useRef("");
  const recognitionFallbackRef = useRef(false);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const noSpeechTimeoutRef = useRef(null);
  const captureStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const speechStartedAtRef = useRef(0);
  const noSpeechTimedOutRef = useRef(false);
  const audioChunksRef = useRef([]);
  const discardCaptureRef = useRef(false);
  const activeAudioRef = useRef(null);
  const activeAudioUrlRef = useRef(null);
  const handleAnswerRef = useRef(null);
  const generationRef = useRef(0);
  const timeoutRef = useRef(null);

  const currentField = fields[fieldIndex];

  const stopCapture = useCallback(() => {
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch { /* Already stopped. */ }
    }
    window.clearInterval(vadIntervalRef.current);
    window.clearTimeout(noSpeechTimeoutRef.current);
    vadIntervalRef.current = null;
    noSpeechTimeoutRef.current = null;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    setUserSpeaking(false);
    setAudioEnergy(0);
  }, []);

  const stopSpeechPlayback = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (activeAudioRef.current) {
      activeAudioRef.current.onended = null;
      activeAudioRef.current.onerror = null;
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (generation) => {
    const MediaRecorderClass = window.MediaRecorder || window.webkitMediaRecorder;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorderClass !== "function") {
      setPhase("error");
      setError("Voice recording is not supported in this browser. You can type your answer below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = supportedTypes.find((type) => MediaRecorderClass.isTypeSupported?.(type));
      const recorder = mimeType
        ? new MediaRecorderClass(stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorderClass(stream, { audioBitsPerSecond: 32000 });

      recorderRef.current = recorder;
      audioChunksRef.current = [];
      captureStartedAtRef.current = performance.now();
      speechStartedAtRef.current = 0;
      lastSpeechAtRef.current = 0;
      noSpeechTimedOutRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        if (generation === generationRef.current) {
          stopCapture();
          setPhase("error");
          setError("Microphone recording interrupted. Please try again or type below.");
        }
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        stopCapture();
        if (discardCaptureRef.current) {
          discardCaptureRef.current = false;
          return;
        }
        if (generation !== generationRef.current || chunks.length === 0) return;
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

        if (noSpeechTimedOutRef.current || audioBlob.size === 0) {
          setPhase("ready");
          setMessages((current) => [
            ...current,
            { role: "assistant", text: "I didn't hear an answer. Feel free to speak or type below." },
          ]);
          return;
        }

        setPhase("processing");
        try {
          const answerResult = await onAudioAnswer(audioBlob, fields[fieldIndex], language);
          const transcript = typeof answerResult === "string" ? answerResult : answerResult?.text;
          const isPopulated = typeof answerResult === "object" ? Boolean(answerResult?.populated) : false;
          const detectedCommand = typeof answerResult === "object" ? answerResult?.command : null;

          if (generation === generationRef.current && transcript?.trim()) {
            if (isPopulated) {
              setInterim("");
              setMessages((current) => [...current, { role: "user", text: transcript.trim() }]);
              const nextIndex = fieldIndex + 1;
              if (nextIndex >= fields.length) {
                ask(nextIndex, generation);
                return;
              }
              const confirmation = language === "ta" ? "சரி." : "Got it.";
              setMessages((current) => [...current, { role: "assistant", text: confirmation }]);
              setPhase("speaking");
              speak(confirmation, generation, () => ask(nextIndex, generation));
            } else {
              handleAnswerRef.current?.(transcript.trim(), generation, detectedCommand);
            }
          } else if (generation === generationRef.current) {
            setPhase("error");
            setError("I couldn't hear a clear answer. Please try again or type it below.");
          }
        } catch (transcriptionError) {
          if (generation === generationRef.current) {
            setPhase("error");
            setError(transcriptionError.message || "Voice transcription unavailable. You can retry or type below.");
          }
        }
      };

      recorder.start(250);
      setPhase("listening");
      setError("");
      setInterim("");

      // Web Audio API VAD & Live RMS Level Metering for ChatGPT Orb
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      let audioContext = null;
      let analyser = null;
      try {
        if (AudioContextClass) {
          audioContext = new AudioContextClass();
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          audioContext.createMediaStreamSource(stream).connect(analyser);
          audioContextRef.current = audioContext;
          if (audioContext.state === "suspended") await audioContext.resume();
        }
      } catch {
        if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
        audioContext = null;
        analyser = null;
      }

      if (audioContext?.state === "running" && analyser) {
        const samples = new Uint8Array(analyser.fftSize);
        vadIntervalRef.current = window.setInterval(() => {
          if (generation !== generationRef.current || recorder.state !== "recording") return;
          const now = performance.now();
          analyser.getByteTimeDomainData(samples);
          let sumSquares = 0;
          for (let i = 0; i < samples.length; i += 1) {
            const normalized = (samples[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / samples.length);

          if (rms >= 0.024) {
            if (!speechStartedAtRef.current) speechStartedAtRef.current = now;
            lastSpeechAtRef.current = now;
            setUserSpeaking(true);
            const energy = Math.min(1, Math.max(0, (rms - 0.02) / 0.08));
            setAudioEnergy(energy);
          } else {
            setAudioEnergy((prev) => Math.max(0, prev * 0.72));
            const currentFieldType = fields[fieldIndex]?.type;
            const silenceLimit = currentFieldType === "textarea" ? 1200 : 750;
            if (speechStartedAtRef.current && now - lastSpeechAtRef.current >= silenceLimit && now - speechStartedAtRef.current >= 300) {
              recorder.stop();
              return;
            }
          }

          if (!speechStartedAtRef.current && now - captureStartedAtRef.current >= 10000) {
            noSpeechTimedOutRef.current = true;
            recorder.stop();
            return;
          }
          if (now - captureStartedAtRef.current >= 28000) {
            recorder.stop();
          }
        }, 80);
      } else {
        setUserSpeaking(false);
        setAudioEnergy(0);
        noSpeechTimeoutRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, 25000);
      }
    } catch (captureError) {
      if (generation !== generationRef.current) return;
      stopCapture();
      setPhase("error");
      setError(
        captureError.name === "NotAllowedError"
          ? "Please allow microphone access to talk through the form."
          : "Could not start microphone. You can type your answer below."
      );
    }
  }, [fieldIndex, fields, language, onAudioAnswer, stopCapture]);

  const listen = useCallback((generation) => {
    if (generation !== generationRef.current) return;
    window.speechSynthesis?.cancel();
    setPhase("listening");
    setError("");
    setInterim("");
    timeoutRef.current = window.setTimeout(() => {
      if (generation === generationRef.current) void startRecording(generation);
    }, 150);
  }, [startRecording]);

  const speak = useCallback(async (text, generation, onEnded = () => {}) => {
    if (generation !== generationRef.current) return;
    let completed = false;
    let watchdog = null;

    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(watchdog);
      if (activeAudioRef.current) {
        activeAudioRef.current.onended = null;
        activeAudioRef.current.onerror = null;
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
        activeAudioRef.current = null;
      }
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
        activeAudioUrlRef.current = null;
      }
      if (generation === generationRef.current) onEnded();
    };

    const speakWithDevice = () => {
      if (!("speechSynthesis" in window)) { finish(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === "ta" ? "ta-IN" : language === "en-us" ? "en-US" : "en-IN";
      const voices = window.speechSynthesis.getVoices();
      const languagePrefix = language === "ta" ? "ta" : language === "en-us" ? "en-us" : "en-in";
      // Prioritize soft natural female voice from available device voices
      const femaleVoice =
        voices.find((voice) => {
          const name = voice.name.toLowerCase();
          const matchesLang = voice.lang.toLowerCase().startsWith(languagePrefix);
          return (
            matchesLang &&
            (name.includes("female") ||
              name.includes("natural") ||
              name.includes("samantha") ||
              name.includes("zira") ||
              name.includes("veena") ||
              name.includes("kavya") ||
              name.includes("google"))
          );
        }) ||
        voices.find((voice) => voice.lang.toLowerCase() === languagePrefix) ||
        voices.find((voice) => voice.lang.toLowerCase().startsWith(languagePrefix)) ||
        voices.find((voice) => voice.lang.toLowerCase().startsWith(language === "ta" ? "ta" : "en")) ||
        null;
      utterance.voice = femaleVoice;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      const startedAt = performance.now();
      utterance.onend = () => {
        const elapsed = performance.now() - startedAt;
        const minimumDuration = Math.min(4500, Math.max(1400, text.length * 42));
        if (elapsed < 120) watchdog = window.setTimeout(finish, minimumDuration - elapsed);
        else finish();
      };
      utterance.onerror = finish;
      watchdog = window.setTimeout(finish, Math.max(6000, text.length * 95));
      window.speechSynthesis.speak(utterance);
    };

    // ElevenLabs Multilingual TTS (supports 29 languages including English & Tamil)
    if (text.length <= 200 && onSpeak) {
      try {
        const audioBlob = await onSpeak(text, englishVoice);
        if (generation !== generationRef.current) return;
        const url = URL.createObjectURL(audioBlob);
        activeAudioUrlRef.current = url;
        const audio = new Audio(url);
        activeAudioRef.current = audio;
        audio.playbackRate = 1;
        audio.onended = finish;
        audio.onerror = () => {
          window.clearTimeout(watchdog);
          watchdog = null;
          stopSpeechPlayback();
          speakWithDevice();
        };
        watchdog = window.setTimeout(finish, Math.max(7000, text.length * 150));
        await audio.play();
        return;
      } catch {
        window.clearTimeout(watchdog);
        watchdog = null;
        stopSpeechPlayback();
        speakWithDevice();
        return;
      }
    }
    speakWithDevice();
  }, [englishVoice, language, onSpeak, stopSpeechPlayback]);

  const ask = useCallback((index, generation = generationRef.current) => {
    if (generation !== generationRef.current) return;
    stopCapture();
    stopSpeechPlayback();

    if (index >= fields.length) {
      setPhase("complete");
      const completion = language === "ta"
        ? "படிவம் முடிந்தது. உங்கள் பதில்களைச் சரிபார்த்துக் கொள்ளலாம்."
        : "All questions are answered! Your form is ready for review.";
      setMessages((current) => [...current, { role: "assistant", text: completion }]);
      speak(completion, generation);
      return;
    }

    const field = fields[index];
    const prompt = fieldPrompt(field, language);
    setFieldIndex(index);
    setInterim("");
    setError("");
    setMessages((current) => [...current, { role: "assistant", text: prompt }]);
    setPhase("speaking");
    speak(prompt, generation, () => {
      timeoutRef.current = window.setTimeout(() => listen(generation), 180);
    });
  }, [fields, language, listen, speak, stopCapture, stopSpeechPlayback]);

  const handleAnswer = useCallback(async (text, generation = generationRef.current, preDetectedCommand = null) => {
    if (!text.trim() || generation !== generationRef.current) return;
    if (recorderRef.current?.state === "recording") {
      discardCaptureRef.current = true;
      recorderRef.current.stop();
    }
    setInterim("");
    setMessages((current) => [...current, { role: "user", text: text.trim() }]);

    const field = fields[fieldIndex];
    const normalized = text.trim().toLocaleLowerCase().replace(/[.!?,;:]+$/g, "");
    const optionValues = (field.validation?.options || []).map((option) => String(option).trim().toLocaleLowerCase());
    const command = preDetectedCommand || (
      optionValues.includes(normalized)
        ? null
        : Object.entries(COMMANDS).find(([, phrases]) => phrases.includes(normalized))?.[0]
    );

    if (command === "stop") {
      const stopped = language === "ta" ? "சரி, இங்கே நிறுத்துகிறேன்." : "Stopping here. You can review your answers.";
      setMessages((current) => [...current, { role: "assistant", text: stopped }]);
      setPhase("complete");
      speak(stopped, generation);
      return;
    }
    if (command === "repeat") { ask(fieldIndex, generation); return; }
    if (command === "previous") { ask(Math.max(0, fieldIndex - 1), generation); return; }
    if (command === "skip") {
      if (field.required) {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "This question is required. Please provide an answer." },
        ]);
        ask(fieldIndex, generation);
      } else {
        ask(fieldIndex + 1, generation);
      }
      return;
    }
    if (command === "clear") {
      onClearField?.(field);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: language === "ta" ? `${field.label} நீக்கிவிட்டேன்.` : `Cleared ${field.label}.` },
      ]);
      ask(fieldIndex, generation);
      return;
    }

    setPhase("processing");
    try {
      const result = await onAnswer(text.trim(), field);
      if (generation !== generationRef.current) return;
      if (!result?.populated) {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "I didn't catch that clearly. Please say it again or type below." },
        ]);
        ask(fieldIndex, generation);
        return;
      }
      const nextIndex = fieldIndex + 1;
      if (nextIndex >= fields.length) {
        ask(nextIndex, generation);
        return;
      }
      const confirmation = language === "ta" ? "சரி." : "Got it.";
      setMessages((current) => [...current, { role: "assistant", text: confirmation }]);
      setPhase("speaking");
      speak(confirmation, generation, () => ask(nextIndex, generation));
    } catch (answerError) {
      if (generation !== generationRef.current) return;
      setPhase("error");
      setError(answerError.message || "Could not process answer. Please retry.");
    }
  }, [ask, fields, fieldIndex, language, onAnswer, onClearField, speak]);

  handleAnswerRef.current = handleAnswer;

  const start = () => {
    const generation = ++generationRef.current;
    setMessages([]);
    setError("");
    const firstEmpty = fields.findIndex((field) => {
      const value = values[field.fieldKey || field.name];
      return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    });
    ask(firstEmpty < 0 ? 0 : firstEmpty, generation);
  };

  const close = () => {
    generationRef.current += 1;
    stopCapture();
    stopSpeechPlayback();
    window.clearTimeout(timeoutRef.current);
    onClose();
  };

  useEffect(() => () => {
    generationRef.current += 1;
    stopCapture();
    stopSpeechPlayback();
    window.clearTimeout(timeoutRef.current);
  }, [stopCapture, stopSpeechPlayback]);

  const sendTypedAnswer = () => {
    const answer = draft.trim();
    if (!answer || phase === "processing") return;
    setDraft("");
    void handleAnswer(answer);
  };

  return (
    <div className="voice-assistant-backdrop" role="presentation">
      <section
        className="voice-assistant"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-assistant-title"
      >
        {/* Header */}
        <header className="voice-assistant-header">
          <button
            className="voice-assistant-icon-button"
            type="button"
            onClick={close}
            aria-label="Close voice assistant"
          >
            <X size={18} />
          </button>
          <div className="voice-assistant-title-wrap">
            <span className="voice-assistant-mini-orb">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 id="voice-assistant-title">Voice Interview Studio</h2>
              <p>{form.title}</p>
            </div>
          </div>

          <label className="voice-assistant-language">
            Language
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              disabled={phase === "listening" || phase === "speaking"}
            >
              <option value="auto">Auto (English / Tamil)</option>
              <option value="en-in">English (India)</option>
              <option value="en-us">English (US)</option>
              <option value="ta">தமிழ் (Tamil)</option>
            </select>
          </label>

          <label className="voice-assistant-language">
            Assistant Voice
            <select
              value="alice"
              disabled
              title="Soft Natural Female Voice"
              aria-label="Assistant Voice: Soft Female Voice"
            >
              <option value="alice">Soft Female Voice</option>
            </select>
          </label>
        </header>

        {/* Progress Bar */}
        <div className="voice-assistant-progress">
          <span
            style={{
              width: `${
                fields.length
                  ? Math.min(100, ((fieldIndex + (phase === "complete" ? 1 : 0)) / fields.length) * 100)
                  : 0
              }%`,
            }}
          />
        </div>

        {/* Central Stage */}
        <div className="voice-assistant-body" aria-live="polite">
          {messages.length === 0 ? (
            <div className="voice-assistant-welcome">
              <div
                className="chatgpt-orb-container state-ready"
                onClick={start}
                title="Click to start voice interview"
              >
                <div className="chatgpt-ambient-glow" />
                <div className="chatgpt-ring ring-1" />
                <div className="chatgpt-ring ring-2" />
                <div className="chatgpt-orb">
                  <div className="chatgpt-orb-inner">
                    <div className="chatgpt-orb-highlight" />
                  </div>
                  <Mic size={38} className="chatgpt-orb-icon" />
                </div>
              </div>
              <h3 className="welcome-title">Talk Through Your Form</h3>
              <p className="welcome-subtitle">
                Powered by ElevenLabs Speech-to-Text and Natural Multilingual Voice. Speak naturally, answer one question at a time, and I'll fill in the details for you.
              </p>
              <button
                type="button"
                className="voice-assistant-start-btn"
                onClick={start}
              >
                <Mic size={18} /> Start Talking
              </button>
            </div>
          ) : (
            <div className="chatgpt-voice-stage">
              {/* Central ChatGPT Voice Orb */}
              <div
                className={`chatgpt-orb-container state-${phase} ${userSpeaking ? "user-active" : ""}`}
                style={{
                  "--audio-scale": 1 + audioEnergy * 0.28,
                  "--audio-glow": `${24 + audioEnergy * 65}px`,
                }}
                onClick={() => {
                  if (phase === "listening") {
                    if (recognitionRef.current) {
                      try { recognitionRef.current.stop(); } catch {}
                    } else if (recorderRef.current?.state === "recording") {
                      recorderRef.current.stop();
                    }
                  } else if (phase === "ready" || phase === "speaking") {
                    listen(generationRef.current);
                  }
                }}
                title={phase === "listening" ? "Click when done speaking" : "Click to speak"}
              >
                <div className="chatgpt-ambient-glow" />
                <div className="chatgpt-ring ring-3" />
                <div className="chatgpt-ring ring-2" />
                <div className="chatgpt-ring ring-1" />
                <div className="chatgpt-orb">
                  <div className="chatgpt-orb-inner">
                    <div className="chatgpt-orb-highlight" />
                    {phase === "processing" && <div className="chatgpt-thinking-ring" />}
                  </div>
                  {phase === "speaking" && <Volume2 size={36} className="chatgpt-orb-icon" />}
                  {phase === "listening" && <Mic size={36} className="chatgpt-orb-icon" />}
                  {phase === "processing" && <Sparkles size={34} className="chatgpt-orb-icon" />}
                  {phase === "ready" && <Mic size={36} className="chatgpt-orb-icon" />}
                  {phase === "complete" && <Check size={40} className="chatgpt-orb-icon" />}
                </div>
              </div>

              {/* Status Pill with Equalizer Bars */}
              <div className="chatgpt-status-pill">
                <span className={`chatgpt-status-dot dot-${phase}`} />
                <span className="chatgpt-status-text">
                  {phase === "speaking" && "Assistant speaking..."}
                  {phase === "listening" && (userSpeaking ? "Hearing your voice..." : "Listening... Speak naturally")}
                  {phase === "processing" && "Thinking & verifying answer..."}
                  {phase === "ready" && "Ready — Tap mic to answer"}
                  {phase === "complete" && "All questions completed!"}
                </span>
                {(phase === "listening" || phase === "speaking") && (
                  <div className="chatgpt-wave-bars">
                    <span className="wave-bar bar-1" />
                    <span className="wave-bar bar-2" />
                    <span className="wave-bar bar-3" />
                    <span className="wave-bar bar-4" />
                  </div>
                )}
              </div>

              {/* Active Question Box */}
              {currentField && phase !== "complete" && (
                <div className="chatgpt-question-box">
                  <div className="chatgpt-field-counter">
                    Question {fieldIndex + 1} of {fields.length}
                    {currentField.required && <span className="required-tag">Required</span>}
                  </div>
                  <h3 className="chatgpt-question-title">{currentField.label}</h3>
                  {currentField.description && (
                    <p className="chatgpt-question-hint">{currentField.description}</p>
                  )}
                  {currentField.validation?.options?.length > 0 && (
                    <div className="chatgpt-options-list">
                      {currentField.validation.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          className="chatgpt-option-pill"
                          onClick={() => handleAnswer(String(opt))}
                          disabled={phase === "processing"}
                          title={`Select option: ${opt}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Real-Time Transcript Preview */}
              {(interim || userSpeaking) && phase === "listening" && (
                <div className={`chatgpt-transcript-card ${userSpeaking ? "user-speaking" : ""}`}>
                  <span className="transcript-tag">You:</span>
                  <p className="transcript-text">“{interim || "Hearing your answer..."}”</p>
                </div>
              )}

              {phase === "complete" && (
                <div className="voice-assistant-done">
                  ✨ Perfect! All fields are completed. You can review and edit your answers on the form.
                </div>
              )}

              {error && <div className="voice-assistant-error" role="alert">{error}</div>}
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        {messages.length > 0 && phase !== "complete" && (
          <footer className="voice-assistant-controls">
            <div className="voice-assistant-command-hint">
              Voice commands: say “repeat”, “go back”, “skip”, or “stop” anytime.
            </div>
            <div className="voice-assistant-input-row">
              <button
                type="button"
                className="chatgpt-action-btn"
                onClick={() => ask(fieldIndex)}
                disabled={phase === "listening" || phase === "speaking" || phase === "processing"}
                aria-label="Repeat question"
                title="Repeat question"
              >
                <Repeat2 size={18} />
              </button>

              <button
                type="button"
                className={`chatgpt-ptt-btn ${phase === "listening" ? "active" : ""}`}
                onClick={() => {
                  if (phase === "listening") {
                    if (recognitionRef.current) {
                      try { recognitionRef.current.stop(); } catch {}
                    } else if (recorderRef.current?.state === "recording") {
                      recorderRef.current.stop();
                    }
                  } else {
                    listen(generationRef.current);
                  }
                }}
                disabled={phase === "speaking" || phase === "processing"}
                aria-label={phase === "listening" ? "Done speaking" : "Speak answer"}
                aria-pressed={phase === "listening"}
                title={phase === "listening" ? "Done speaking (Finish turn)" : "Speak answer"}
              >
                {phase === "listening" ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                type="button"
                className="chatgpt-action-btn"
                onClick={() => ask(fieldIndex + 1)}
                disabled={phase === "listening" || phase === "speaking" || phase === "processing"}
                aria-label="Skip question"
                title="Skip question"
              >
                <SkipForward size={18} />
              </button>

              <input
                className="chatgpt-text-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendTypedAnswer();
                }}
                placeholder="Or type your answer here..."
                aria-label="Type your answer"
                disabled={phase === "speaking" || phase === "processing"}
              />

              <button
                type="button"
                className="chatgpt-send-btn"
                onClick={sendTypedAnswer}
                disabled={!draft.trim() || phase === "processing"}
                aria-label="Send typed answer"
              >
                <Send size={16} />
              </button>
            </div>

            <button
              type="button"
              className="voice-assistant-close-link"
              onClick={close}
            >
              <ArrowLeft size={14} /> Close and review form
            </button>
          </footer>
        )}

        {phase === "complete" && (
          <footer className="voice-assistant-controls">
            <button
              type="button"
              className="voice-assistant-start-btn"
              onClick={close}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Review My Form Answers
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
