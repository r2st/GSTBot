"""Registration, login, and the tenant boundary they establish."""
from __future__ import annotations

from app.core.security import create_access_token
from app.models.business import Business, BusinessPlan
from app.models.user import User, UserRole
from tests.conftest import BUSINESS_GSTIN, TEST_EMAIL, TEST_PASSWORD

REGISTRATION = {
    "email": "new@example.com",
    "password": "supersecret123",
    "gstin": BUSINESS_GSTIN,
    "legal_name": "Umang Traders Private Limited",
    "trade_name": "Umang Traders",
    "full_name": "Umang Shah",
    "phone": "+919820012345",
}


def test_register_creates_business_and_owner(client, db_session):
    response = client.post("/api/v1/auth/register", json=REGISTRATION)
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["access_token"]
    assert body["user"]["email"] == "new@example.com"
    assert body["user"]["role"] == UserRole.OWNER.value
    assert body["business"]["gstin"] == BUSINESS_GSTIN
    assert body["business"]["plan"] == BusinessPlan.FREE.value

    business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()
    # Both are derived from the GSTIN rather than asked for, so a typo in one
    # cannot disagree with the other.
    assert business.state_code == "27"
    assert business.pan == "AAPFU0939F"

    user = db_session.query(User).filter_by(email="new@example.com").one()
    assert user.business_id == business.id
    # The password is never stored as given.
    assert user.hashed_password != REGISTRATION["password"]


def test_register_returns_decoded_state_name(client):
    response = client.post("/api/v1/auth/register", json=REGISTRATION)
    assert response.json()["business"]["state_name"] == "Maharashtra"


def test_register_normalizes_a_spaced_gstin(client, db_session):
    response = client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "gstin": "27 aapfu0939f 1zv"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["business"]["gstin"] == BUSINESS_GSTIN


def test_register_rejects_an_invalid_gstin(client):
    response = client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "gstin": "27AAPFU0939F1ZW"}
    )
    assert response.status_code == 422
    assert "gstin" in str(response.json()["detail"]).lower()


def test_register_rejects_a_short_password(client):
    response = client.post("/api/v1/auth/register", json={**REGISTRATION, "password": "short"})
    assert response.status_code == 422


def test_register_rejects_a_malformed_email(client):
    response = client.post("/api/v1/auth/register", json={**REGISTRATION, "email": "not-an-email"})
    assert response.status_code == 422


def test_duplicate_email_is_rejected(auth_client):
    response = auth_client.post(
        "/api/v1/auth/register",
        json={**REGISTRATION, "email": TEST_EMAIL, "gstin": "29AAGCB7383J1Z4"},
    )
    assert response.status_code == 409
    assert "email" in response.json()["detail"].lower()


def test_duplicate_gstin_is_rejected(auth_client):
    """One GSTIN is one tenant.

    A second sign-up against a registration already on file must not create a
    parallel tenant — that would split one business's invoices across two
    ledgers that never reconcile.
    """
    response = auth_client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "email": "second@example.com"}
    )
    assert response.status_code == 409
    assert "gstin" in response.json()["detail"].lower()


def test_login_returns_a_usable_token(client, auth_client):
    response = client.post(
        "/api/v1/auth/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert response.json()["token_type"] == "bearer"

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == TEST_EMAIL


def test_login_with_a_wrong_password_fails(client, auth_client):
    response = client.post(
        "/api/v1/auth/login", data={"username": TEST_EMAIL, "password": "wrongpassword"}
    )
    assert response.status_code == 401


def test_login_does_not_reveal_whether_an_account_exists(client, auth_client):
    """Same status and same message either way.

    A different response for "no such user" would turn this endpoint into a
    way to test whether a given business banks with us.
    """
    unknown = client.post(
        "/api/v1/auth/login", data={"username": "nobody@example.com", "password": TEST_PASSWORD}
    )
    wrong_password = client.post(
        "/api/v1/auth/login", data={"username": TEST_EMAIL, "password": "wrongpassword"}
    )
    assert unknown.status_code == wrong_password.status_code == 401
    assert unknown.json()["detail"] == wrong_password.json()["detail"]


def test_inactive_user_cannot_log_in(client, auth_client, db_session):
    user = db_session.query(User).filter_by(email=TEST_EMAIL).one()
    user.is_active = False
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login", data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 403


def test_me_returns_the_user_and_their_business(auth_client):
    response = auth_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == TEST_EMAIL
    assert body["business"]["gstin"] == BUSINESS_GSTIN
    assert body["business"]["state_name"] == "Maharashtra"
    assert "hashed_password" not in body


def test_me_requires_authentication(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_rejects_a_garbage_token(client):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert response.status_code == 401


def test_me_rejects_a_token_for_a_deleted_user(client, auth_client, db_session):
    """A valid signature is not enough.

    The token stays cryptographically valid after the user is gone, so the
    subject has to be resolved against the database on every request.
    """
    token = auth_client.headers["Authorization"]
    db_session.query(User).filter_by(email=TEST_EMAIL).delete()
    db_session.commit()

    assert client.get("/api/v1/auth/me", headers={"Authorization": token}).status_code == 401


def test_me_rejects_a_token_whose_subject_is_not_a_user_id(client):
    """A signature check is not an authorization check.

    ``create_access_token`` stringifies whatever it is handed, so anyone who
    ever obtains the signing key — or any future code path that mints a token
    from something other than a user id — produces a token that verifies
    perfectly and resolves to no user. The subject has to be rejected as
    unusable rather than reaching ``db.get`` and raising a 500 out of the
    driver, which would turn a bad token into an availability problem.
    """
    forged = create_access_token("admin")
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Could not validate credentials"


def test_login_still_finds_a_row_stored_with_mixed_case(client, db_session):
    """The fallback for rows written before addresses were folded.

    Registration lower-cases the address now, so the indexed lookup finds
    everything created since. A row from before that must still be able to log
    in — and only the exact address they typed can match it, because no index
    could serve a ``lower(email)`` comparison.
    """
    from app.core.security import hash_password
    from app.models.business import Business

    business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one_or_none()
    if business is None:
        client.post("/api/v1/auth/register", json=REGISTRATION)
        business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()

    db_session.add(
        User(
            email="Legacy.Owner@Example.com",
            hashed_password=hash_password(TEST_PASSWORD),
            full_name="Legacy Owner",
            role=UserRole.OWNER,
            business_id=business.id,
        )
    )
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login",
        data={"username": "Legacy.Owner@Example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    assert response.json()["access_token"]


def test_register_rejects_a_password_from_the_top_of_every_breach_corpus(client):
    # Long enough to clear the length check, which is exactly why the length
    # check on its own is not enough.
    response = client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "password": "Password123"}
    )
    assert response.status_code == 422
    assert "too common" in str(response.json()["detail"]).lower()


def test_register_rejects_a_password_that_is_only_whitespace(client):
    # Eight spaces satisfies min_length and is not in the corpus list.
    response = client.post("/api/v1/auth/register", json={**REGISTRATION, "password": "        "})
    assert response.status_code == 422
    assert "whitespace" in str(response.json()["detail"]).lower()


def test_inactive_business_blocks_access(auth_client, db_session):
    business = db_session.query(Business).filter_by(gstin=BUSINESS_GSTIN).one()
    business.is_active = False
    db_session.commit()

    assert auth_client.get("/api/v1/auth/me").status_code == 403
