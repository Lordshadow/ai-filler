from __future__ import annotations

from pathlib import Path
from threading import Lock

from docx import Document
from langchain_groq import ChatGroq
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR

from .groq_client import GPT_OSS_MODEL, _create_langchain_client

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp"}
_OCR_ENGINE: RapidOCR | None = None
_OCR_ENGINE_LOCK = Lock()


def extract_document_text(*, file_path: str | Path, client: ChatGroq | None = None) -> str:
    """Extract text from a supported document or OCR an image with Groq vision."""
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError("Unsupported file type. Use PDF, DOCX, TXT, PNG, JPG, or WEBP.")

    if suffix == ".pdf":
        text = "\n\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    elif suffix == ".docx":
        text = "\n".join(paragraph.text for paragraph in Document(path).paragraphs)
    elif suffix == ".txt":
        text = path.read_text(encoding="utf-8")
    else:
        text = _extract_image_text(path=path, client=client)

    text = text.strip()
    if not text:
        raise ValueError("No text could be extracted from this file.")
    return text


def _extract_image_text(*, path: Path, client: ChatGroq | None = None) -> str:
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        with _OCR_ENGINE_LOCK:
            if _OCR_ENGINE is None:
                _OCR_ENGINE = RapidOCR()
    result, _ = _OCR_ENGINE(str(path))
    if not result:
        return ""
    return "\n".join(text for _, text, _ in result)


def organize_document_text(
    *,
    extracted_text: str,
    client: ChatGroq | None = None,
) -> str:
    """Use GPT-OSS to correct and organize extracted document text."""
    if not extracted_text.strip():
        raise ValueError("Extracted text cannot be empty.")

    response = (client or _create_langchain_client(model=GPT_OSS_MODEL, temperature=0.1)).invoke(
        [
            {
                "role": "system",
                "content": (
                    "You organize extracted document text. Correct only obvious OCR "
                    "or spelling mistakes using context. Preserve every factual "
                    "detail and do not invent content. Return clean plain text with "
                    "a clear title, numbered sections in the same logical order, "
                    "and readable paragraphs or bullet points where appropriate. "
                    "Do not include commentary about your changes."
                ),
            },
            {"role": "user", "content": f"Extracted document text:\n\n{extracted_text}"},
        ]
    )
    organized = response.content
    if not organized:
        raise ValueError("The document organizer returned empty text.")
    return organized.strip()
