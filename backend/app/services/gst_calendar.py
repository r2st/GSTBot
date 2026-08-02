"""When a return for a period is due.

A monthly return's due date is arithmetic on the period, not a lookup: every
one of them falls on a fixed day of the *following* month, so the whole rule is
a day number plus a December rollover.

That is short enough that it had already been written twice — once in the
dashboard for GSTR-3B and once in supplier scoring for GSTR-1, each with its
own copy of the rollover — and the alerting needs both. Three copies of a rule
the government does move (the 3B date has been staggered by turnover before,
and quarterly filers under QRMP follow a different one entirely) is three
places to miss when it changes next, so it lives here once.

Only the returns *this business files* have a due date. A GSTR-2B is generated
by the portal rather than submitted to it, so asking when one is due is a
question about a return that is never late; :func:`due_date` refuses it rather
than inventing a day.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

from app.models.gstr_return import ReturnType

# The only shape a filing period may take: ``YYYY-MM`` with a month that exists.
#
# ``\d{4}-\d{2}`` is the obvious pattern and it is not a period validator — it
# admits ``2026-00`` and ``2026-13``, and every route that took one handed it
# straight to arithmetic that assumes a real month. ``next_period("2026-13")``
# is ``2026-14``, which ``date()`` refuses, so a due date computed from it was
# a 500 rather than the 422 a malformed query string has earned. The ones that
# did not raise were worse: ``2026-13`` built a GSTR-1 stamped ``fp=132026``
# and ``2026-00`` quietly aliased onto January, both of them documents about a
# month that does not exist.
#
# Anchored, so it validates the same whether a caller matches or searches with
# it. Exported as the single definition every route, schema and importer spells
# the period with.
PERIOD_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"

_PERIOD_RE = re.compile(PERIOD_PATTERN)

# Every date in this module is an Indian one. A due date falls at the end of
# the 20th *in India*, so a server running on UTC is already a day behind by
# 18:30 local — which would have the alerting call a return on time for another
# five and a half hours after the penalty started running.
#
# A fixed offset rather than ``ZoneInfo("Asia/Kolkata")``: India has not
# observed daylight saving since 1945 and IST has been UTC+05:30 throughout, so
# there is no rule to look up, and this needs no tzdata on the host.
IST = timezone(timedelta(hours=5, minutes=30), "IST")

# GSTR-1 — outward supplies — is due on the 11th of the month after the period.
GSTR1_DUE_DAY = 11

# GSTR-3B — the summary and the payment — is due on the 20th. This is the one
# that carries interest and a late fee, which is why it is the date the
# dashboard leads with.
GSTR3B_DUE_DAY = 20


def today_ist() -> date:
    """The current date in India — the only date a GST deadline is measured in."""
    return datetime.now(IST).date()


def ist_date(moment: datetime) -> date:
    """The Indian calendar date a stored instant falls on.

    Reading ``.date()`` off a timestamp straight out of the database is wrong
    on the backend that ships and right on the one the suite runs, which is the
    worst combination available. Midnight IST is 18:30 *the previous day* in
    UTC, so a filing recorded on the 15th comes back from Postgres — which
    stores ``timestamptz`` normalised to UTC — as the 14th, and every recorded
    filing is reported a day early. SQLite has no zone at all: SQLAlchemy
    formats the wall clock and drops the offset, so the same call returns the
    15th and the test suite sees nothing wrong.

    A naive value is therefore read as the IST wall time it was written as, and
    an aware one is converted.
    """
    return moment.date() if moment.tzinfo is None else moment.astimezone(IST).date()


def is_period(value: object) -> bool:
    """Whether *value* is a ``YYYY-MM`` period naming a month that exists."""
    return isinstance(value, str) and _PERIOD_RE.match(value) is not None


def period_of(moment: date) -> str:
    """The ``YYYY-MM`` period *moment* falls in."""
    return f"{moment.year:04d}-{moment.month:02d}"


def next_period(period: str) -> str:
    """The ``YYYY-MM`` period after *period*."""
    year, month = (int(part) for part in period.split("-"))
    return f"{year + 1:04d}-01" if month == 12 else f"{year:04d}-{month + 1:02d}"


def previous_period(period: str) -> str:
    """The ``YYYY-MM`` period before *period*."""
    year, month = (int(part) for part in period.split("-"))
    return f"{year - 1:04d}-12" if month == 1 else f"{year:04d}-{month - 1:02d}"


def completed_periods(today: date, count: int) -> list[str]:
    """The *count* periods that have ended as of *today*, newest first.

    The month *today* falls in is excluded: a return covers a whole month, and
    the portal does not open it until that month is over. Including it would
    have the product asking for a GSTR-1 covering sales that have not happened.
    """
    period = period_of(today)
    periods: list[str] = []
    for _ in range(count):
        period = previous_period(period)
        periods.append(period)
    return periods


def _due_on(period: str, day: int) -> date:
    """*day* of the month following *period*."""
    year, month = (int(part) for part in next_period(period).split("-"))
    return date(year, month, day)


def gstr1_due_date(period: str) -> date:
    """GSTR-1 due date for *period* — the 11th of the following month."""
    return _due_on(period, GSTR1_DUE_DAY)


def gstr3b_due_date(period: str) -> date:
    """GSTR-3B due date for *period* — the 20th of the following month."""
    return _due_on(period, GSTR3B_DUE_DAY)


# The returns a business files, and the day each is due. Iterated by the
# alerting, so a return type added here is one the deadline alerts start
# covering without a second edit.
DUE_DAY: dict[ReturnType, int] = {
    ReturnType.GSTR1: GSTR1_DUE_DAY,
    ReturnType.GSTR3B: GSTR3B_DUE_DAY,
}


def due_date(period: str, return_type: ReturnType) -> date:
    """Due date for *return_type* covering *period*.

    Raises :class:`ValueError` for a return the business does not file — see
    the module docstring on why GSTR-2B has no due date.
    """
    try:
        day = DUE_DAY[return_type]
    except KeyError:
        raise ValueError(
            f"{return_type.value} is not a return this business files, so it has "
            "no due date"
        ) from None
    return _due_on(period, day)
