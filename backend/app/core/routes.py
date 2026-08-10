"""Resolving the assembled route table to a flat list.

Three sweeps in the suite and the OpenAPI customisation in
:mod:`app.core.openapi` all ask the same question — "what does this app
actually serve?" — and all of them get it wrong the same way if they read
``app.routes`` directly. The walk lives here so there is one answer.

``app.routes`` is not a flat list of the routes an app serves. Since FastAPI
0.141 ``include_router`` no longer copies the router's routes into the parent;
it appends one lazy ``_IncludedRouter`` node that materialises its children —
with the prefix, tags and dependencies already applied — on demand. Filtering
``app.routes`` for ``APIRoute`` therefore finds exactly one route here, the
bare ``/``, which is how every sweep in ``tests/test_route_contracts.py``
quietly stopped sweeping anything while still passing.

The materialised children are not ``APIRoute`` instances but they carry the
same attributes every caller reads (``path``, ``methods``, ``status_code``,
``response_model``, ``dependant``, ``endpoint``, ``include_in_schema``), so
both shapes are collected interchangeably — which also keeps this working
against a FastAPI that still flattens.
"""
from __future__ import annotations

from typing import Any

from fastapi.routing import APIRoute


def _descend(candidates: Any, collected: list) -> None:
    for item in candidates:
        if hasattr(item, "effective_candidates"):
            _descend(item.effective_candidates(), collected)
        else:
            collected.append(item)


def collect_api_routes(application: Any) -> list:
    """Every route *application* serves, resolved to the path it answers on."""
    collected: list = []
    for route in application.routes:
        if hasattr(route, "effective_candidates"):
            # A node's low-priority list already contains its descendants', so
            # it is read here rather than inside the recursion, which would
            # collect those routes once per level.
            collected.extend(route.effective_low_priority_routes())
            _descend(route.effective_candidates(), collected)
        elif isinstance(route, APIRoute):
            collected.append(route)
    return collected


def dependency_calls(dependant: Any) -> Any:
    """Every callable behind a route, including nested dependencies.

    A ``RateLimit`` or ``get_current_business`` is as often reached through a
    router-level ``dependencies=`` as declared on the route itself, so asking
    only the top level answers the wrong question.
    """
    yield dependant.call
    for sub in dependant.dependencies:
        yield from dependency_calls(sub)


__all__ = ["collect_api_routes", "dependency_calls"]
