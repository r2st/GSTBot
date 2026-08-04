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

# A row id out of a path segment.
RowId = Annotated[int, Path(le=MAX_ID)]

# ``offset: Offset = 0`` on every paginated list.
Offset = Annotated[int, Query(ge=0, le=MAX_ID, description="Rows to skip.")]
