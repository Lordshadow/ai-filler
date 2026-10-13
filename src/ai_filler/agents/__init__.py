"""Multi-Agent AI Form Filling and Schema Generation package."""

from .form_agents import (
    build_form_Creation_whisper_prompt,
    build_whisper_vocabulary_prompt,
    fill_form_from_document_multi_agent,
    fill_form_from_voice_multi_agent,
    fill_form_multi_agent,
    generate_form_from_document_multi_agent,
    generate_form_from_voice_multi_agent,
    generate_form_schema_multi_agent,
)

__all__ = [
    "build_form_Creation_whisper_prompt",
    "build_whisper_vocabulary_prompt",
    "fill_form_from_document_multi_agent",
    "fill_form_from_voice_multi_agent",
    "fill_form_multi_agent",
    "generate_form_from_document_multi_agent",
    "generate_form_from_voice_multi_agent",
    "generate_form_schema_multi_agent",
]
