"""Bounds on the bare integers a URL is allowed to carry.

``invoice_id: int`` and ``offset: int = Query(ge=0)`` look validated and are
not: Python's ``int`` has no width, so both accept a number of any size and
hand it to the database, which is where the request finally fails.

It fails differently on each backend, and neither answer is the one the caller
has earned:

* ``OFFSET 10000000000000000000000000`` is ``bigint out of range`` on Postgres
  and ``OverflowError: Python int too large to convert to SQLite INTEGER`` on
  SQLite. A 500 on both, from a query string, on four list endpoints.
* ``WHERE id = 10000000000000000000000000`` raises the same ``OverflowError``
  on SQLite and quietly matches nothing on Postgres. So the id case is a 500 in
  the suite's backend and a 404 on the deployment — the split that hides a
  defect rather than showing it, in the direction that makes the tests the
  thing that looks broken.

Both are bounded here rather than at each of the twelve call sites, so a route
added later gets the bound by spelling its parameter with these names, and the
route-contract suite can check that it did.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Path, Query

# The largest value an ``Integer`` primary key holds: Postgres ``INTEGER`` is
# 32 bits, and every id in this schema is one. An id above it cannot name a row
# that exists, so refusing it costs nothing and is the honest answer.
#
# It doubles as the ceiling on a pagination offset: you cannot skip past more
# rows than there can be ids, and two billion is far enough beyond any real
# page that no caller will meet it by accident. Well inside ``bigint`` either
# way, which is what the OFFSET clause is actually limited by.
MAX_ID = 2**31 - 1

# The smallest id a row can have. Every primary key here is an autoincrementing
# ``Integer``, so the sequence starts at 1 and nothing below it names a row.
#
# A ceiling alone left this module's own bug open at the other end. ``le`` is
# satisfied by every negative number, so ``/invoices/-10000000000000000000000000``
# went straight through to the lookup — and a width the column cannot hold
# fails on the way in whichever direction it overflows: ``OverflowError:
# Python int too large to convert to SQLite INTEGER``, raised out of the
# driver rather than out of SQLAlchemy, so it is not even one of the errors
# ``app.core.errors`` turns into a considered response. A 500, from a URL.
#
# Postgres compares the same value as a numeric and quietly matches nothing, so
# this is the split the module docstring warns about, in the same direction: a
# 500 in the suite's backend and a 404 on the deployment.
MIN_ID = 1

# A row id out of a path segment.
RowId = Annotated[int, Path(ge=MIN_ID, le=MAX_ID)]

# ``offset: Offset = 0`` on every paginated list.
Offset = Annotated[int, Query(ge=0, le=MAX_ID, description="Rows to skip.")]

# The longest a path segment naming one of a fixed set may be. The sets it
# guards are tiny — "gstr1", "gstr3b", "purchases", "json", "csv" — so this is
# not a limit any caller meets; it is a ceiling on what an unknown value costs.
#
# A route that looks its segment up in a dict and 404s on a miss reads as
# already safe, and mostly is: the lookup misses in constant time. What it does
# next is the problem — each of them quotes the segment back ("Unknown return
# type '...'"), and that detail leaves through the HTTPException handler, which
# does not bound what a route hands it. Unbounded, the 404 is a reflector of
# whatever was in the URL. The 422 handler learned the same lesson separately;
# see ``_MAX_ECHOED_INPUT`` in ``app.core.errors``.
MAX_SLUG_LENGTH = 32

# A short, fixed-vocabulary name out of a path segment — a return type, a file
# extension. Deliberately a length bound and not a pattern: the route owns the
# vocabulary and answers 404 for a name outside it, which says more than a 422
# on a regex would, and spelling the set here too would be a second place to
# update whenever one is added.
Slug = Annotated[str, Path(max_length=MAX_SLUG_LENGTH)]
