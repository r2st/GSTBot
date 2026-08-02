"""Rate limiting: the spec parser, the key derivation, and the enforcement.

The key derivation is the part worth most of these tests. Getting it wrong is
not a performance bug — keying on the connection address means a whole office
behind one NAT shares a login budget, and trusting X-Forwarded-For without a
proxy in front means the limit can be bypassed by sending a header.
"""
from __future__ import annotations

import pytest

from app.core.ratespec import Rate, parse_rate


class TestParseRate:
    @pytest.mark.parametrize(
        "spec,limit,window",
        [
            ("30/minute", 30, 60),
            ("30/min", 30, 60),
            ("30/m", 30, 60),
            ("1000/hour", 1000, 3600),
            ("5/second", 5, 1),
            ("100/day", 100, 86400),
            ("5/10s", 5, 10),
            ("60/90m", 60, 5400),
            ("  30 / minute  ", 30, 60),
            ("30/MINUTE", 30, 60),
        ],
    )
    def test_accepted_forms(self, spec, limit, window):
        rate = parse_rate(spec)
        assert (rate.limit, rate.window) == (limit, window)

    def test_a_bare_count_defaults_to_a_minute(self):
        assert parse_rate("30") == Rate(30, 60)

    @pytest.mark.parametrize(
        "spec",
        ["", "abc/minute", "30/fortnight", "-5/minute", "0/minute", "30/0s", "/minute"],
    )
    def test_rejected_forms_name_the_offending_spec(self, spec):
        # Both callers are reporting to an operator who has to find the entry.
        with pytest.raises(ValueError, match="Invalid rate|unknown period"):
            parse_rate(spec)

    def test_a_zero_limit_is_refused_rather_than_locking_everyone_out(self):
        with pytest.raises(ValueError):
            parse_rate("0/minute")

    @pytest.mark.parametrize(
        "window,label",
        [(60, "5/minute"), (3600, "5/hour"), (86400, "5/day"), (10, "5/10s")],
    )
    def test_the_label_is_what_the_caller_is_told(self, window, label):
        assert Rate(5, window).label == label


class TestIdentity:
    """Who a request is charged to."""

    def _request(self, headers=None, client_host="10.0.0.1"):
        from starlette.datastructures import Headers
        from starlette.requests import Request

        raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": raw,
            "client": (client_host, 12345),
            "query_string": b"",
        }
        request = Request(scope)
        assert isinstance(request.headers, Headers)
        return request

    def test_an_anonymous_caller_is_keyed_by_address(self):
        from app.core.rate_limit import identity

        assert identity(self._request()) == "ip:10.0.0.1"

    def test_an_authenticated_caller_is_keyed_by_user(self, auth_client):
        # The whole point: an office behind one NAT must not share a budget.
        from app.core.rate_limit import identity

        token = auth_client.headers["Authorization"].split()[1]
        who = identity(self._request({"authorization": f"Bearer {token}"}))
        assert who.startswith("user:")

    def test_two_users_from_one_address_are_separate_buckets(self, auth_client, other_tenant):
        from app.core.rate_limit import identity

        mine = auth_client.headers["Authorization"].split()[1]
        theirs = other_tenant
        assert identity(self._request({"authorization": f"Bearer {mine}"})) != identity(
            self._request({"authorization": f"Bearer {theirs}"})
        )

    def test_a_forged_token_falls_back_to_the_address(self):
        # A signature check is all that stands between "attribute this" and
        # "let the caller pick their own bucket".
        from app.core.rate_limit import identity

        who = identity(self._request({"authorization": "Bearer not.a.token"}))
        assert who == "ip:10.0.0.1"

    def test_a_malformed_authorization_header_does_not_raise(self):
        from app.core.rate_limit import identity

        assert identity(self._request({"authorization": "Basic abc"})) == "ip:10.0.0.1"


class TestClientIp:
    def _request(self, headers=None, client_host="10.0.0.1"):
        from starlette.requests import Request

        raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
        return Request(
            {
                "type": "http", "method": "GET", "path": "/",
                "headers": raw, "client": (client_host, 1), "query_string": b"",
            }
        )

    def test_forwarded_headers_are_ignored_by_default(self, monkeypatch):
        # Without a proxy in front, X-Forwarded-For is just a header the caller
        # chose — honouring it means a fresh bucket per request.
        from app.core import rate_limit
        from app.core.config import settings

        monkeypatch.setattr(settings, "trust_proxy_headers", False)
        request = self._request({"x-forwarded-for": "1.2.3.4"})
        assert rate_limit.client_ip(request) == "10.0.0.1"

    def test_forwarded_headers_are_honoured_when_a_proxy_is_declared(self, monkeypatch):
        from app.core import rate_limit
        from app.core.config import settings

        monkeypatch.setattr(settings, "trust_proxy_headers", True)
        request = self._request({"x-forwarded-for": "1.2.3.4, 10.0.0.9"})
        # Left-most is the original client; the rest are hops.
        assert rate_limit.client_ip(request) == "1.2.3.4"

    def test_x_real_ip_is_the_fallback(self, monkeypatch):
        from app.core import rate_limit
        from app.core.config import settings

        monkeypatch.setattr(settings, "trust_proxy_headers", True)
        assert rate_limit.client_ip(self._request({"x-real-ip": "5.6.7.8"})) == "5.6.7.8"

    def test_an_overlong_forwarded_value_is_bounded(self, monkeypatch):
        # It becomes a Redis key; an unbounded one is a memory-exhaustion lever.
        from app.core import rate_limit
        from app.core.config import settings

        monkeypatch.setattr(settings, "trust_proxy_headers", True)
        value = rate_limit.client_ip(self._request({"x-forwarded-for": "9" * 500}))
        assert len(value) == 64

    def test_a_request_with_no_client_does_not_raise(self, monkeypatch):
        from starlette.requests import Request

        from app.core import rate_limit

        request = Request(
            {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""}
        )
        assert rate_limit.client_ip(request) == "unknown"


