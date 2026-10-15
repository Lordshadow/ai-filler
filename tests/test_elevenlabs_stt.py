"""Unit tests for ElevenLabs Scribe v2 STT integration."""

from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest

from ai_filler.groq_client import (
    DEFAULT_ELEVENLABS_VOICE_ID,
    ELEVENLABS_STT_MODEL,
    ELEVENLABS_VOICE_MAP,
    SARVAM_STT_MODEL,
    build_voice_transcription_keyterms,
    build_voice_transcription_prompt,
    normalize_elevenlabs_language,
    normalize_sarvam_language,
    transcribe_audio,
)


def test_normalize_elevenlabs_language():
    assert normalize_elevenlabs_language("ta") == "ta"
    assert normalize_elevenlabs_language("tamil") == "ta"
    assert normalize_elevenlabs_language("தமிழ்") == "ta"
    assert normalize_elevenlabs_language("ta-in") == "ta"

    assert normalize_elevenlabs_language("en") == "en"
    assert normalize_elevenlabs_language("english") == "en"
    assert normalize_elevenlabs_language("en-IN") == "en"
    assert normalize_elevenlabs_language("en-US") == "en"

    assert normalize_elevenlabs_language("auto") is None
    assert normalize_elevenlabs_language("tanglish") is None
    assert normalize_elevenlabs_language("unknown") is None
    assert normalize_elevenlabs_language("") is None
    assert normalize_elevenlabs_language(None) is None


def test_build_voice_transcription_keyterms():
    keyterms = build_voice_transcription_keyterms(
        form_title="Job Application Form " * 5,
        field_label="Email Address",
        options=["Full-time", "Part-time", "Internship"],
    )
    assert len(keyterms) <= 50
    assert all(len(k) <= 50 for k in keyterms)
    assert "Email Address" in keyterms
    assert "Full-time" in keyterms
    assert "Part-time" in keyterms


def test_transcribe_audio_with_elevenlabs_client(tmp_path):
    recorded_calls = {}

    class FakeSpeechToText:
        def convert(self, **kwargs):
            recorded_calls.update(kwargs)
            return SimpleNamespace(text="My name is Kaarthik. Thank you for watching.")

    mock_client = SimpleNamespace(speech_to_text=FakeSpeechToText())

    audio_file = tmp_path / "test_answer.wav"
    audio_file.write_bytes(b"RIFFdummydata")

    result = transcribe_audio(
        file_path=str(audio_file),
        language="ta",
        keyterms=["Kaarthik", "Job Application"],
        client=mock_client,
    )

    assert result == "My name is Kaarthik."
    assert recorded_calls["model_id"] == ELEVENLABS_STT_MODEL
    assert recorded_calls["language_code"] == "ta"
    assert recorded_calls["keyterms"] == ["Kaarthik", "Job Application"]


def test_synthesize_english_speech_with_elevenlabs_client():
    from ai_filler.groq_client import synthesize_english_speech, ELEVENLABS_TTS_MODEL

    recorded_calls = {}

    class FakeTextToSpeech:
        def convert(self, voice_id, text, model_id, output_format):
            recorded_calls["voice_id"] = voice_id
            recorded_calls["text"] = text
            recorded_calls["model_id"] = model_id
            recorded_calls["output_format"] = output_format
            return [b"ID3", b"audio_stream_chunk"]

    mock_client = SimpleNamespace(text_to_speech=FakeTextToSpeech())

    audio = synthesize_english_speech(text="Please state your name.", voice="alice", client=mock_client)

    assert audio == b"ID3audio_stream_chunk"
    assert recorded_calls["voice_id"] == "Xb7hH8MSUJpSbSDYk0k2"
    assert recorded_calls["text"] == "Please state your name."
    assert recorded_calls["model_id"] == ELEVENLABS_TTS_MODEL
    assert recorded_calls["output_format"] == "mp3_44100_128"


def test_synthesize_english_speech_invalid_inputs():
    from ai_filler.groq_client import synthesize_english_speech

    with pytest.raises(ValueError):
        synthesize_english_speech(text="Hello", voice="unknown_voice_id_123")

    with pytest.raises(ValueError):
        synthesize_english_speech(text="   ", voice="alice")

    with pytest.raises(ValueError):
        synthesize_english_speech(text="x" * 201, voice="alice")


def test_normalize_sarvam_language():
    assert normalize_sarvam_language("ta") == "ta-IN"
    assert normalize_sarvam_language("tamil") == "ta-IN"
    assert normalize_sarvam_language("தமிழ்") == "ta-IN"
    assert normalize_sarvam_language("ta-in") == "ta-IN"

    assert normalize_sarvam_language("en") == "en-IN"
    assert normalize_sarvam_language("english") == "en-IN"
    assert normalize_sarvam_language("en-IN") == "en-IN"
    assert normalize_sarvam_language("en-US") == "en-IN"

    assert normalize_sarvam_language("hi") == "hi-IN"
    assert normalize_sarvam_language("hindi") == "hi-IN"

    assert normalize_sarvam_language("auto") == "unknown"
    assert normalize_sarvam_language("tanglish") == "unknown"
    assert normalize_sarvam_language("unknown") == "unknown"
    assert normalize_sarvam_language("") == "unknown"
    assert normalize_sarvam_language(None) == "unknown"


def test_transcribe_audio_with_sarvam_client(tmp_path):
    recorded_calls = {}

    class FakeSarvamSpeechToText:
        def transcribe(self, **kwargs):
            recorded_calls.update(kwargs)
            return SimpleNamespace(transcript="Vanakkam, my name is Priya. Thank you for watching.")

    mock_client = SimpleNamespace(speech_to_text=FakeSarvamSpeechToText())

    audio_file = tmp_path / "answer.wav"
    audio_file.write_bytes(b"RIFFdummydata")

    result = transcribe_audio(
        file_path=str(audio_file),
        language="ta",
        keyterms=["Priya", "Job Application"],
        client=mock_client,
    )

    assert result == "Vanakkam, my name is Priya."
    assert recorded_calls["model"] == SARVAM_STT_MODEL
    assert recorded_calls["mode"] == "transcribe"
    assert recorded_calls["language_code"] == "ta-IN"
    assert recorded_calls["keyterms"] == ["Priya", "Job Application"]


def test_soft_female_voice_mapping():
    assert DEFAULT_ELEVENLABS_VOICE_ID == "Xb7hH8MSUJpSbSDYk0k2"
    # Every voice in ELEVENLABS_VOICE_MAP must map to the soft female voice ID
    for voice_name, voice_id in ELEVENLABS_VOICE_MAP.items():
        assert voice_id == DEFAULT_ELEVENLABS_VOICE_ID, f"Voice {voice_name} is not soft female"


