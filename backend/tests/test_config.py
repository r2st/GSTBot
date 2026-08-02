"""Configuration: what refuses to boot, and what only warns.

The split is the point. A setting that would silently make the deployment
insecure raises out of ``Settings`` and the process never starts; a setting that
is merely questionable comes back from ``validate_startup_config`` as a warning
and is logged. Getting an item on the wrong side of that line is the bug these
tests exist to catch — a production deployment must not start with a sample JWT
secret, and it must not refuse to start because nobody set an OpenRouter key.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings, redact_url, validate_startup_config

PROD = {
    "environment": "production",
    "debug": False,
    "jwt_secret": "a-genuinely-long-random-production-secret-value-here",
    "backend_cors_origins": "https://app.example.com",
    "database_url": "postgresql+psycopg://u:p@db:5432/gstbot",
}


def prod(**overrides) -> dict:
    return {**PROD, **overrides}


class TestProductionRefusesToStart:
    """Every one of these would be a real incident if it booted."""

    def test_debug_true_in_production_is_fatal(self):
        # Debug mode renders the traceback into the HTTP response, ahead of the
        # error handler that exists to prevent exactly that.
        with pytest.raises(ValidationError, match="DEBUG must be false"):
            Settings(**prod(debug=True))

    def test_the_sample_jwt_secret_is_fatal(self):
        # Anyone with the repository could otherwise mint a token for any user.
        with pytest.raises(ValidationError):
            Settings(**prod(jwt_secret="change-me-to-a-long-random-string"))

    def test_a_short_jwt_secret_is_fatal(self):
        with pytest.raises(ValidationError):
            Settings(**prod(jwt_secret="short"))

    def test_a_wildcard_cors_origin_is_fatal(self):
        # With credentials allowed, "*" would let any site call the API using a
        # signed-in user's token.
        with pytest.raises(ValidationError, match="explicit origins"):
            Settings(**prod(backend_cors_origins="*"))

    def test_no_cors_origin_at_all_is_fatal(self):
        with pytest.raises(ValidationError, match="at least one origin"):
            Settings(**prod(backend_cors_origins=""))

    def test_a_valid_production_config_builds(self):
        # The negative tests above are only meaningful if this one passes.
        assert Settings(**prod()).is_production


class TestValidation:
    def test_a_non_database_url_is_refused(self):
        with pytest.raises(ValidationError, match="postgresql|sqlite"):
            Settings(**prod(database_url="mysql://u:p@db/gstbot"))

    def test_an_empty_database_url_is_refused(self):
        with pytest.raises(ValidationError):
            Settings(**prod(database_url=""))

    def test_a_non_redis_url_is_refused(self):
        with pytest.raises(ValidationError, match="redis"):
            Settings(**prod(redis_url="http://localhost:6379"))

    def test_a_malformed_rate_limit_is_refused_at_startup(self):
        # Better here than on the first request that would have been limited.
        with pytest.raises(ValidationError):
            Settings(**prod(rate_limit_default="30/fortnight"))

    def test_cors_origins_are_split_and_trimmed(self):
        settings = Settings(
            **prod(backend_cors_origins="https://a.example.com, https://b.example.com")
        )
        assert settings.cors_origins == ["https://a.example.com", "https://b.example.com"]


class TestStartupWarnings:
    """Questionable, not fatal — the deployment still comes up."""

    def test_a_missing_model_key_only_warns(self):
        # Extraction degrades to heuristics and OCR; that is a worse product,
        # not an insecure one, and refusing to boot would be wrong.
        warnings = validate_startup_config(Settings(**prod(openrouter_api_key="")))
        assert any("OPENROUTER_API_KEY" in w for w in warnings)

    def test_production_without_rate_limiting_warns(self):
        warnings = validate_startup_config(Settings(**prod(rate_limit_enabled=False)))
        assert any("RATE_LIMIT_ENABLED" in w for w in warnings)

    def test_production_with_public_docs_warns(self):
        warnings = validate_startup_config(Settings(**prod(docs_enabled=True)))
        assert any("DOCS_ENABLED" in w for w in warnings)

    def test_production_on_sqlite_warns(self):
        warnings = validate_startup_config(
            Settings(**prod(database_url="sqlite+pysqlite:///./gstbot.db"))
        )
        assert any("SQLite" in w for w in warnings)

    def test_production_with_console_logs_warns(self):
        warnings = validate_startup_config(Settings(**prod(log_format="console")))
        assert any("LOG_FORMAT" in w for w in warnings)

    def test_a_clean_production_config_warns_about_nothing_security_related(self):
        warnings = validate_startup_config(
            Settings(
                **prod(
                    openrouter_api_key="sk-test",
                    rate_limit_enabled=True,
                    trust_proxy_headers=True,
                    hsts_enabled=True,
                    log_format="json",
                    docs_enabled=False,
                )
            )
        )
        assert warnings == []

    def test_the_sample_secret_is_only_a_warning_in_development(self):
        # Fine locally; the production path above makes it fatal.
        warnings = validate_startup_config(
            Settings(environment="development", jwt_secret="change-me-to-a-long-random-string")
        )
        assert any("JWT_SECRET" in w for w in warnings)


class TestSecretsNeverLeak:
    def test_the_startup_report_redacts_the_database_password(self):
        report = Settings(
            **prod(database_url="postgresql+psycopg://user:hunter2@db:5432/gstbot")
        ).startup_report()
        assert "hunter2" not in str(report)

    def test_the_startup_report_does_not_contain_the_jwt_secret(self):
        secret = "a-genuinely-long-random-production-secret-value-here"
        assert secret not in str(Settings(**prod(jwt_secret=secret)).startup_report())

    def test_the_startup_report_does_not_contain_the_model_key(self):
        report = Settings(**prod(openrouter_api_key="sk-super-secret")).startup_report()
        assert "sk-super-secret" not in str(report)

    @pytest.mark.parametrize(
        "url",
        [
            "postgresql+psycopg://user:hunter2@db:5432/gstbot",
            "redis://:hunter2@cache:6379/0",
            "rediss://user:hunter2@cache:6379/0",
        ],
    )
    def test_redact_url_removes_the_password_but_keeps_the_host(self, url):
        redacted = redact_url(url)
        assert "hunter2" not in redacted
        # Still has to be useful — "which database am I pointed at" is the
        # question the startup line exists to answer.
        assert "db:5432" in redacted or "cache:6379" in redacted

    def test_redact_url_leaves_a_passwordless_url_alone(self):
        url = "postgresql+psycopg://db:5432/gstbot"
        assert redact_url(url) == url

    def test_redact_url_survives_junk(self):
        # It runs inside the startup logger; raising there loses the line that
        # would have explained the misconfiguration.
        assert redact_url("not a url at all")
