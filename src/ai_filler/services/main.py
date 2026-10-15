"""Orchestrate the application services."""

from pathlib import Path

from langchain_groq import ChatGroq

from .documents import extract_and_organize


def process_documents(
    *,
    documents: list[tuple[str, Path]],
    client: ChatGroq | None = None,
) -> dict[str, object]:
    """Run extraction and organization for uploaded documents."""
    return extract_and_organize(documents=documents, client=client)
