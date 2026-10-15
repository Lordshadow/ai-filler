"""Shared Groq chat model configuration for text and document workflows."""

from __future__ import annotations

import os
import re

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from groq import Groq
from langchain_groq import ChatGroq
from sarvamai import SarvamAI

GPT_OSS_MODEL = "openai/gpt-oss-20b"
ELEVENLABS_STT_MODEL = "scribe_v2"
ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2"
SARVAM_STT_MODEL = "saaras:v4"
ORPHEUS_ENGLISH_MODEL = "canopylabs/orpheus-v1-english"
ORPHEUS_ENGLISH_VOICES = {
    "autumn", "diana", "hannah", "austin", "daniel", "troy",
    "alice", "george", "adam",
}
DEFAULT_ELEVENLABS_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2"  # Soft natural female voice (Alice)
ELEVENLABS_VOICE_MAP: dict[str, str] = {
    "alice": DEFAULT_ELEVENLABS_VOICE_ID,
    "soft_female": DEFAULT_ELEVENLABS_VOICE_ID,
    "hannah": DEFAULT_ELEVENLABS_VOICE_ID,
    "diana": DEFAULT_ELEVENLABS_VOICE_ID,
    "autumn": DEFAULT_ELEVENLABS_VOICE_ID,
    "george": DEFAULT_ELEVENLABS_VOICE_ID,
    "adam": DEFAULT_ELEVENLABS_VOICE_ID,
    "daniel": DEFAULT_ELEVENLABS_VOICE_ID,
    "austin": DEFAULT_ELEVENLABS_VOICE_ID,
    "troy": DEFAULT_ELEVENLABS_VOICE_ID,
}
ORPHEUS_MAX_INPUT_CHARS = 200

load_dotenv()


def normalize_sarvam_language(language: str | None) -> str:
    """Map UI language names to Sarvam AI Saaras language codes ('unknown' for auto-detect / Tanglish)."""
    if not language or language.strip().lower() in {"auto", "tanglish", "unknown", ""}:
        return "unknown"
    normalized = language.strip().lower()
    if normalized in {"tamil", "தமிழ்", "ta", "ta-in"}:
        return "ta-IN"
    if normalized in {"english", "en", "en-in", "en-us"}:
        return "en-IN"
    if normalized in {"hindi", "hi", "hi-in"}:
        return "hi-IN"
    return "unknown"


def normalize_elevenlabs_language(language: str | None) -> str | None:
    """Map UI language names to ElevenLabs Scribe ISO 639-1 language codes (or None for auto-detect)."""
    if not language or language.strip().lower() in {"auto", "tanglish", "unknown", ""}:
        return None
    normalized = language.strip().lower()
    if normalized in {"tamil", "தமிழ்", "ta", "ta-in"}:
        return "ta"
    if normalized in {"english", "en", "en-in", "en-us"}:
        return "en"
    return normalized


DEFAULT_WHISPER_TEMPERATURE = 0.0


def normalize_whisper_language(language: str | None) -> str | None:
    """Map UI language names to Whisper's supported language code behavior."""
    if not language or language.strip().lower() in {"auto", "tanglish", ""}:
        return None
    normalized = language.strip().lower()
    return "ta" if normalized in {"tamil", "தமிழ்"} else normalized


def clean_whisper_hallucinations(text: str) -> str:
    """Remove common trailing media sign-offs Whisper may invent after silence."""
    cleaned = text.strip()
    cleaned = re.sub(
        r"(?:\s*(?:thank you for watching|thanks for watching|please subscribe)[.! ]*)+$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def _create_langchain_client(*, model: str, temperature: float) -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add your Groq API key to the environment."
        )
    return ChatGroq(model=model, temperature=temperature, api_key=api_key)


def _create_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")
    return Groq(api_key=api_key)


def _create_elevenlabs_client() -> ElevenLabs:
    api_key = os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVENLAPS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured.")
    return ElevenLabs(api_key=api_key)


def _create_sarvam_client() -> SarvamAI:
    api_key = os.getenv("SARVAMAI_API_KEY") or os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAMAI_API_KEY is not configured.")
    return SarvamAI(api_subscription_key=api_key)