class TestEnforcement:
    def test_the_limit_is_off_by_default_in_the_suite(self, client):
        # Otherwise the twentieth test fails rather than the code under it.
        for _ in range(30):
            assert client.post(
                "/api/v1/auth/login",
                data={"username": "nobody@example.com", "password": "wrong-password"},
            ).status_code != 429

    def test_repeated_logins_are_eventually_refused(self, client, rate_limited):
        # 20/minute, keyed by address for an anonymous caller.
        statuses = [
            client.post(
                "/api/v1/auth/login",
                data={"username": "nobody@example.com", "password": "wrong-password"},
            ).status_code
            for _ in range(25)
        ]
        assert 429 in statuses

    def test_a_429_tells_the_caller_when_to_come_back(self, client, rate_limited):
        response = None
        for _ in range(25):
            response = client.post(
                "/api/v1/auth/login",
                data={"username": "nobody@example.com", "password": "wrong-password"},
            )
            if response.status_code == 429:
                break
        assert response.status_code == 429
        assert int(response.headers["Retry-After"]) > 0
        assert response.headers["X-RateLimit-Remaining"] == "0"
        assert response.json()["error"]["code"] == "rate_limited"

    def test_separate_endpoints_have_separate_budgets(self, client, rate_limited):
        # A caller who has exhausted their login attempts must still be able to
        # look up a GSTIN; one shared pool would make any limit a global one.
        for _ in range(25):
            client.post(
                "/api/v1/auth/login",
                data={"username": "nobody@example.com", "password": "wrong"},
            )
        assert client.get("/api/v1/meta/gstin/27AAPFU0939F1ZV").status_code != 429

    def test_the_counters_are_forgotten_between_tests(self, client, rate_limited):
        # Guards the fixture itself: a leaked bucket makes an unrelated test
        # fail with a 429 and sends someone hunting in the wrong module.
        assert client.get("/api/v1/meta/gstin/27AAPFU0939F1ZV").status_code == 200


class TestMemoryFallback:
    """With Redis down the limiter degrades rather than failing the request."""

    def test_a_dead_redis_does_not_break_a_request(self, client):
        # The suite points REDIS_URL at a closed port, so this is the path that
        # runs for every other test in the file too.
        assert client.get("/api/v1/health").status_code == 200

    def test_the_fallback_still_counts(self):
        from app.core import rate_limit
        from app.core.ratespec import Rate

        rate_limit.reset()
        rate = Rate(3, 60)
        decisions = [rate_limit._hit("test:key", rate) for _ in range(5)]
        assert [d.allowed for d in decisions] == [True, True, True, False, False]
        assert decisions[0].remaining == 2
        assert decisions[-1].remaining == 0
        rate_limit.reset()

    def test_distinct_keys_do_not_share_a_counter(self):
        from app.core import rate_limit
        from app.core.ratespec import Rate

        rate_limit.reset()
        rate = Rate(1, 60)
        assert rate_limit._hit("a", rate).allowed
        assert rate_limit._hit("b", rate).allowed
        assert not rate_limit._hit("a", rate).allowed
        rate_limit.reset()

    def test_the_key_map_is_bounded(self):
        # A flood of distinct keys must not be a memory leak in a long-lived
        # worker; rolled-over windows are evicted oldest-first.
        from app.core.rate_limit import _MAX_MEMORY_KEYS, _MemoryWindows

        windows = _MemoryWindows()
        for i in range(_MAX_MEMORY_KEYS + 2000):
            windows.hit(f"key-{i}")
        assert len(windows._counts) <= _MAX_MEMORY_KEYS + 1


