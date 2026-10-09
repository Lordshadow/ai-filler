"""Orchestrate the application services."""

from pathlib import Path

from langchain_groq import ChatGroq

from .application import format_application
from .audio import transcribe
from .documents import extract_and_organize


def transcribe_audio(
    *,
    file_path: str | Path,
    language: str | None = None,
    prompt: str | None = None,
) -> str:
    """Run the audio transcription service."""
    return transcribe(file_path=file_path, language=language, prompt=prompt)


def create_application(*, transcript: str) -> dict[str, str]:
    """Run the application formatting service."""
    return format_application(transcript=transcript)


def process_documents(
    *,
    documents: list[tuple[str, Path]],
    client: ChatGroq | None = None,
) -> dict[str, object]:
    """Run extraction and organization for uploaded documents."""
    return extract_and_organize(documents=documents, client=client)