def build_voice_transcription_prompt(*, form_title: str, field_label: str, options: list[str] | None = None) -> str:
    """Keep voice transcription prompt short so it can help with domain terms, names and schema options."""
    pieces = ["Transcribe faithfully; do not translate. Preserve Tamil/Tanglish, names, emails and numbers exactly."]
    if form_title:
        pieces.append(f"Form: {form_title}.")
    if field_label:
        pieces.append(f"Field: {field_label}.")
    if options:
        pieces.append(f"Options: {', '.join(options)}.")
    return " ".join(pieces)[:450]


def build_voice_transcription_keyterms(*, form_title: str, field_label: str, options: list[str] | None = None) -> list[str]:
    """Build a list of keyterms (up to 50 chars each, max 50 terms) for Sarvam Saaras & ElevenLabs context biasing."""
    keyterms: list[str] = []
    if form_title and form_title.strip():
        keyterms.append(form_title.strip()[:50])
    if field_label and field_label.strip():
        keyterms.append(field_label.strip()[:50])
    if options:
        for opt in options[:30]:
            cleaned = opt.strip()
            if cleaned and cleaned not in keyterms:
                keyterms.append(cleaned[:50])
    return keyterms[:50]


def transcribe_audio(
    *,
    file_path: str,
    language: str | None = None,
    prompt: str | list[str] | None = None,
    keyterms: list[str] | None = None,
    client: Any = None,
) -> str:
    """Transcribe browser-recorded audio using Sarvam AI Saaras v4 STT (with ElevenLabs/Whisper fallback)."""
    # Duck-typing support for test mocks using legacy Groq/Whisper fake clients
    if client and hasattr(client, "audio") and hasattr(client.audio, "transcriptions"):
        with open(file_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3",
                response_format="text",
                language=language,
                prompt=str(prompt) if prompt else None,
                temperature=0.0,
            )
        return clean_whisper_hallucinations(str(response))

    # Duck-typing support for test mocks using ElevenLabs fake client (e.g. test_elevenlabs_stt.py)
    if client and hasattr(client, "speech_to_text") and hasattr(client.speech_to_text, "convert"):
        resolved_keyterms = []
        if keyterms:
            resolved_keyterms.extend([k[:50] for k in keyterms if isinstance(k, str) and k.strip()])
        elif isinstance(prompt, list):
            resolved_keyterms.extend([k[:50] for k in prompt if isinstance(k, str) and k.strip()])
        with open(file_path, "rb") as audio_file:
            kwargs: dict[str, Any] = {
                "file": audio_file,
                "model_id": ELEVENLABS_STT_MODEL,
            }
            if language:
                kwargs["language_code"] = language
            if resolved_keyterms:
                kwargs["keyterms"] = resolved_keyterms[:50]
            response = client.speech_to_text.convert(**kwargs)
        raw_text = getattr(response, "text", "") or ""
        return clean_whisper_hallucinations(raw_text)

    # Duck-typing support if Sarvam client mock is explicitly passed
    if client and hasattr(client, "speech_to_text") and hasattr(client.speech_to_text, "transcribe"):
        resolved_keyterms = []
        if keyterms:
            resolved_keyterms.extend([k[:50] for k in keyterms if isinstance(k, str) and k.strip()])
        elif isinstance(prompt, list):
            resolved_keyterms.extend([k[:50] for k in prompt if isinstance(k, str) and k.strip()])
        with open(file_path, "rb") as audio_file:
            sarvam_lang = normalize_sarvam_language(language)
            response = client.speech_to_text.transcribe(
                file=audio_file,
                model=SARVAM_STT_MODEL,
                mode="transcribe",
                language_code=sarvam_lang,
                keyterms=resolved_keyterms or None,
            )
        return clean_whisper_hallucinations(getattr(response, "transcript", "") or "")

    # Primary Sarvam AI Saaras v4 STT execution
    resolved_keyterms: list[str] = []
    if keyterms:
        resolved_keyterms.extend([k[:50] for k in keyterms if isinstance(k, str) and k.strip()])
    elif isinstance(prompt, list):
        resolved_keyterms.extend([k[:50] for k in prompt if isinstance(k, str) and k.strip()])

    sarvam_lang = normalize_sarvam_language(language)

    ext = os.path.splitext(file_path)[1].lower().lstrip(".")
    codec_map = {
        "wav": "wav",
        "webm": "webm",
        "mp3": "mp3",
        "ogg": "ogg",
        "opus": "opus",
        "flac": "flac",
        "m4a": "x-m4a",
        "mp4": "mp4",
        "aac": "aac",
    }
    input_codec = codec_map.get(ext)

    try:
        sarvam_client = _create_sarvam_client()
        with open(file_path, "rb") as audio_file:
            transcribe_kwargs: dict[str, Any] = {
                "file": audio_file,
                "model": SARVAM_STT_MODEL,
                "mode": "transcribe",
                "language_code": sarvam_lang,
            }
            if resolved_keyterms:
                transcribe_kwargs["keyterms"] = resolved_keyterms[:50]
            if input_codec:
                transcribe_kwargs["input_audio_codec"] = input_codec

            response = sarvam_client.speech_to_text.transcribe(**transcribe_kwargs)
        raw_text = getattr(response, "transcript", "") or ""
        return clean_whisper_hallucinations(raw_text)
    except Exception as sarvam_error:
        # Fallback to ElevenLabs if configured
        if os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVENLAPS_API_KEY"):
            try:
                eleven_client = _create_elevenlabs_client()
                with open(file_path, "rb") as audio_file:
                    kwargs = {
                        "file": audio_file,
                        "model_id": ELEVENLABS_STT_MODEL,
                    }
                    if language and language != "unknown":
                        kwargs["language_code"] = normalize_elevenlabs_language(language)
                    if resolved_keyterms:
                        kwargs["keyterms"] = resolved_keyterms[:50]
                    response = eleven_client.speech_to_text.convert(**kwargs)
                return clean_whisper_hallucinations(getattr(response, "text", "") or "")
            except Exception:
                pass
        # Fallback to Groq Whisper if configured
        if os.getenv("GROQ_API_KEY"):
            try:
                groq_client = _create_groq_client()
                with open(file_path, "rb") as audio_file:
                    whisper_lang = normalize_whisper_language(language)
                    response = groq_client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-large-v3",
                        response_format="text",
                        language=whisper_lang,
                        prompt=str(prompt) if prompt and isinstance(prompt, str) else None,
                        temperature=0.0,
                    )
                return clean_whisper_hallucinations(str(response))
            except Exception:
                pass
        raise sarvam_error


