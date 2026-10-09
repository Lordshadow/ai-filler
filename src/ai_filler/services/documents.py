from pathlib import Path

from langchain_groq import ChatGroq

from ..document_parser import extract_document_text, organize_document_text


def extract_and_organize(
    *,
    documents: list[tuple[str, Path]],
    client: ChatGroq | None = None,
) -> dict[str, object]:
    """Extract each document and organize all extracted text together."""
    extracted_documents = [
        {
            "filename": filename,
            "text": extract_document_text(file_path=path, client=client),
        }
        for filename, path in documents
    ]
    combined_text = "\n\n".join(
        f"Document: {document['filename']}\n{document['text']}"
        for document in extracted_documents
    )
    return {
        "files": [document["filename"] for document in extracted_documents],
        "extracted_text": combined_text,
        "organized_text": organize_document_text(
            extracted_text=combined_text,
            client=client,
        ),
    }
