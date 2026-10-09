from langchain_groq import ChatGroq

from ..groq_client import format_application as _format_application


def format_application(
    *,
    transcript: str,
    client: ChatGroq | None = None,
) -> dict[str, str]:
    """Correct a transcript and format it as a job application."""
    return _format_application(transcript=transcript, client=client)
