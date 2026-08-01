"""GSTBot FastAPI application entrypoint."""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.core.config import settings
from app.routers import auth, dashboard, invoices, misc, reconciliation


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Created at startup rather than on first upload, so a bad path or a
    # read-only volume fails at deploy time instead of on a user's file.
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="AI GST compliance for Indian SMBs.",
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = settings.api_v1_prefix
    app.include_router(misc.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix)
    app.include_router(invoices.router, prefix=prefix)
    app.include_router(dashboard.router, prefix=prefix)
    app.include_router(reconciliation.router, prefix=prefix)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"app": settings.app_name, "docs": "/docs", "health": f"{prefix}/health"}

    return app


app = create_app()
