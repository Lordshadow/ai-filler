from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Protocol

from groq import Groq
from dotenv import load_dotenv
from langchain_groq import ChatGroq

WHISPER_LARGE_V3 = "whisper-large-v3"
GPT_OSS_MODEL = "openai/gpt-oss-20b"

load_dotenv()


class TranscriptionClient(Protocol):
    def transcribe_audio(
        self,
        *,
        file_path: str | Path,
        language: str | None = None,
        prompt: str | None = None,
    ) -> str:
        """Transcribe an audio file."""


def _create_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add your Groq API key to the environment."
        )
    return Groq(api_key=api_key)


def _create_langchain_client(*, model: str, temperature: float) -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add your Groq API key to the environment."
        )
    return ChatGroq(model=model, temperature=temperature, api_key=api_key)


def transcribe_audio(
    *,
    file_path: str | Path,
    language: str | None = None,
    prompt: str | None = None,
    client: Groq | None = None,
) -> str:
    """Transcribe an audio file with Groq's Whisper Large v3 model.

    Args:
        file_path: Path to an audio file supported by Groq.
        language: Optional ISO-639-1 language code, such as ``"en"``.
        prompt: Optional context that can improve transcription accuracy.
        client: Optional Groq client, primarily useful for testing.
    """
    audio_path = Path(file_path)
    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")

    groq_client = client or _create_groq_client()
    with audio_path.open("rb") as audio_file:
        request: dict[str, object] = {
            "file": audio_file,
            "model": WHISPER_LARGE_V3,
            "response_format": "text",
        }
        if language is not None:
            request["language"] = language
        if prompt is not None:
            request["prompt"] = prompt

        response = groq_client.audio.transcriptions.create(**request)
        return str(response)


def format_application(
    *,
    transcript: str,
    client: ChatGroq | None = None,
) -> dict[str, str]:
    """Correct a transcript and extract it into a structured job application."""
    if not transcript.strip():
        raise ValueError("Transcript cannot be empty.")

    llm = client or _create_langchain_client(model=GPT_OSS_MODEL, temperature=0.1)
    response = llm.bind(response_format={"type": "json_object"}).invoke(
        [
            {
                "role": "system",
                "content": (
                    "You are a transcript correction and application-form assistant. "
                    "First, carefully correct misspelled words, phonetic errors, "
                    "misheard names, email addresses, company names, job titles, "
                    "and other obvious Whisper transcription errors using the "
                    "surrounding context. Preserve the speaker's meaning, do not "
                    "rewrite or add facts, and leave uncertain words unchanged "
                    "rather than guessing. Then extract the corrected candidate "
                    "information. Return only valid JSON with exactly "
                    "these string keys: full_name, email, phone, position, "
                    "experience, education, skills, cover_letter. Use an empty "
                    "string when the corrected transcript does not contain a value. "
                    "Write a polished cover_letter using only the candidate's "
                    "corrected information; never add unsupported qualifications."
                ),
            },
            {
                "role": "user",
                "content": f"Transcript to correct and format:\n\n{transcript}",
            },
        ]
    )
    content = response.content
    if not content:
        raise ValueError("The application formatter returned an empty response.")

    formatted = json.loads(content)
    fields = (
        "full_name",
        "email",
        "phone",
        "position",
        "experience",
        "education",
        "skills",
        "cover_letter",
    )
    if not isinstance(formatted, dict):
        raise ValueError("The application formatter returned invalid JSON.")
    return {field: str(formatted.get(field, "")) for field in fields}
