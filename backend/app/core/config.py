"""Application configuration, loaded from environment / .env.

All settings are typed and validated by pydantic-settings. Nothing sensitive is
hard-coded — secrets come from the environment or the gitignored ``keys/`` dir.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-to-a-long-random-string"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- App ----
    app_name: str = "GSTBot"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    backend_cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ---- Security / JWT ----
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # ---- Database ----
    database_url: str = "postgresql+psycopg://gstbot:gstbot@localhost:5432/gstbot"

    # ---- Redis / Celery ----
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    # When False, invoice parsing runs inline in the upload request instead of
    # being handed to a worker. Intended for single-process deployments and
    # tests; production runs workers and leaves this on.
    celery_enabled: bool = True

    # ---- AI (OpenRouter — free models only) ----
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Text extraction: the invoice already came out of a PDF or OCR as text.
    openrouter_model: str = "openai/gpt-oss-20b:free"
    # Vision extraction: a photographed or scanned invoice, sent as an image.
    openrouter_vision_model: str = "qwen/qwen2.5-vl-72b-instruct:free"
    openrouter_app_url: str = "https://gstbot.aiknol.com"
    openrouter_app_title: str = "GSTBot"
    openrouter_timeout_seconds: float = 90.0

    # ---- Uploads ----
    upload_dir: str = "./data/invoices"
    max_upload_mb: int = 15

    # ---- Plans (invoices per calendar month, 0 = unlimited) ----
    # Mirrors the published pricing. Enforced at upload time so the ceiling is
    # a property of the API rather than of whichever client is calling it.
    plan_monthly_invoice_limits: str = "free=50,starter=500,pro=0,ca_bundle=0"

    @field_validator("access_token_expire_minutes", "max_upload_mb")
    @classmethod
    def _positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("must be positive")
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_not_default(cls, v: str) -> str:
        env = os.getenv("ENVIRONMENT", "development")
        if env != "development" and v == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET must be set to a strong random value in production. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

    @property
    def plan_limits(self) -> dict[str, int]:
        """``{plan_name: monthly_invoice_cap}``, 0 meaning unlimited."""
        limits: dict[str, int] = {}
        for chunk in self.plan_monthly_invoice_limits.split(","):
            name, _, raw = chunk.partition("=")
            name = name.strip().lower()
            if not name:
                continue
            try:
                limits[name] = int(raw)
            except ValueError:
                continue
        return limits


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (env is read once per process)."""
    return Settings()


settings = get_settings()
