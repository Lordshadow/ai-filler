from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlparse


class EmailNotConfigured(RuntimeError):
    pass


def password_reset_email_configured() -> bool:
    host = os.getenv("AI_FILLER_SMTP_HOST")
    sender = os.getenv("AI_FILLER_SMTP_FROM")
    username = os.getenv("AI_FILLER_SMTP_USERNAME")
    password = os.getenv("AI_FILLER_SMTP_PASSWORD")
    public_url = os.getenv("AI_FILLER_PUBLIC_URL", "http://127.0.0.1:5173")
    parsed_url = urlparse(public_url)
    if os.getenv("AI_FILLER_ENV", "development").lower() == "production" and parsed_url.scheme != "https":
        return False
    try:
        port = int(os.getenv("AI_FILLER_SMTP_PORT", "587"))
    except ValueError:
        return False
    return bool(host and sender and parsed_url.netloc and 1 <= port <= 65535) and bool(username) == bool(password)


def send_password_reset_email(*, recipient: str, token: str, role: str) -> None:
    host = os.getenv("AI_FILLER_SMTP_HOST")
    sender = os.getenv("AI_FILLER_SMTP_FROM")
    if not password_reset_email_configured():
        raise EmailNotConfigured("Password recovery email is not configured.")
    try:
        port = int(os.getenv("AI_FILLER_SMTP_PORT", "587"))
    except ValueError as error:
        raise EmailNotConfigured("Password recovery email is not configured.") from error

    base_url = os.getenv("AI_FILLER_PUBLIC_URL", "http://127.0.0.1:5173").rstrip("/")
    role_slug = {"organization_admin": "admin", "super_admin": "super_admin"}.get(role, role)
    reset_url = f"{base_url}/reset-password/{role_slug}?token={token}"
    message = EmailMessage()
    message["Subject"] = "Reset your AI Filler password"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your AI Filler account.\n\n"
        f"Use this one-time link within 30 minutes: {reset_url}\n\n"
        "If you did not request this change, you can ignore this message."
    )

    username = os.getenv("AI_FILLER_SMTP_USERNAME")
    password = os.getenv("AI_FILLER_SMTP_PASSWORD")
    with smtplib.SMTP(host, port, timeout=10) as server:
        server.ehlo()
        server.starttls(context=ssl.create_default_context())
        server.ehlo()
        if username and password:
            server.login(username, password)
        server.send_message(message)