def synthesize_english_speech(*, text: str, voice: str = "alice", client: Any = None) -> bytes:
    """Generate high-fidelity speech prompt using ElevenLabs Multilingual TTS (with mock/fallback support)."""
    if voice not in ORPHEUS_ENGLISH_VOICES and voice not in ELEVENLABS_VOICE_MAP:
        raise ValueError("Unsupported voice selection.")
    if not text.strip() or len(text) > ORPHEUS_MAX_INPUT_CHARS:
        raise ValueError("Speech text must contain between 1 and 200 characters.")

    # Duck-typing support for test mocks using legacy Groq/Orpheus fake clients
    if client and hasattr(client, "audio") and hasattr(client.audio, "speech"):
        response = client.audio.speech.create(
            model=ORPHEUS_ENGLISH_MODEL,
            voice=voice,
            input=text,
            response_format="wav",
        )
        content = getattr(response, "content", None)
        if content is None:
            raise RuntimeError("Speech synthesis returned no audio.")
        return bytes(content)

    # Duck-typing support if a mock ElevenLabs client is passed
    if client and hasattr(client, "text_to_speech"):
        voice_id = ELEVENLABS_VOICE_MAP.get(voice, DEFAULT_ELEVENLABS_VOICE_ID)
        stream = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id=ELEVENLABS_TTS_MODEL,
            output_format="mp3_44100_128",
        )
        return b"".join(stream)

    # Primary ElevenLabs Multilingual TTS execution
    eleven_client: ElevenLabs = client or _create_elevenlabs_client()
    voice_id = ELEVENLABS_VOICE_MAP.get(voice, DEFAULT_ELEVENLABS_VOICE_ID)
    try:
        stream = eleven_client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id=ELEVENLABS_TTS_MODEL,
            output_format="mp3_44100_128",
        )
        audio_bytes = b"".join(stream)
        if not audio_bytes:
            raise RuntimeError("Speech synthesis returned no audio.")
        return audio_bytes
    except Exception as exc:
        # Fallback to Groq if ElevenLabs fails and Groq key is present
        if os.getenv("GROQ_API_KEY"):
            try:
                groq_client = _create_groq_client()
                response = groq_client.audio.speech.create(
                    model=ORPHEUS_ENGLISH_MODEL,
                    voice=voice if voice in ORPHEUS_ENGLISH_VOICES else "hannah",
                    input=text,
                    response_format="wav",
                )
                content = getattr(response, "content", None)
                if content:
                    return bytes(content)
            except Exception:
                pass
        raise exc
