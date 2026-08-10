"""Emailing the alerts the sweep raises: who gets one, and what it changes.

Every test drives :func:`send_pending_alerts` directly against a real (SQLite)
session, and stands in for the SMTP server by monkeypatching
``app.services.alert_delivery.send_email`` — the module-level name the service
imported, not the one on ``email_sender``, since that is the one a call inside
this module actually resolves.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest

from app.core.config import settings
from app.core.security import hash_password
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.business import Business
from app.models.user import User
from app.services import alert_delivery
from app.services.alert_delivery import send_pending_alerts
from app.services.email_sender import EmailSendError
from tests.conftest import BUSINESS_GSTIN

NOW = datetime(2026, 5, 14, 7, 15)


def make_business(db, *, gstin=BUSINESS_GSTIN, **kwargs) -> Business:
    business = Business(
        gstin=gstin,
        legal_name="Umang Traders Private Limited",
        state_code=gstin[:2],
        **kwargs,
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


def make_user(db, business, *, email="owner@example.com", is_active=True) -> User:
    user = User(
        business_id=business.id,
        email=email,
        hashed_password=hash_password("correct horse battery staple"),
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_alert(
    db,
    business,
    *,
    status=AlertStatus.PENDING,
    title="GSTR-1 for 2026-04 is overdue",
    message="GSTR-1 for 2026-04 was due on 2026-05-11.",
    due_date=date(2026, 5, 11),
) -> Alert:
    alert = Alert(
        business_id=business.id,
        alert_type=AlertType.FILING_DEADLINE,
        status=status,
        title=title,
        message=message,
        due_date=due_date,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@pytest.fixture(autouse=True)
def _email_enabled(monkeypatch):
    """The configuration every test starts from: on, and a relay named."""
    monkeypatch.setattr(settings, "alerts_email_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")


@pytest.fixture()
def sent(monkeypatch):
    """Replace the SMTP call with a recorder; sends succeed unless told otherwise."""
    calls: list[dict] = []

    def fake_send_email(*, to, subject, body):
        calls.append({"to": to, "subject": subject, "body": body})

    monkeypatch.setattr(alert_delivery, "send_email", fake_send_email)
    return calls


@pytest.fixture()
def business(db_session) -> Business:
    return make_business(db_session)


class TestWhenEmailIsNotConfigured:
    def test_disabled_entirely_sends_nothing(self, db_session, business, sent, monkeypatch):
        monkeypatch.setattr(settings, "alerts_email_enabled", False)
        make_user(db_session, business)
        alert = make_alert(db_session, business)

        result = send_pending_alerts(db_session, now=NOW)

        assert sent == []
        assert result.businesses == 0
        db_session.refresh(alert)
        assert alert.channel is None
        assert alert.sent_at is None
        assert alert.status is AlertStatus.PENDING

    def test_enabled_with_no_relay_named_sends_nothing(
        self, db_session, business, sent, monkeypatch
    ):
        monkeypatch.setattr(settings, "smtp_host", "")
        make_user(db_session, business)
        make_alert(db_session, business)

        result = send_pending_alerts(db_session, now=NOW)

        assert sent == []
        assert result == alert_delivery.AlertEmailResult()


class TestASuccessfulSend:
    def test_one_email_covers_every_open_alert_for_the_business(
        self, db_session, business, sent
    ):
        make_user(db_session, business)
        make_alert(db_session, business, title="GSTR-1 for 2026-04 is overdue")
        make_alert(
            db_session,
            business,
            title="GSTR-3B for 2026-04 is due in 6 days",
            due_date=date(2026, 5, 20),
        )

        result = send_pending_alerts(db_session, now=NOW)

        assert len(sent) == 1
        assert "GSTR-1 for 2026-04 is overdue" in sent[0]["body"]
        assert "GSTR-3B for 2026-04 is due in 6 days" in sent[0]["body"]
        assert result.businesses == 1
        assert result.emails_sent == 1
        assert result.alerts_sent == 2

    def test_the_subject_counts_the_alerts_it_covers(self, db_session, business, sent):
        make_user(db_session, business)
        make_alert(db_session, business)
        make_alert(db_session, business, title="Second alert", due_date=date(2026, 5, 20))

        send_pending_alerts(db_session, now=NOW)

        assert sent[0]["subject"] == "2 GST alerts need your attention"

    def test_a_single_alert_gets_a_singular_subject(self, db_session, business, sent):
        make_user(db_session, business)
        make_alert(db_session, business)

        send_pending_alerts(db_session, now=NOW)

        assert sent[0]["subject"] == "1 GST alert needs your attention"

    def test_sent_alerts_are_stamped_and_marked_sent(self, db_session, business, sent):
        make_user(db_session, business)
        alert = make_alert(db_session, business)

        send_pending_alerts(db_session, now=NOW)

        db_session.refresh(alert)
        assert alert.channel == "email"
        assert alert.sent_at == NOW
        assert alert.status is AlertStatus.SENT

    def test_every_active_user_is_emailed(self, db_session, business, sent):
        make_user(db_session, business, email="owner@example.com")
        make_user(db_session, business, email="accountant@example.com")
        make_alert(db_session, business)

        send_pending_alerts(db_session, now=NOW)

        assert {call["to"] for call in sent} == {
            "owner@example.com",
            "accountant@example.com",
        }

    def test_an_inactive_user_is_not_emailed(self, db_session, business, sent):
        make_user(db_session, business, email="owner@example.com")
        make_user(db_session, business, email="ex-employee@example.com", is_active=False)
        make_alert(db_session, business)

        send_pending_alerts(db_session, now=NOW)

        assert {call["to"] for call in sent} == {"owner@example.com"}

    def test_the_clock_is_read_when_no_now_is_given(self, db_session, business, sent):
        make_user(db_session, business)
        alert = make_alert(db_session, business)

        send_pending_alerts(db_session)

        db_session.refresh(alert)
        assert alert.sent_at is not None


class TestWhatIsExcluded:
    def test_a_read_alert_is_not_emailed(self, db_session, business, sent):
        make_user(db_session, business)
        alert = make_alert(db_session, business, status=AlertStatus.READ)

        result = send_pending_alerts(db_session, now=NOW)

        assert sent == []
        assert result.businesses == 0
        db_session.refresh(alert)
        assert alert.channel is None

    def test_a_dismissed_alert_is_not_emailed(self, db_session, business, sent):
        make_user(db_session, business)
        make_alert(db_session, business, status=AlertStatus.DISMISSED)

        send_pending_alerts(db_session, now=NOW)

        assert sent == []

    def test_a_resolved_alert_is_not_emailed(self, db_session, business, sent):
        make_user(db_session, business)
        make_alert(db_session, business, status=AlertStatus.RESOLVED)

        send_pending_alerts(db_session, now=NOW)

        assert sent == []

    def test_a_deleted_alert_is_not_emailed(self, db_session, business, sent):
        make_user(db_session, business)
        alert = make_alert(db_session, business)
        alert.deleted_at = NOW
        db_session.commit()

        send_pending_alerts(db_session, now=NOW)

        assert sent == []

    def test_a_deactivated_business_is_skipped(self, db_session, business, sent):
        make_user(db_session, business)
        make_alert(db_session, business)
        business.is_active = False
        db_session.commit()

        result = send_pending_alerts(db_session, now=NOW)

        assert sent == []
        assert result.businesses == 0

    def test_a_business_with_no_users_is_counted_as_skipped_not_sent(
        self, db_session, business, sent
    ):
        make_alert(db_session, business)

        result = send_pending_alerts(db_session, now=NOW)

        assert sent == []
        assert result.businesses == 0
        assert result.skipped_no_recipient == 1


class TestARelayFailure:
    def test_every_recipient_failing_marks_the_alerts_failed_not_sent(
        self, db_session, business, monkeypatch
    ):
        make_user(db_session, business)
        alert = make_alert(db_session, business)

        def always_fails(*, to, subject, body):
            raise EmailSendError("relay unreachable")

        monkeypatch.setattr(alert_delivery, "send_email", always_fails)

        result = send_pending_alerts(db_session, now=NOW)

        db_session.refresh(alert)
        assert alert.channel == "email"
        assert alert.sent_at is None
        assert alert.status is AlertStatus.FAILED
        assert result.alerts_failed == 1
        assert result.alerts_sent == 0

    def test_a_previously_failed_alert_is_retried_the_next_run(
        self, db_session, business, sent
    ):
        make_user(db_session, business)
        alert = make_alert(db_session, business, status=AlertStatus.FAILED)

        send_pending_alerts(db_session, now=NOW)

        db_session.refresh(alert)
        assert alert.status is AlertStatus.SENT
        assert len(sent) == 1

    def test_one_recipient_failing_does_not_stop_another_from_being_reached(
        self, db_session, business, monkeypatch
    ):
        make_user(db_session, business, email="bad@example.com")
        make_user(db_session, business, email="good@example.com")
        alert = make_alert(db_session, business)

        def selective(*, to, subject, body):
            if to == "bad@example.com":
                raise EmailSendError("mailbox does not exist")

        monkeypatch.setattr(alert_delivery, "send_email", selective)

        send_pending_alerts(db_session, now=NOW)

        db_session.refresh(alert)
        assert alert.status is AlertStatus.SENT
        assert alert.sent_at == NOW


class TestAnUnexpectedSendFailure:
    """``send_email`` promises to raise only :class:`EmailSendError` — see its
    own docstring — but a misconfigured relay does not keep every promise: an
    SMTP username set with no password makes ``smtplib.SMTP.login`` raise
    ``AttributeError``, not ``SMTPException``. Nothing about that is specific
    to one tenant, so it must not be allowed to behave as if it were.
    """

    def test_one_businesss_broken_config_does_not_stop_the_next_business(
        self, db_session, monkeypatch
    ):
        first = make_business(db_session, gstin=BUSINESS_GSTIN)
        second = make_business(db_session, gstin="29AABCU9603R1ZM")
        make_user(db_session, first, email="first@example.com")
        make_user(db_session, second, email="second@example.com")
        first_alert = make_alert(db_session, first)
        second_alert = make_alert(db_session, second)

        def broken_for_first(*, to, subject, body):
            if to == "first@example.com":
                raise AttributeError("'NoneType' object has no attribute 'encode'")

        monkeypatch.setattr(alert_delivery, "send_email", broken_for_first)

        result = send_pending_alerts(db_session, now=NOW)

        db_session.refresh(first_alert)
        db_session.refresh(second_alert)
        # The broken business is rolled back and left exactly as the sweep
        # found it - not marked failed, since it was never actually attempted
        # in a way this module could account for.
        assert first_alert.status is AlertStatus.PENDING
        assert first_alert.channel is None
        # The second business is unaffected by the first one's crash.
        assert second_alert.status is AlertStatus.SENT
        assert second_alert.sent_at == NOW
        assert result.businesses == 1
        assert result.emails_sent == 1


class TestAcrossSeveralBusinesses:
    def test_each_business_gets_its_own_digest(self, db_session, sent):
        first = make_business(db_session, gstin=BUSINESS_GSTIN)
        second = make_business(db_session, gstin="29AABCU9603R1ZM")
        make_user(db_session, first, email="first@example.com")
        make_user(db_session, second, email="second@example.com")
        make_alert(db_session, first)
        make_alert(db_session, second)

        result = send_pending_alerts(db_session, now=NOW)

        assert result.businesses == 2
        assert {call["to"] for call in sent} == {"first@example.com", "second@example.com"}

    def test_a_business_with_nothing_open_is_left_alone(self, db_session, sent):
        first = make_business(db_session, gstin=BUSINESS_GSTIN)
        second = make_business(db_session, gstin="29AABCU9603R1ZM")
        make_user(db_session, first, email="first@example.com")
        make_user(db_session, second, email="second@example.com")
        make_alert(db_session, first)
        # second has no alerts at all — should generate no query result for it.

        result = send_pending_alerts(db_session, now=NOW)

        assert result.businesses == 1
        assert len(sent) == 1


def test_the_result_is_json_serialisable_for_the_task_backend():
    assert alert_delivery.AlertEmailResult(businesses=1, emails_sent=1).as_dict() == {
        "businesses": 1,
        "emails_sent": 1,
        "alerts_sent": 0,
        "alerts_failed": 0,
        "skipped_no_recipient": 0,
    }
