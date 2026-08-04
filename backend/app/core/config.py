"""Application configuration, loaded from environment / .env.

All settings are typed and validated by pydantic-settings. Nothing sensitive is
hard-coded — secrets come from the environment or the gitignored ``keys/`` dir.

Two rules this module enforces, both at startup rather than at first use:

* **Fail loudly, not silently.** A production deployment with the sample JWT
  secret, a wildcard CORS list, or ``DEBUG=true`` refuses to boot. A
  misconfiguration that only shows up as a security hole three months later is
  worse than a container that will not start.
* **Development stays frictionless.** Every one of those checks is scoped to
  non-development environments, so a fresh clone runs with no ``.env`` at all.
"""
from __future__ import annotations

import warnings
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-to-a-long-random-string"

# Below this, a signing key is guessable enough that the tokens it mints are
# not worth much. 32 bytes is the output width of the HS256 HMAC itself.
_MIN_JWT_SECRET_LENGTH = 32

# The environments treated as "not a developer's laptop". Everything stricter
# in this module keys off membership here.
_PRODUCTION_LIKE = frozenset({"production", "prod", "staging", "stage"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- App ----
    app_name: str = "GSTBot"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    backend_cors_origins: str = "http://localhost:5173,http://localhost:3000"
    # Whether /docs, /redoc and /openapi.json are served. Left on by default;
    # a deployment that fronts the API with its own portal turns it off.
    docs_enabled: bool = True

    # ---- Logging ----
    log_level: str = "INFO"
    # "json" for anything that ships to an aggregator, "console" for a terminal.
    log_format: str = "console"

    # ---- Proxying / TLS ----
    # Only true when a proxy we control rewrites X-Forwarded-For. Left false, a
    # client could forge the header and mint itself a new rate-limit bucket.
    trust_proxy_headers: bool = False
    hsts_enabled: bool = False

    # ---- Security / JWT ----
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # ---- Database ----
    database_url: str = "postgresql+psycopg://gstbot:gstbot@localhost:5432/gstbot"
    # Connections held open per process. The default suits a 2-4 worker
    # deployment against a stock Postgres (100 connections): 4 x (10 + 5)
    # leaves headroom for migrations, psql and the Celery workers.
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_max_overflow: int = Field(default=5, ge=0, le=100)
    # Seconds a request waits for a free connection before giving up. Short on
    # purpose: a caller queued behind an exhausted pool should get a 503 it can
    # retry, not a socket that eventually times out.
    db_pool_timeout: int = Field(default=30, ge=1, le=300)
    # Postgres and most poolers drop idle connections well before this;
    # recycling first prevents "server closed the connection unexpectedly".
    db_pool_recycle: int = Field(default=1800, ge=60)
    db_echo: bool = False
    # Seconds a single statement may run before the server cancels it. A
    # runaway query holds a connection, and holding connections is how one slow
    # tenant becomes everyone's outage. 0 disables.
    db_statement_timeout_seconds: int = Field(default=30, ge=0, le=600)

    # ---- Redis / Celery ----
    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_seconds: float = Field(default=2.0, gt=0, le=30)
    # How long a discovered outage is believed before Redis is probed again.
    # This is the whole cost of an outage: one connect attempt per interval per
    # process. Too low and a dead server is a timeout on a request every few
    # seconds; too high and a Redis that came back stays unused, with rate
    # limiting per-process, for that long after.
    redis_retry_interval_seconds: float = Field(default=30.0, gt=0, le=3600)
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    # When False, invoice parsing runs inline in the upload request instead of
    # being handed to a worker. Intended for single-process deployments and
    # tests; production runs workers and leaves this on.
    celery_enabled: bool = True
    # Tasks a worker child handles before it is replaced. Parsing links C
    # libraries (pdf extraction, PIL, tesseract) whose allocations fragment
    # rather than return, so an un-recycled child grows until it is OOM-killed
    # mid-invoice. Low enough to bound that, high enough that fork cost stays
    # noise next to a model call.
    celery_max_tasks_per_child: int = Field(default=200, ge=1, le=100_000)

    # ---- Rate limiting ----
    rate_limit_enabled: bool = True
    # The blanket ceiling every caller passes through, per identity.
    rate_limit_default: str = "300/minute"
    # Per-endpoint overrides as ``name=count/period``. The names are the ones
    # the routes register; anything unlisted uses the limit in the code.
    rate_limit_overrides: str = ""

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
    # Total tries, not retries: 1 disables retrying entirely. Only transient
    # failures (429, 408, 5xx, network) consume one — a 401 fails on the first.
    openrouter_max_attempts: int = Field(default=3, ge=1, le=10)
    # Ceiling on time spent *waiting between* attempts for a single call. With
    # Celery off, extraction runs inline in the upload request, so this is
    # latency a user is sitting through. A retry that would cross it is not
    # taken: falling back to heuristics now beats the same failure 30s later.
    openrouter_retry_max_wait_seconds: float = Field(default=30.0, ge=0, le=300)

    # ---- Uploads ----
    upload_dir: str = "./data/invoices"
    max_upload_mb: int = 15

    # ---- Plans (invoices per calendar month, 0 = unlimited) ----
    # Mirrors the published pricing. Enforced at upload time so the ceiling is
    # a property of the API rather than of whichever client is calling it.
    plan_monthly_invoice_limits: str = "free=50,starter=500,pro=0,ca_bundle=0"

    # ------------------------------------------------------------------
    # Field-level validation
    # ------------------------------------------------------------------

    @field_validator("access_token_expire_minutes", "max_upload_mb")
    @classmethod
    def _positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("must be positive")
        return v

    @field_validator("environment")
    @classmethod
    def _normalised_environment(cls, v: str) -> str:
        return v.strip().lower() or "development"

    @field_validator("log_level")
    @classmethod
    def _known_log_level(cls, v: str) -> str:
        level = v.strip().upper()
        if level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}:
            raise ValueError(
                f"LOG_LEVEL must be one of CRITICAL/ERROR/WARNING/INFO/DEBUG, got '{v}'"
            )
        return level

    @field_validator("log_format")
    @classmethod
    def _known_log_format(cls, v: str) -> str:
        fmt = v.strip().lower()
        if fmt not in {"json", "console"}:
            raise ValueError(f"LOG_FORMAT must be 'json' or 'console', got '{v}'")
        return fmt

    @field_validator("jwt_algorithm")
    @classmethod
    def _supported_algorithm(cls, v: str) -> str:
        algorithm = v.strip().upper()
        # HS* only: the product signs and verifies with the same secret, and an
        # asymmetric algorithm here would mean the verification key and the
        # signing key are the same string — which is the classic JWT confusion.
        if algorithm not in {"HS256", "HS384", "HS512"}:
            raise ValueError(f"JWT_ALGORITHM must be HS256, HS384 or HS512, got '{v}'")
        return algorithm

    @field_validator("database_url")
    @classmethod
    def _known_database(cls, v: str) -> str:
        url = v.strip()
        if not url:
            raise ValueError("DATABASE_URL must be set")
        if not url.startswith(("postgresql", "sqlite")):
            raise ValueError(
                "DATABASE_URL must be a postgresql:// or sqlite:// URL "
                f"(got '{url.split(':', 1)[0]}')"
            )
        return url

    @field_validator("redis_url", "celery_broker_url", "celery_result_backend")
    @classmethod
    def _redis_scheme(cls, v: str) -> str:
        url = v.strip()
        if url and not url.startswith(("redis://", "rediss://", "unix://", "memory://")):
            raise ValueError(f"expected a redis:// URL, got '{url.split(':', 1)[0]}'")
        return url

    @field_validator("rate_limit_default")
    @classmethod
    def _parseable_rate(cls, v: str) -> str:
        from app.core.ratespec import parse_rate

        parse_rate(v)  # Raises ValueError with a usable message.
        return v

    @model_validator(mode="after")
    def _production_invariants(self) -> Settings:
        """Rules that need more than one field, run once the model is built.

        Every environment-dependent rule belongs here rather than in a
        ``field_validator``. A field validator cannot see ``self.environment``
        and has to read ``os.getenv("ENVIRONMENT")`` instead — which is *not*
        the same value, because Settings also reads ``.env``. A deployment that
        sets ENVIRONMENT=production in its .env file rather than exporting it
        would satisfy every check keyed on the field while silently skipping
        every check keyed on the variable.
        """
        if not self.is_production:
            return self

        # Checked here, not on the field, for the reason above: this is what
        # signs every token, and .env is the ordinary way to configure it.
        if self.jwt_secret == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET must be set to a strong random value in production. "
                'Generate one with: python -c "import secrets; '
                'print(secrets.token_urlsafe(64))"'
            )
        if len(self.jwt_secret) < _MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {_MIN_JWT_SECRET_LENGTH} characters "
                f"in production (got {len(self.jwt_secret)})."
            )

        if self.debug:
            raise ValueError(
                f"DEBUG must be false when ENVIRONMENT={self.environment}: debug mode "
                "returns exception details to callers."
            )
        origins = self.cors_origins
        if not origins:
            raise ValueError(
                "BACKEND_CORS_ORIGINS must name at least one origin in production."
            )
        if "*" in origins:
            raise ValueError(
                "BACKEND_CORS_ORIGINS must list explicit origins in production. "
                "'*' with credentials enabled would let any site call the API "
                "with a signed-in user's token."
            )
        insecure = [o for o in origins if o.startswith("http://")]
        if insecure:
            raise ValueError(
                "BACKEND_CORS_ORIGINS must use https in production; got " + ", ".join(insecure)
            )
        return self

    # ------------------------------------------------------------------
    # Derived views
    # ------------------------------------------------------------------

    @property
    def is_production(self) -> bool:
        return self.environment in _PRODUCTION_LIKE

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

    @property
    def rate_limits(self) -> dict[str, str]:
        """``{limit_name: spec}`` from ``RATE_LIMIT_OVERRIDES``.

        Unparseable entries are dropped with a warning rather than crashing: an
        operator tuning a limit at 2am should get the built-in default for the
        one they fat-fingered, not an API that will not start.
        """
        from app.core.ratespec import parse_rate

        overrides: dict[str, str] = {"global": self.rate_limit_default}
        for chunk in self.rate_limit_overrides.split(","):
            name, _, spec = chunk.partition("=")
            name, spec = name.strip().lower(), spec.strip()
            if not name or not spec:
                continue
            try:
                parse_rate(spec)
            except ValueError as exc:
                warnings.warn(
                    f"Ignoring RATE_LIMIT_OVERRIDES entry '{chunk.strip()}': {exc}",
                    stacklevel=2,
                )
                continue
            overrides[name] = spec
        return overrides

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_request_bytes(self) -> int:
        """The largest body any route will accept, envelope included.

        ``max_upload_bytes`` bounds the *file*, and it is checked after the
        body has already been received and buffered — by then the cost the
        limit exists to avoid has been paid. It also says nothing at all about
        the routes that take JSON: a 20 MB body to ``/itc/set-off`` was read,
        decoded and validated in full, because nothing in this application ever
        looked at how big a request was.

        The edge caps bodies at 32 MB (see ``deploy/caddy-gstbot.conf``), which
        is what has been standing in for this. That is the wrong place for it
        to be the only bound: it is above the application's own upload limit,
        so a body twice the size of the largest file this product accepts is
        still delivered whole; and the API listens on the Docker bridge, which
        anything else on that host reaches without passing the edge at all.

        The slack over ``max_upload_bytes`` is for the multipart envelope — the
        part boundaries, the headers, and the ``invoice_type`` field beside the
        file. A megabyte is far more than that costs and small enough that the
        ceiling still means what it says.
        """
        return self.max_upload_bytes + 1024 * 1024

    def startup_report(self) -> dict[str, object]:
        """What gets logged at boot: every setting that matters, no secrets."""
        return {
            "app_name": self.app_name,
            "app_version": self.app_version,
            "environment": self.environment,
            "debug": self.debug,
            "database": redact_url(self.database_url),
            "redis": redact_url(self.redis_url),
            "celery_enabled": self.celery_enabled,
            "cors_origins": self.cors_origins,
            "docs_enabled": self.docs_enabled,
            "rate_limit_enabled": self.rate_limit_enabled,
            "rate_limit_default": self.rate_limit_default,
            "log_level": self.log_level,
            "log_format": self.log_format,
            "ai_configured": bool(self.openrouter_api_key),
            "upload_dir": self.upload_dir,
            "max_upload_mb": self.max_upload_mb,
            "db_pool_size": self.db_pool_size,
            "db_max_overflow": self.db_max_overflow,
            "trust_proxy_headers": self.trust_proxy_headers,
        }


