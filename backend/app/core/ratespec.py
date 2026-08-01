"""Parsing for rate-limit specifications like ``"30/minute"``.

A leaf module with no application imports, on purpose. Both ``core.config``
(which validates the configured limits at startup) and ``core.rate_limit``
(which enforces them) need this, and config cannot import the limiter without
a cycle — the limiter reads settings.
"""
from __future__ import annotations

from dataclasses import dataclass

_UNITS = {
    "s": 1, "sec": 1, "second": 1, "seconds": 1,
    "m": 60, "min": 60, "minute": 60, "minutes": 60,
    "h": 3600, "hour": 3600, "hours": 3600,
    "d": 86400, "day": 86400, "days": 86400,
}


@dataclass(frozen=True)
class Rate:
    """*limit* requests per *window* seconds."""

    limit: int
    window: int

    @property
    def label(self) -> str:
        """How the limit is written in an error message the caller reads."""
        for seconds, name in ((60, "minute"), (3600, "hour"), (86400, "day")):
            if self.window == seconds:
                return f"{self.limit}/{name}"
        return f"{self.limit}/{self.window}s"


def parse_rate(spec: str) -> Rate:
    """``"30/minute"``, ``"5/10s"``, ``"1000/hour"`` → :class:`Rate`.

    Raises ``ValueError`` with a message naming the offending spec, because the
    only two callers are a startup validator and a config reader, and both want
    to tell an operator exactly which entry is wrong.
    """
    count, _, unit = spec.partition("/")
    try:
        limit = int(count.strip())
    except ValueError as exc:
        raise ValueError(f"Invalid rate '{spec}': expected '<count>/<period>'") from exc
    if limit <= 0:
        raise ValueError(f"Invalid rate '{spec}': count must be positive")

    unit = unit.strip().lower() or "minute"
    if unit in _UNITS:
        return Rate(limit, _UNITS[unit])

    # "10s", "90m" — a number glued to a unit.
    digits = "".join(ch for ch in unit if ch.isdigit())
    suffix = unit[len(digits):] if digits else unit
    if digits and suffix in _UNITS:
        window = int(digits) * _UNITS[suffix]
        if window <= 0:
            raise ValueError(f"Invalid rate '{spec}': period must be positive")
        return Rate(limit, window)
    raise ValueError(f"Invalid rate '{spec}': unknown period '{unit}'")
