"""Sending one email over SMTP: the wiring, not the wording.

What the message says is :mod:`app.services.alert_delivery`'s concern; this
module is only about whether ``smtplib`` is driven correctly — TLS, login and
the timeout each only when configured to, and every failure it can raise
turned into one exception type the caller can catch without knowing which
underlying error smtplib produced.
"""
from __future__ import annotations

import smtplib

import pytest

from app.core.config import settings
from app.services.email_sender import EmailSendError, send_email


class _FakeSMTP:
    """Stands in for smtplib.SMTP, recording what was called on it."""

    instances: list[_FakeSMTP] = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.started_tls = False
        self.logged_in = None
        self.sent = None
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, username, password):
        self.logged_in = (username, password)

    def send_message(self, message):
        self.sent = message


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "")
    monkeypatch.setattr(settings, "smtp_password", "")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_from_address", "alerts@gstbot.aiknol.com")
    monkeypatch.setattr(settings, "smtp_timeout_seconds", 10.0)
    _FakeSMTP.instances = []
    monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
    yield


def test_a_message_is_sent_with_the_configured_from_address():
    send_email(to="owner@example.com", subject="Test", body="Body text")

    client = _FakeSMTP.instances[0]
    assert client.host == "smtp.example.com"
    assert client.port == 587
    assert client.timeout == 10.0
    assert client.sent["To"] == "owner@example.com"
    assert client.sent["From"] == "alerts@gstbot.aiknol.com"
    assert client.sent["Subject"] == "Test"
    assert client.sent.get_content().strip() == "Body text"


def test_tls_is_started_when_configured():
    send_email(to="owner@example.com", subject="s", body="b")

    assert _FakeSMTP.instances[0].started_tls is True


def test_tls_is_skipped_for_a_local_mail_catcher(monkeypatch):
    monkeypatch.setattr(settings, "smtp_use_tls", False)

    send_email(to="owner@example.com", subject="s", body="b")

    assert _FakeSMTP.instances[0].started_tls is False


def test_login_happens_only_when_a_username_is_configured(monkeypatch):
    send_email(to="owner@example.com", subject="s", body="b")
    assert _FakeSMTP.instances[0].logged_in is None

    monkeypatch.setattr(settings, "smtp_username", "relay-user")
    monkeypatch.setattr(settings, "smtp_password", "relay-pass")
    send_email(to="owner@example.com", subject="s", body="b")
    assert _FakeSMTP.instances[1].logged_in == ("relay-user", "relay-pass")


def test_an_smtp_error_becomes_an_email_send_error(monkeypatch):
    class _Refusing(_FakeSMTP):
        def send_message(self, message):
            raise smtplib.SMTPRecipientsRefused({"owner@example.com": (550, b"no such user")})

    monkeypatch.setattr(smtplib, "SMTP", _Refusing)

    with pytest.raises(EmailSendError):
        send_email(to="owner@example.com", subject="s", body="b")


def test_a_connection_failure_becomes_an_email_send_error(monkeypatch):
    class _Unreachable(_FakeSMTP):
        def __init__(self, *a, **k):
            raise OSError("connection refused")

    monkeypatch.setattr(smtplib, "SMTP", _Unreachable)

    with pytest.raises(EmailSendError):
        send_email(to="owner@example.com", subject="s", body="b")
