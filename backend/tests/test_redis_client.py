"""Redis is a soft dependency, so every path here is a degradation path.

Nothing in this module may raise. Rate limiting and the Celery broker sit on
top of it, and the product's claim is that an invoice still uploads and parses
with Redis dead — which is only true if `get_redis` returns ``None`` quietly
instead of propagating a ConnectionError into a request.

The suite's own Redis URL points at a Unix socket that cannot exist, so the
unreachable case is real here rather than mocked. The reachable case is the one
that needs a double, since a passing test must not depend on a developer
happening to have Redis running.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import pytest

from app.core import redis_client
from app.core.redis_client import get_redis, ping, reset


@pytest.fixture(autouse=True)
def _reset_module_state():
    """The client and the "unavailable" memo are process-wide globals."""
    reset()
    yield
    reset()


class _FakeClient:
    def __init__(self, *, ping_result: object = True, ping_error: Exception | None = None):
        self._ping_result = ping_result
        self._ping_error = ping_error
        self.closed = False
        self.pings = 0

    def ping(self):
        self.pings += 1
        if self._ping_error is not None:
            raise self._ping_error
        return self._ping_result

    def close(self):
        self.closed = True


def _install_fake_redis(monkeypatch, client, *, from_url_error=None):
    """Stand in for the ``redis`` package, which is imported inside get_redis."""
    calls: list[dict] = []

    def from_url(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if from_url_error is not None:
            raise from_url_error
        return client

    module = type(sys)("redis")
    module.Redis = type("Redis", (), {"from_url": staticmethod(from_url)})
    monkeypatch.setitem(sys.modules, "redis", module)
    return calls


class TestReachableRedis:
    def test_a_server_that_answers_gives_back_a_client(self, monkeypatch):
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        assert get_redis() is client

    def test_the_connection_is_proven_not_assumed(self, monkeypatch):
        # from_url is lazy — it does not connect. Without the ping, a dead
        # server would be discovered by the first rate-limit check instead.
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        get_redis()
        assert client.pings == 1

    def test_the_client_is_created_once_and_shared(self, monkeypatch):
        client = _FakeClient()
        calls = _install_fake_redis(monkeypatch, client)
        assert get_redis() is get_redis() is client
        assert len(calls) == 1, "reconnected on a cached client"

    def test_timeouts_are_configured_from_settings(self, monkeypatch):
        # An unbounded socket timeout is the failure that matters: a limiter
        # blocking on a hung server is worse than no limiter at all.
        calls = _install_fake_redis(monkeypatch, _FakeClient())
        get_redis()
        assert calls[0]["socket_connect_timeout"] == redis_client.settings.redis_timeout_seconds
        assert calls[0]["socket_timeout"] == redis_client.settings.redis_timeout_seconds

    def test_responses_are_decoded_so_callers_get_str_not_bytes(self, monkeypatch):
        calls = _install_fake_redis(monkeypatch, _FakeClient())
        get_redis()
        assert calls[0]["decode_responses"] is True

    def test_it_connects_to_the_configured_url(self, monkeypatch):
        calls = _install_fake_redis(monkeypatch, _FakeClient())
        get_redis()
        assert calls[0]["url"] == redis_client.settings.redis_url


class TestUnreachableRedis:
    def test_the_suites_own_configuration_degrades_to_none(self):
        # Not a double: conftest points REDIS_URL at a socket that cannot exist.
        assert get_redis() is None

    def test_the_suite_cannot_be_pointed_at_a_server_by_accident(self):
        """The isolation above has to be a guarantee, not a coincidence.

        It used to be a TCP port picked for being free, which held right up
        until something was started on it — then this file failed while the
        code it covers was fine. A path under a directory that does not exist
        cannot be bound by a stray container or a developer's local Redis.
        """
        assert redis_client.settings.redis_url.startswith("unix://")

        path = redis_client.settings.redis_url.removeprefix("unix://").split("?")[0]
        assert not Path(path).exists()
        assert not Path(path).parent.exists(), (
            "the socket's directory exists, so something could bind the path"
        )

    def test_a_failure_to_connect_is_remembered(self, monkeypatch):
        calls = _install_fake_redis(
            monkeypatch, _FakeClient(), from_url_error=OSError("no route to host")
        )
        assert get_redis() is None
        assert get_redis() is None
        assert len(calls) == 1, "retried a server already known to be down"

    def test_a_server_that_refuses_the_ping_is_treated_as_down(self, monkeypatch):
        # from_url succeeding proves nothing; this is the realistic failure.
        client = _FakeClient(ping_error=ConnectionError("connection refused"))
        _install_fake_redis(monkeypatch, client)
        assert get_redis() is None

    def test_a_missing_redis_package_is_a_degradation_not_a_crash(self, monkeypatch):
        # The import is inside the function precisely so this is survivable.
        monkeypatch.setitem(sys.modules, "redis", None)
        assert get_redis() is None

    def test_the_outage_is_logged_once_as_a_warning(self, monkeypatch, caplog):
        # Warning, not error: this is a supported degraded mode, and paging on
        # it would train an operator to ignore the channel.
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("down"))
        with caplog.at_level(logging.WARNING, logger="app.core.redis_client"):
            get_redis()
            get_redis()
        assert len(caplog.records) == 1
        assert caplog.records[0].levelno == logging.WARNING


class TestThePingUsedByHealth:
    def test_it_is_false_when_there_is_no_client(self):
        assert ping() is False

    def test_it_is_true_when_the_server_answers(self, monkeypatch):
        _install_fake_redis(monkeypatch, _FakeClient(ping_result=True))
        assert ping() is True

    def test_a_falsey_pong_is_reported_as_down(self, monkeypatch):
        _install_fake_redis(monkeypatch, _FakeClient(ping_result=False))
        assert ping() is False

    def test_a_server_that_dies_after_connecting_is_reported_not_raised(self, monkeypatch):
        # The client is cached from a successful connect, then the server goes
        # away. Health must report it rather than 500 on the probe.
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        assert get_redis() is client

        client._ping_error = TimeoutError("timed out")
        assert ping() is False

    def test_the_result_is_a_bool_for_the_health_payload(self, monkeypatch):
        _install_fake_redis(monkeypatch, _FakeClient(ping_result=1))
        assert ping() is True


class TestTheCircuitBreaker:
    """An outage has to be both cheap and survivable.

    Cheap: at most one connection attempt per cooldown, however many callers
    ask — the global rate limit is in front of every request, so a per-request
    connect attempt against a blackholed host is a 2s tax on the whole API.

    Survivable: the cooldown expires. The earlier memo never did, so a process
    that started during a Redis restart rate-limited per-process and reported
    `degraded` until somebody noticed and restarted it.
    """

    @pytest.fixture()
    def clock(self, monkeypatch):
        """Move time forward without sleeping through the cooldown."""
        current = {"t": 1000.0}
        monkeypatch.setattr(redis_client, "_now", lambda: current["t"])

        def advance(seconds: float) -> None:
            current["t"] += seconds

        return advance

    def test_an_outage_is_not_believed_forever(self, monkeypatch, clock):
        calls = _install_fake_redis(
            monkeypatch, _FakeClient(), from_url_error=OSError("connection refused")
        )
        assert get_redis() is None

        # Redis comes back. Nothing calls reset() in production, so if the
        # deadline did not expire this process would never find out.
        client = _FakeClient()
        calls = _install_fake_redis(monkeypatch, client)
        clock(redis_client.settings.redis_retry_interval_seconds + 1)

        assert get_redis() is client
        assert len(calls) == 1, "did not retry after the cooldown expired"

    def test_nothing_is_attempted_before_the_cooldown_expires(self, monkeypatch, clock):
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("down"))
        assert get_redis() is None

        client = _FakeClient()
        calls = _install_fake_redis(monkeypatch, client)
        # One second short of the deadline: a server that just came back is
        # still not worth a connect attempt, because the common case is that it
        # has not.
        clock(redis_client.settings.redis_retry_interval_seconds - 1)

        assert get_redis() is None
        assert calls == [], "connected during the cooldown"

    def test_the_deadline_is_monotonic_not_wall_clock(self):
        # A breaker measured against time.time() is one an NTP step can strand
        # open for hours — and the machines most likely to step their clock are
        # the ones that just booted, which is also when Redis is most likely to
        # be starting.
        import inspect

        source = inspect.getsource(redis_client._now)
        assert "monotonic" in source
        assert "time.time" not in source

    def test_a_live_client_that_fails_trips_the_breaker(self, monkeypatch, clock):
        # The failure get_redis() cannot see. Without this the dead client stays
        # cached and every caller pays a socket timeout to rediscover it.
        client = _FakeClient()
        calls = _install_fake_redis(monkeypatch, client)
        assert get_redis() is client

        redis_client.mark_unavailable("ConnectionError: reset by peer")

        assert get_redis() is None
        assert len(calls) == 1, "reconnected to a server just reported dead"

    def test_a_tripped_breaker_recovers_on_the_same_deadline(self, monkeypatch, clock):
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        get_redis()
        redis_client.mark_unavailable("gone")

        fresh = _FakeClient()
        _install_fake_redis(monkeypatch, fresh)
        clock(redis_client.settings.redis_retry_interval_seconds + 1)

        assert get_redis() is fresh

    def test_ping_trips_the_breaker_when_the_server_died(self, monkeypatch, clock):
        # Health polls every few seconds, so it is usually the first caller to
        # touch a server that went away — which makes it the cheapest place to
        # discover it, as long as it reports what it found.
        client = _FakeClient()
        calls = _install_fake_redis(monkeypatch, client)
        assert get_redis() is client

        client._ping_error = TimeoutError("timed out")
        assert ping() is False

        assert get_redis() is None
        assert len(calls) == 1, "health noticed the outage and told nobody"

    def test_an_ongoing_outage_is_logged_once_not_once_per_cooldown(
        self, monkeypatch, clock, caplog
    ):
        # An hour of downtime at a 30s cooldown is 120 identical warnings, which
        # is how a channel becomes one nobody reads. Health reports the ongoing
        # state; the log reports the transitions.
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("down"))
        with caplog.at_level(logging.WARNING, logger="app.core.redis_client"):
            for _ in range(5):
                get_redis()
                clock(redis_client.settings.redis_retry_interval_seconds + 1)

        assert len(caplog.records) == 1

    def test_recovery_is_logged(self, monkeypatch, clock, caplog):
        # Otherwise the log says Redis went away and never says it came back,
        # and whoever reads it later cannot tell a resolved blip from an
        # outage that is still going.
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("down"))
        get_redis()

        _install_fake_redis(monkeypatch, _FakeClient())
        clock(redis_client.settings.redis_retry_interval_seconds + 1)
        with caplog.at_level(logging.INFO, logger="app.core.redis_client"):
            get_redis()

        assert any("again" in record.message for record in caplog.records)

    def test_a_later_outage_warns_again(self, monkeypatch, clock, caplog):
        # The "once per outage" rule must not become "once per process": a
        # second, unrelated outage a week later is news.
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("first"))
        get_redis()

        _install_fake_redis(monkeypatch, _FakeClient())
        clock(redis_client.settings.redis_retry_interval_seconds + 1)
        get_redis()

        # Only what the second outage logs — caplog accumulates from the top of
        # the test, and the first outage's warning is already in it.
        caplog.clear()
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("second"))
        with caplog.at_level(logging.WARNING, logger="app.core.redis_client"):
            redis_client.mark_unavailable("second")

        assert len(caplog.records) == 1
        assert "second" in caplog.records[0].getMessage()


class TestClose:
    """Shutdown drops the pool; it does not re-open the breaker."""

    def test_it_closes_the_client(self, monkeypatch):
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        get_redis()

        redis_client.close()
        assert client.closed is True

    def test_it_is_safe_with_no_client(self):
        redis_client.close()  # must not raise

    def test_a_client_that_raises_on_close_is_survived(self, monkeypatch):
        client = _FakeClient()
        client.close = lambda: (_ for _ in ()).throw(OSError("already closed"))
        _install_fake_redis(monkeypatch, client)
        get_redis()

        redis_client.close()  # must not raise


class TestReset:
    def test_it_closes_the_client_it_drops(self, monkeypatch):
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        get_redis()

        reset()
        assert client.closed is True

    def test_a_client_that_raises_on_close_does_not_break_reset(self, monkeypatch):
        # An already-dead connection raises here; that is not a failure.
        client = _FakeClient()
        client.close = lambda: (_ for _ in ()).throw(OSError("already closed"))
        _install_fake_redis(monkeypatch, client)
        get_redis()

        reset()
        assert get_redis() is not None

    def test_it_clears_the_unavailable_memo_so_recovery_is_possible(self, monkeypatch):
        _install_fake_redis(monkeypatch, _FakeClient(), from_url_error=OSError("down"))
        assert get_redis() is None

        # Redis comes back; without clearing the memo the process would never
        # notice until it restarted.
        client = _FakeClient()
        _install_fake_redis(monkeypatch, client)
        reset()
        assert get_redis() is client
