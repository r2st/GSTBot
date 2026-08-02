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

from datetime import date

from app.models.gstr_return import ReturnType

# GSTR-1 — outward supplies — is due on the 11th of the month after the period.
GSTR1_DUE_DAY = 11

# GSTR-3B — the summary and the payment — is due on the 20th. This is the one
# that carries interest and a late fee, which is why it is the date the
# dashboard leads with.
GSTR3B_DUE_DAY = 20


def next_period(period: str) -> str:
    """The ``YYYY-MM`` period after *period*."""
    year, month = (int(part) for part in period.split("-"))
    return f"{year + 1:04d}-01" if month == 12 else f"{year:04d}-{month + 1:02d}"


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
