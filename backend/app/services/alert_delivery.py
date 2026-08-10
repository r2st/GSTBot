"""Emailing the alerts the daily sweep raises.

``app/services/alerting.py`` creates and refreshes ``Alert`` rows and says
plainly what it does not do: reach email, SMS or WhatsApp. ``channel`` and
``sent_at`` stay null on every row until something picks them up. This module
is that something, for email — the one channel :data:`Settings.smtp_host`
makes possible without a second integration.

**One email per business, not one per alert.** A business with three deadlines
approaching at once should see one message, not three — the sweep's own
central rule is not becoming noise, and a digest is the same rule applied to
delivery. Every alert folded into a digest still gets its own ``channel`` and
``sent_at`` stamped individually, so the per-row bookkeeping the sweep's
comment promised is intact; only the transmission is batched.

**What is sendable.** Only ``PENDING`` and ``FAILED`` — an alert already
``READ`` or ``DISMISSED`` means the business has already seen it, in the
product, and an email repeating that is exactly the noise the sweep exists to
avoid. ``FAILED`` stays sendable so a relay outage on one day is retried the
next, without a second sweep having to notice and re-raise anything.

**Isolation.** Committed per business, for the same reason the sweep itself
is: a bad address or a mid-run SMTP outage on one tenant must not cost every
tenant after it its place in today's send.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert import Alert, AlertStatus
from app.models.business import Business
from app.services.email_sender import EmailSendError, send_email

logger = logging.getLogger(__name__)

_CHANNEL = "email"

# READ and DISMISSED are excluded because the business already knows; RESOLVED
# because the thing the alert was about is no longer true. See the module
# docstring for why FAILED stays in rather than being given up on.
_SENDABLE_STATUSES = (AlertStatus.PENDING, AlertStatus.FAILED)


@dataclass(frozen=True)
class AlertEmailResult:
    """What one run of the digest sender did. Returned so the Celery task has
    a result worth recording and the numbers can be asserted on, the same
    reasoning as :class:`app.services.alerting.SweepResult`.
    """

    businesses: int = 0
    emails_sent: int = 0
    alerts_sent: int = 0
    alerts_failed: int = 0
    skipped_no_recipient: int = 0

    def as_dict(self) -> dict:
        return {
            "businesses": self.businesses,
            "emails_sent": self.emails_sent,
            "alerts_sent": self.alerts_sent,
            "alerts_failed": self.alerts_failed,
            "skipped_no_recipient": self.skipped_no_recipient,
        }


def _digest(alerts: list[Alert]) -> tuple[str, str]:
    """The subject and body for one business's outstanding alerts."""
    subject = (
        "1 GST alert needs your attention"
        if len(alerts) == 1
        else f"{len(alerts)} GST alerts need your attention"
    )
    lines = ["GSTBot has the following open items:", ""]
    for alert in alerts:
        due = f" (due {alert.due_date.isoformat()})" if alert.due_date else ""
        lines.append(f"- {alert.title}{due}")
        lines.append(f"  {alert.message}")
        lines.append("")
    lines.append("Sign in to GSTBot to review or dismiss these.")
    return subject, "\n".join(lines)


def _recipients(business: Business) -> list[str]:
    """Every active user's email, in a stable order.

    Not just the owner: an accountant added to the business is exactly who
    should hear about a deadline they may be the one filing.
    """
    return sorted({u.email for u in business.users if u.is_active and u.email})


def _send_to_all(recipients: list[str], subject: str, body: str, *, business_id: int) -> bool:
    """Try every recipient; a business counts as reached if any one of them got it."""
    reached = False
    for address in recipients:
        try:
            send_email(to=address, subject=subject, body=body)
            reached = True
        except EmailSendError:
            logger.warning(
                "Alert email failed for business %s recipient %s",
                business_id,
                address,
                exc_info=True,
            )
    return reached


def send_pending_alerts(db: Session, *, now: datetime | None = None) -> AlertEmailResult:
    """Email each business one digest of its undelivered alerts.

    A no-op, safely, when email is not configured — the same trade the rest of
    this product makes for OpenRouter: a missing integration degrades the
    feature it powers rather than failing the process that would otherwise run
    fine without it.
    """
    if not settings.alerts_email_enabled or not settings.smtp_host:
        return AlertEmailResult()

    now = now or datetime.now(UTC)

    business_ids = db.scalars(
        select(Alert.business_id)
        .where(Alert.status.in_(_SENDABLE_STATUSES), Alert.deleted_at.is_(None))
        .distinct()
        .order_by(Alert.business_id)
    ).all()

    total = AlertEmailResult()
    for business_id in business_ids:
        business = db.get(Business, business_id)
        if business is None or business.deleted_at is not None or not business.is_active:
            continue

        alerts = db.scalars(
            select(Alert)
            .where(
                Alert.business_id == business_id,
                Alert.status.in_(_SENDABLE_STATUSES),
                Alert.deleted_at.is_(None),
            )
            .order_by(Alert.due_date, Alert.id)
        ).all()
        if not alerts:
            continue

        recipients = _recipients(business)
        if not recipients:
            total = AlertEmailResult(
                businesses=total.businesses,
                emails_sent=total.emails_sent,
                alerts_sent=total.alerts_sent,
                alerts_failed=total.alerts_failed,
                skipped_no_recipient=total.skipped_no_recipient + len(alerts),
            )
            continue

        subject, body = _digest(alerts)
        reached = _send_to_all(recipients, subject, body, business_id=business_id)

        try:
            for alert in alerts:
                alert.channel = _CHANNEL
                if reached:
                    alert.sent_at = now
                    alert.status = AlertStatus.SENT
                else:
                    alert.status = AlertStatus.FAILED
            db.commit()
        except Exception:  # noqa: BLE001 - one tenant must not end the run
            db.rollback()
            logger.exception("Could not record alert delivery for business %s", business_id)
            continue

        total = AlertEmailResult(
            businesses=total.businesses + 1,
            emails_sent=total.emails_sent + (1 if reached else 0),
            alerts_sent=total.alerts_sent + (len(alerts) if reached else 0),
            alerts_failed=total.alerts_failed + (0 if reached else len(alerts)),
            skipped_no_recipient=total.skipped_no_recipient,
        )

    logger.info("Alert email digest: %s", total.as_dict())
    return total
