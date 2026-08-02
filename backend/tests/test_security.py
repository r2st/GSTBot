"""Password hashing and access tokens, tested directly.

These are exercised through /auth already, but only along the paths a working
client takes. What matters here is the other kind of input: a corrupt hash out
of the database, a token signed with somebody else's secret, a token that was
minted for a different purpose. Each of those is a way in if it is handled
loosely, and none of them is reachable from the HTTP tests.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_a_password_verifies_against_its_own_hash(self):
        assert verify_password("supersecret123", hash_password("supersecret123"))

    def test_a_wrong_password_does_not(self):
        assert not verify_password("supersecret124", hash_password("supersecret123"))

    def test_the_same_password_hashes_differently_every_time(self):
        """Distinct salts. Equal hashes would let anyone read the database see
        which accounts share a password."""
        assert hash_password("supersecret123") != hash_password("supersecret123")

    def test_a_corrupt_stored_hash_is_a_failed_login_not_a_500(self):
        """A truncated or hand-edited row must deny the login, not crash it.

        bcrypt raises on a malformed hash; letting that escape turns one bad
        row into a 500 that looks like the whole API is down.
        """
        assert not verify_password("supersecret123", "not-a-bcrypt-hash")
        assert not verify_password("supersecret123", "")

    def test_a_password_longer_than_bcrypt_accepts_still_works(self):
        """bcrypt reads at most 72 bytes and historically errored past that."""
        password = "a" * 200

        assert verify_password(password, hash_password(password))

    def test_a_long_multibyte_password_does_not_break_on_the_byte_boundary(self):
        """Truncating to 72 *bytes* can cut a character in half.

        bcrypt takes bytes, so that is harmless — but only if the truncation
        happens before the encode is decoded again anywhere.
        """
        password = "पासवर्ड" * 20

        assert verify_password(password, hash_password(password))

    def test_two_long_passwords_sharing_a_prefix_are_not_distinguished(self):
        """A known bcrypt property, asserted so it is a decision and not a
        surprise: beyond 72 bytes the tail is ignored. The registration schema
        is what bounds password length; this is not a place to rely on it."""
        base = "a" * 72

        assert verify_password(base + "different", hash_password(base + "tail"))


class TestAccessTokens:
    def test_a_token_round_trips_to_its_subject(self):
        assert decode_access_token(create_access_token(42)) == "42"

    def test_an_integer_subject_comes_back_as_a_string(self):
        """`sub` is a string claim by spec, and callers compare it as one."""
        assert decode_access_token(create_access_token(42)) == "42"

    def test_garbage_is_rejected(self):
        assert decode_access_token("not.a.token") is None

    def test_an_empty_token_is_rejected(self):
        assert decode_access_token("") is None

    def test_a_token_signed_with_another_secret_is_rejected(self):
        """The signature is the only thing standing between a forged `sub` and
        a session as that user."""
        forged = jwt.encode(
            {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=30), "type": "access"},
            "a-different-secret",
            algorithm=settings.jwt_algorithm,
        )

        assert decode_access_token(forged) is None

    def test_an_expired_token_is_rejected(self):
        assert decode_access_token(create_access_token(1, expires_minutes=-1)) is None

    def test_a_token_minted_for_another_purpose_is_not_an_access_token(self):
        """The `type` claim is checked, not just the signature.

        A refresh or password-reset token is signed with the same secret. If
        `type` went unchecked, any of them would authenticate as its subject —
        which is exactly what a reset token must never do.
        """
        other = jwt.encode(
            {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=30), "type": "refresh"},
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )

        assert decode_access_token(other) is None

    def test_a_token_with_no_type_claim_is_rejected(self):
        untyped = jwt.encode(
            {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=30)},
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )

        assert decode_access_token(untyped) is None

    @pytest.mark.parametrize("algorithm", ["none", "HS512"])
    def test_a_token_using_a_different_algorithm_is_rejected(self, algorithm):
        """`algorithms=` is pinned on decode. Accepting whatever the token's
        own header asks for is the classic JWT hole — `alg: none` most of all.
        """
        if algorithm == "none":
            # python-jose refuses to *sign* with none, so the token is built by
            # hand the way an attacker would.
            import base64
            import json

            def segment(payload):
                raw = json.dumps(payload, separators=(",", ":")).encode()
                return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

            header = segment({"alg": "none", "typ": "JWT"})
            claims = segment({"sub": "1", "type": "access"})
            token = f"{header}.{claims}."
        else:
            token = jwt.encode(
                {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=30), "type": "access"},
                settings.jwt_secret,
                algorithm=algorithm,
            )

        assert decode_access_token(token) is None

    def test_the_expiry_honours_an_explicit_override(self):
        token = create_access_token(1, expires_minutes=90)
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        expires_in = datetime.fromtimestamp(claims["exp"], UTC) - datetime.now(UTC)

        assert timedelta(minutes=88) < expires_in <= timedelta(minutes=90)

    def test_the_expiry_falls_back_to_the_configured_default(self):
        token = create_access_token(1)
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        expires_in = datetime.fromtimestamp(claims["exp"], UTC) - datetime.now(UTC)

        assert expires_in <= timedelta(minutes=settings.access_token_expire_minutes)
