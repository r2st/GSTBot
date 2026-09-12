"""The boot checks in the lifespan handler.

Anything genuinely fatal has already raised out of Settings by the time these
run, so what is left is the reporting tier — and its whole purpose is to make a
misconfigured deployment say so in its first ten log lines rather than on a
user's first upload. That only works if the checks actually fire, which is what
these assert.

They are written against the lifespan function directly rather than through a
TestClient, because a client that boots the real app cannot be given a
read-only upload directory or a database that refuses to connect.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import pytest

from app import main
from app.core.storage import writable
from app.main import app

# Root ignores the permission bits, so a 0o500 directory is still writable and
# the two read-only cases would assert the opposite of what they mean. Skipped
# rather than silently inverted.
not_root = pytest.mark.skipif(
    hasattr(os, "geteuid") and os.geteuid() == 0,
    reason="root bypasses directory permissions",
)


@pytest.fixture()
def boot(monkeypatch, tmp_path):
    """Run the lifespan with each dependency dialled independently."""

    # The first thing the real lifespan does is reconfigure logging, which
    # clears every root handler — caplog's included, so nothing after it would
    # be captured. What is under test here is the checks, not the log setup
    # (that has its own tests in test_logging.py), so it is stubbed out.
    monkeypatch.setattr(main, "configure_logging", lambda *_args, **_kwargs: None)

    async def run(*, upload_dir=None, database=True, redis=True):
        result = (True, None) if database else (False, "OperationalError")
        monkeypatch.setattr(
            main.settings, "upload_dir", str(upload_dir or tmp_path / "uploads")
        )
        monkeypatch.setattr(main, "check_database", lambda: result)
        monkeypatch.setattr(main, "redis_ping", lambda: redis)
        async with main.lifespan(app):
            pass

    return run


class TestWritableProbe:
    def test_a_normal_directory_iswritable(self, tmp_path):
        assert writable(tmp_path)

    def test_it_leaves_nothing_behind(self, tmp_path):
        """The probe file must not show up in a listing of the upload dir."""
        writable(tmp_path)

        assert list(tmp_path.iterdir()) == []

    @not_root
    def test_a_read_only_directory_is_not(self, tmp_path):
        locked = tmp_path / "locked"
        locked.mkdir(mode=0o500)
        try:
            assert not writable(locked)
        finally:
            locked.chmod(0o700)

    def test_a_directory_that_is_not_there_is_notwritable(self, tmp_path):
        assert not writable(tmp_path / "absent")


@pytest.mark.asyncio
class TestLifespan:
    async def test_it_creates_the_upload_directory(self, boot, tmp_path):
        """Created at startup rather than on first upload, so a bad path fails
        at deploy time instead of on a user's file."""
        target = tmp_path / "nested" / "uploads"

        await boot(upload_dir=target)

        assert target.is_dir()

    @not_root
    async def test_a_read_only_upload_volume_is_reported(self, boot, tmp_path, caplog):
        locked = tmp_path / "locked"
        locked.mkdir(mode=0o500)
        try:
            with caplog.at_level(logging.ERROR):
                await boot(upload_dir=locked)
        finally:
            locked.chmod(0o700)

        assert "not writable" in caplog.text
        # Named, so the operator knows which volume to fix.
        assert str(locked) in caplog.text

    async def test_an_uncreatable_upload_path_is_reported_not_raised(
        self, boot, tmp_path, caplog
    ):
        """A path whose parent is a *file* cannot be made into a directory.

        Crashing here would take down an instance that can still serve every
        read in the product; the error log plus a failing upload is the more
        useful outcome.
        """
        blocker = tmp_path / "not-a-dir"
        blocker.write_text("")

        with caplog.at_level(logging.ERROR):
            await boot(upload_dir=blocker / "uploads")

        assert "could not be created" in caplog.text

    async def test_a_database_that_is_still_coming_up_is_not_fatal(self, boot, caplog):
        """Normal in a compose or Kubernetes start. The readiness probe is what
        holds traffic back until it answers, so booting is the right call."""
        with caplog.at_level(logging.ERROR):
            await boot(database=False)

        assert "Database unreachable at startup" in caplog.text
        assert "OperationalError" in caplog.text

    async def test_a_reachable_database_is_confirmed(self, boot, caplog):
        with caplog.at_level(logging.INFO):
            await boot(database=True)

        assert "Database reachable" in caplog.text

    async def test_a_reachable_redis_is_confirmed(self, boot, caplog):
        with caplog.at_level(logging.INFO):
            await boot(redis=True)

        assert "Redis reachable" in caplog.text

    async def test_a_dead_redis_names_what_is_lost(self, boot, caplog, monkeypatch):
        """"Redis is down" is not actionable on its own; which feature degrades
        is the part the person reading at 3am needs."""
        monkeypatch.setattr(main.settings, "celery_enabled", False)

        with caplog.at_level(logging.WARNING):
            await boot(redis=False)

        assert "per-process counters" in caplog.text
        # Celery is off, so queued parsing is not among the casualties.
        assert "queued parsing is unavailable" not in caplog.text

    async def test_a_dead_redis_also_names_queued_parsing_when_celery_is_on(
        self, boot, caplog, monkeypatch
    ):
        monkeypatch.setattr(main.settings, "celery_enabled", True)

        with caplog.at_level(logging.WARNING):
            await boot(redis=False)

        assert "queued parsing is unavailable" in caplog.text

    async def test_configuration_warnings_are_surfaced(self, boot, caplog):
        """The suite runs with no model key, which is exactly one of them."""
        with caplog.at_level(logging.WARNING):
            await boot()

        assert "Configuration warning" in caplog.text

    async def test_the_resolved_configuration_is_logged_without_secrets(self, boot, caplog):
        with caplog.at_level(logging.INFO):
            await boot()

        startup = next(r for r in caplog.records if r.getMessage().startswith("Starting"))
        report = main.settings.startup_report()
        assert report["environment"] == main.settings.environment
        # Whatever the report carries, the signing key is never in it.
        assert main.settings.jwt_secret not in str(getattr(startup, "__dict__", {}))

    async def test_shutdown_is_logged(self, boot, caplog):
        """Otherwise a container that was killed and one that exited cleanly
        look identical in the logs."""
        with caplog.at_level(logging.INFO):
            await boot()

        assert "Shutting down" in caplog.text