class TestRedisBackedCounters:
    """The path that actually runs in production.

    Everything above this runs on the in-process fallback, because the suite
    points REDIS_URL at a closed port. That fallback is per-process: two API
    instances behind a load balancer would each allow the full budget, which
    is the whole reason the Redis path exists. It needs its own cover.
    """

    class FakeRedis:
        """Enough of redis-py for the limiter: a pipeline that counts."""

        def __init__(self, *, fail: bool = False) -> None:
            self.counts: dict[str, int] = {}
            self.expiries: dict[str, int] = {}
            self.deleted: list[str] = []
            self.fail = fail

        def pipeline(self):
            if self.fail:
                raise ConnectionError("Connection refused")
            return self._Pipeline(self)

        class _Pipeline:
            def __init__(self, store) -> None:
                self.store = store
                self.queued: list[tuple[str, str, int]] = []

            def incr(self, key, amount=1):
                self.queued.append(("incr", key, amount))

            def expire(self, key, seconds):
                self.queued.append(("expire", key, seconds))

            def execute(self):
                results = []
                for op, key, value in self.queued:
                    if op == "incr":
                        self.store.counts[key] = self.store.counts.get(key, 0) + value
                        results.append(self.store.counts[key])
                    else:
                        self.store.expiries[key] = value
                        results.append(True)
                return results

        def scan_iter(self, match, count=None):
            prefix = match.rstrip("*")
            return [k for k in list(self.counts) if k.startswith(prefix)]

        def delete(self, *keys):
            self.deleted.extend(keys)
            for key in keys:
                self.counts.pop(key, None)

    @pytest.fixture()
    def fake_redis(self, monkeypatch):
        from app.core import rate_limit, redis_client

        rate_limit.reset()
        store = self.FakeRedis()
        monkeypatch.setattr(redis_client, "get_redis", lambda: store)
        yield store
        monkeypatch.undo()
        rate_limit.reset()

    def test_the_counting_happens_in_redis(self, fake_redis):
        from app.core import rate_limit

        for _ in range(3):
            rate_limit._hit("uploads:user:1", Rate(10, 60))

        (bucket,) = fake_redis.counts
        assert bucket.startswith("ratelimit:uploads:user:1:")
        assert fake_redis.counts[bucket] == 3

    def test_the_budget_is_shared_rather_than_per_process(self, fake_redis):
        """Two instances, one counter — otherwise a 30/minute limit is really
        30 per pod and the number in the docs is fiction."""
        from app.core import rate_limit

        rate = Rate(3, 60)
        decisions = [rate_limit._hit("shared:key", rate) for _ in range(5)]

        assert [d.allowed for d in decisions] == [True, True, True, False, False]
        assert decisions[-1].remaining == 0

    def test_the_bucket_is_given_an_expiry(self, fake_redis):
        """Without a TTL every window ever opened stays in Redis for good."""
        from app.core import rate_limit

        rate_limit._hit("uploads:user:1", Rate(10, 60))

        (bucket,) = fake_redis.expiries
        # One second past the window, so a bucket cannot expire while the
        # window it belongs to is still open.
        assert fake_redis.expiries[bucket] == 61

    def test_each_window_gets_its_own_bucket(self, fake_redis, monkeypatch):
        from app.core import rate_limit

        monkeypatch.setattr(rate_limit.time, "time", lambda: 1_000_000.0)
        rate_limit._hit("uploads:user:1", Rate(10, 60))
        monkeypatch.setattr(rate_limit.time, "time", lambda: 1_000_060.0)
        rate_limit._hit("uploads:user:1", Rate(10, 60))

        assert len(fake_redis.counts) == 2
        assert set(fake_redis.counts.values()) == {1}

    def test_a_redis_that_fails_mid_flight_degrades_instead_of_502ing(
        self, monkeypatch, caplog
    ):
        """Redis going down must cost the limit's accuracy, not the request.

        Failing closed here would mean a Redis outage takes the whole API with
        it, which is a worse outcome than briefly counting per-process.
        """
        import logging

        from app.core import rate_limit, redis_client

        rate_limit.reset()
        monkeypatch.setattr(redis_client, "get_redis", lambda: self.FakeRedis(fail=True))

        with caplog.at_level(logging.WARNING):
            decision = rate_limit._hit("uploads:user:1", Rate(2, 60))

        assert decision.allowed
        assert "degraded" in caplog.text.lower()
        # And it kept counting, in memory, rather than silently allowing all.
        assert not [rate_limit._hit("uploads:user:1", Rate(2, 60)) for _ in range(3)][-1].allowed
        rate_limit.reset()

    def test_reset_clears_the_redis_keys_too(self, fake_redis):
        """Otherwise one test's counters leak into the next one's budget."""
        from app.core import rate_limit

        rate_limit._hit("uploads:user:1", Rate(10, 60))
        assert fake_redis.counts

        rate_limit.reset()

        assert fake_redis.deleted
        assert not fake_redis.counts

    def test_reset_survives_a_redis_that_is_down(self, monkeypatch):
        """It is called from fixtures; raising here would fail unrelated tests
        for a reason that has nothing to do with them."""
        from app.core import rate_limit, redis_client

        class Broken:
            def scan_iter(self, *_args, **_kwargs):
                raise ConnectionError("Connection refused")

        monkeypatch.setattr(redis_client, "get_redis", lambda: Broken())

        rate_limit.reset()  # Must not raise.
