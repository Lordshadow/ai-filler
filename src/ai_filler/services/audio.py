from pathlib import Path

from groq import Groq

from ..groq_client import transcribe_audio as _transcribe_audio


def transcribe(
    *,
    file_path: str | Path,
    language: str | None = None,
    prompt: str | None = None,
    client: Groq | None = None,
) -> str:
    """Transcribe an audio file with Whisper Large v3."""
    return _transcribe_audio(
        file_path=file_path,
        language=language,
        prompt=prompt,
        client=client,
    )