def redact_url(url: str) -> str:
    """``postgresql://user:pw@host/db`` → ``postgresql://user:***@host/db``.

    The host and database name are what an operator needs to see in a boot log;
    the password is what must never appear there.
    """
    if "://" not in url:
        return url
    scheme, _, rest = url.partition("://")
    if "@" not in rest:
        return url
    credentials, _, host = rest.rpartition("@")
    user, sep, _ = credentials.partition(":")
    return f"{scheme}://{user}{':***' if sep else ''}@{host}"


def validate_startup_config(settings_obj: Settings | None = None) -> list[str]:
    """Check the running configuration, returning non-fatal warnings.

    Anything that *must* stop the process has already raised out of the model
    validators by the time this runs. What is left is the advisory tier: a
    production deployment with no Celery worker still works, it is just slower
    than the operator probably intended.
    """
    current = settings_obj or get_settings()
    found: list[str] = []

    if not current.openrouter_api_key:
        found.append(
            "OPENROUTER_API_KEY is not set — invoice extraction falls back to "
            "heuristics and OCR, which is materially less accurate."
        )

    if current.is_production:
        if not current.rate_limit_enabled:
            found.append("RATE_LIMIT_ENABLED is false in a production environment.")
        if not current.trust_proxy_headers:
            found.append(
                "TRUST_PROXY_HEADERS is false — if this API sits behind a load balancer, "
                "every caller will share one rate-limit bucket."
            )
        if not current.hsts_enabled:
            found.append("HSTS_ENABLED is false in a production environment.")
        if current.log_format != "json":
            found.append(
                "LOG_FORMAT is 'console' in production; 'json' is what an aggregator parses."
            )
        if current.database_url.startswith("sqlite"):
            found.append(
                "DATABASE_URL points at SQLite in production — no concurrent writers, and "
                "none of the partial indexes this product relies on."
            )
        if current.docs_enabled:
            found.append("DOCS_ENABLED is true in production; the schema is public at /docs.")
    elif current.jwt_secret == _DEFAULT_JWT_SECRET:
        found.append(
            "JWT_SECRET is the sample value. Fine locally; a deployment with "
            "ENVIRONMENT=production will refuse to start with it."
        )

    return found


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (env is read once per process)."""
    return Settings()


settings = get_settings()
