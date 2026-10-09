"""Tests for the CA referral program endpoints."""
from __future__ import annotations

from tests.conftest import TEST_EMAIL


class TestReferralTrack:
    """POST /referrals/track — public, records a visit."""

    def test_unknown_code_is_not_tracked(self, client):
        r = client.post("/api/v1/referrals/track", json={"referral_code": "BOGUS"})
        assert r.status_code == 200
        assert r.json()["tracked"] is False
        assert r.json()["reason"] == "unknown_code"

    def test_valid_code_is_tracked(self, auth_client, client):
        code_resp = auth_client.get("/api/v1/referrals/my-code")
        code = code_resp.json()["referral_code"]

        r = client.post("/api/v1/referrals/track", json={"referral_code": code})
        assert r.status_code == 200
        assert r.json()["tracked"] is True

    def test_duplicate_ip_is_not_tracked_twice(self, auth_client, client):
        code = auth_client.get("/api/v1/referrals/my-code").json()["referral_code"]

        client.post("/api/v1/referrals/track", json={"referral_code": code})
        r = client.post("/api/v1/referrals/track", json={"referral_code": code})
        assert r.json()["tracked"] is False
        assert r.json()["reason"] == "already_tracked"

    def test_empty_code_is_refused(self, client):
        r = client.post("/api/v1/referrals/track", json={"referral_code": ""})
        assert r.status_code == 422


class TestReferralMyCode:
    """GET /referrals/my-code — authenticated, generates a stable code."""

    def test_unauthenticated_is_refused(self, client):
        r = client.get("/api/v1/referrals/my-code")
        assert r.status_code == 401

    def test_returns_a_code(self, auth_client):
        r = auth_client.get("/api/v1/referrals/my-code")
        assert r.status_code == 200
        assert r.json()["referral_code"].startswith("CA-")

    def test_code_is_stable(self, auth_client):
        code1 = auth_client.get("/api/v1/referrals/my-code").json()["referral_code"]
        code2 = auth_client.get("/api/v1/referrals/my-code").json()["referral_code"]
        assert code1 == code2


class TestReferralMyStats:
    """GET /referrals/my-stats — authenticated, shows the caller's stats."""

    def test_unauthenticated_is_refused(self, client):
        r = client.get("/api/v1/referrals/my-stats")
        assert r.status_code == 401

    def test_no_code_yet_returns_zeros(self, auth_client, db_session):
        from app.models.user import User
        user = db_session.query(User).filter_by(email=TEST_EMAIL).one()
        user.referral_code = None
        db_session.commit()

        r = auth_client.get("/api/v1/referrals/my-stats")
        assert r.status_code == 200
        data = r.json()
        assert data["referral_code"] is None
        assert data["total_visits"] == 0

    def test_stats_reflect_tracked_visits(self, auth_client, client):
        code = auth_client.get("/api/v1/referrals/my-code").json()["referral_code"]
        client.post("/api/v1/referrals/track", json={"referral_code": code})

        r = auth_client.get("/api/v1/referrals/my-stats")
        assert r.json()["total_visits"] == 1
        assert r.json()["conversions"] == 0


class TestReferralLeaderboard:
    """GET /referrals/leaderboard — public, top referring CAs."""

    def test_empty_leaderboard(self, client):
        r = client.get("/api/v1/referrals/leaderboard")
        assert r.status_code == 200
        assert r.json()["leaders"] == []

    def test_leaderboard_shows_referrers(self, auth_client, client):
        code = auth_client.get("/api/v1/referrals/my-code").json()["referral_code"]
        client.post("/api/v1/referrals/track", json={"referral_code": code})

        r = client.get("/api/v1/referrals/leaderboard")
        assert r.status_code == 200
        leaders = r.json()["leaders"]
        assert len(leaders) == 1
        assert leaders[0]["referral_count"] == 1
