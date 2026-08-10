"""Sending one plain-text email over SMTP — the one delivery channel this
product implements.

``app/services/alerting.py`` raises alert rows and says outright that nothing
reaches email, SMS or WhatsApp yet. This is the email half of that promise:
``smtplib`` against whatever relay ``SMTP_HOST`` names, with no template engine
and no queue of its own — the queue is Celery beat, and the caller decides what
"one message" means.

Kept to the standard library on purpose. A transactional-email provider's SDK
would mean a second set of credentials and a second failure mode to model, for
a volume — one digest per business per day — that plain SMTP handles without
noticing.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailSendError(Exception):
    """The message could not be handed to the SMTP server."""


def send_email(*, to: str, subject: str, body: str) -> None:
    """Send one plain-text email, or raise :class:`EmailSendError`.

    Raises rather than returning a bool because the caller is a delivery loop
    over several alert rows, and it is the caller — not this function — that
    knows whether one recipient failing among several means the business was
    told or means the whole digest goes back on tomorrow's list.

    Synchronous and blocking. Every caller of this runs inside a Celery task
    rather than a request, so there is nothing here an event loop would help
    with, and a blocking call is one with a straightforward timeout: connecting,
    the handshake and the send all share :data:`Settings.smtp_timeout_seconds`
    through the socket itself, which is what stops one unreachable relay from
    holding a worker for the length of its default OS-level timeout.
    """
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_address
    message["To"] = to
    message.set_content(body)

    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as client:
            if settings.smtp_use_tls:
                client.starttls()
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailSendError(f"could not send to {to}: {exc}") from exc
