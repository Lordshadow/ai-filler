"""Production-grade structured JSON logging, X-Correlation-ID tracing, and Shift-Left PII redaction."""

from __future__ import annotations

from collections import deque
from contextvars import ContextVar, Token
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any
import uuid

logger = logging.getLogger("ai_filler.observability")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="n/a")

_RECENT_TELEMETRY_EVENTS: deque[dict[str, Any]] = deque(maxlen=300)

_SENSITIVE_KEY_SUBSTRINGS = (
    "password",
    "secret",
    "token",
    "csrf",
    "authorization",
    "cookie",
    "api_key",
    "apikey",
)

_API_KEY_PATTERN = re.compile(r"\b(?:gsk|sk)[-_][A-Za-z0-9_-]{12,}\b")
_EMAIL_PII_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


def generate_correlation_id() -> str:
    """Generate a compact, traceable correlation ID."""
    return f"corr_{uuid.uuid4().hex[:16]}"


def get_correlation_id() -> str:
    """Return the active async request correlation ID."""
    return correlation_id_var.get()


def set_correlation_id(corr_id: str | None) -> tuple[ str, Token[str] ]:
    """Bind a correlation ID to the current async context and return (corr_id, token)."""
    clean_id = (corr_id or "").strip() or generate_correlation_id()
    token = correlation_id_var.set(clean_id)
    return clean_id, token


def reset_correlation_id(token: Token[str]) -> None:
    """Reset the correlation ID context variable."""
    correlation_id_var.reset(token)


def redact_pii(value: Any, *, key_name: str = "") -> Any:
    """Recursively scrub secrets, tokens, and PII from log payloads before serialization."""
    lower_key = key_name.lower()
    if lower_key and any(s in lower_key for s in _SENSITIVE_KEY_SUBSTRINGS):
        return "[REDACTED]"

    if isinstance(value, str):
        scrubbed = _API_KEY_PATTERN.sub("[REDACTED_KEY]", value)
        scrubbed = _EMAIL_PII_PATTERN.sub("[REDACTED_EMAIL]", scrubbed)
        return scrubbed

    if isinstance(value, dict):
        return {str(k): redact_pii(v, key_name=str(k)) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return [redact_pii(item, key_name=key_name) for item in value]

    return value


def log_structured_event(
    event: str,
    *,
    level: str = "INFO",
    component: str = "api",
    duration_ms: float | None = None,
    **context: Any,
) -> dict[str, Any]:
    """Emit a structured JSON log event with correlation ID and Shift-Left PII redaction."""
    record: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level.upper(),
        "event": event,
        "correlation_id": get_correlation_id(),
        "component": component,
        "duration_ms": round(duration_ms, 2) if duration_ms is not None else None,
        "context": redact_pii(context),
    }
    _RECENT_TELEMETRY_EVENTS.append(record)

    serialized = json.dumps(record, ensure_ascii=False, default=str)
    log_level = getattr(logging, record["level"], logging.INFO)
    logger.log(log_level, serialized)
    return record


def get_recent_telemetry_events(
    *,
    limit: int = 50,
    correlation_id: str | None = None,
    component: str | None = None,
    event: str | None = None,
) -> list[dict[str, Any]]:
    """Return recent structured telemetry events from the in-memory ring buffer."""
    items = list(_RECENT_TELEMETRY_EVENTS)
    if correlation_id:
        items = [item for item in items if item.get("correlation_id") == correlation_id]
    if component:
        items = [item for item in items if item.get("component") == component]
    if event:
        items = [item for item in items if item.get("event") == event]
    return items[-max(1, limit) :]


def clear_telemetry_events() -> None:
    """Clear the in-memory telemetry ring buffer (useful in isolated unit tests)."""
    _RECENT_TELEMETRY_EVENTS.clear()
