"""CA referral tracking — who referred whom, and how many signups each link drove."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Referral(Base):
    """One referral event: a visitor arrived through a CA's link.

    Not business-scoped: the referrer is identified by their code, and the
    visitor may not have an account yet. The ``referrer_user_id`` ties back
    to the user who owns the code, so the leaderboard can show a name.
    """

    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(primary_key=True)
    referral_code: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    referrer_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    visitor_ip_hash: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    converted: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