@pytest.mark.asyncio
class TestShutdownReleasesItsDependencies:
    """SIGTERM, then ``TimeoutStopSec``, then SIGKILL.

    uvicorn drains in-flight requests before lifespan teardown runs, so by the
    time these fire the pools are idle and every connection still open is one
    the *server* has to reap on its own schedule. That matters on a rolling
    restart, where the outgoing process's connections and the incoming one's are
    both counted against ``max_connections`` until Postgres notices — and the
    deploy that trips that limit is the one where the new process cannot start.
    """

    @pytest.fixture()
    def shutdown(self, monkeypatch, tmp_path):
        """Run a lifespan to completion with the two releases observable."""
        monkeypatch.setattr(main, "configure_logging", lambda *_a, **_kw: None)
        monkeypatch.setattr(main.settings, "upload_dir", str(tmp_path / "uploads"))
        monkeypatch.setattr(main, "check_database", lambda: (True, None))
        monkeypatch.setattr(main, "redis_ping", lambda: True)

        called: list[str] = []

        async def run(*, redis_error=None, dispose_error=None):
            def close_redis():
                called.append("redis")
                if redis_error is not None:
                    raise redis_error

            def dispose():
                called.append("engine")
                if dispose_error is not None:
                    raise dispose_error

            monkeypatch.setattr(main, "redis_close", close_redis)
            monkeypatch.setattr(main.engine, "dispose", dispose)
            async with main.lifespan(app):
                assert called == [], "released a pool while still serving"
            return called

        return run

    async def test_the_database_pool_is_disposed(self, shutdown):
        assert "engine" in await shutdown()

    async def test_the_redis_client_is_closed(self, shutdown):
        assert "redis" in await shutdown()

    @pytest.mark.parametrize(
        ("kwargs", "expected"),
        [
            ({"redis_error": OSError("broken pipe")}, "Redis client did not close"),
            ({"dispose_error": OSError("already closed")}, "Database pool did not dispose"),
        ],
    )
    async def test_a_failure_to_release_is_logged_not_raised(
        self, shutdown, caplog, kwargs, expected
    ):
        """An exception out of lifespan teardown is a non-zero exit, which
        systemd records as a failed unit — so an ordinary deploy would page
        someone, and the thing that "failed" was the shutdown of a process that
        was already on its way out."""
        with caplog.at_level(logging.WARNING):
            await shutdown(**kwargs)

        assert expected in caplog.text

    async def test_one_failing_release_does_not_skip_the_other(self, shutdown):
        # They are independent, and the engine is the one that matters more —
        # so it must not be reachable only through a clean Redis close.
        assert "engine" in await shutdown(redis_error=OSError("broken pipe"))

    async def test_shutdown_reports_that_it_finished(self, shutdown, caplog):
        # "Shutting down" is written before the releases, so on its own it
        # cannot distinguish a clean stop from one that hung releasing a pool.
        with caplog.at_level(logging.INFO):
            await shutdown()

        assert "Shutdown complete" in caplog.text


def test_the_upload_dir_setting_is_a_path_the_app_can_use():
    """Guards against the setting drifting to a type Path() cannot take."""
    assert Path(main.settings.upload_dir).name
