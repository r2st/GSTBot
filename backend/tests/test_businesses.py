"""Multi-GSTIN access: listing, linking, unlinking, and X-Business-Id.

A GSTBot sign-up is one GSTIN, so a company or a practice with several
registrations ends up with several separate logins. This is the router that
lets one of those logins reach the others — see app/routers/businesses.py —
and the tests below cover the three moving parts: proving you hold the other
account's password before a link is created, listing what one login can now
act for, and the header that actually switches which business a request acts
as.
"""
from __future__ import annotations

from sqlalchemy import event

from app.models.business import Business
from app.models.business_membership import BusinessMembership
from app.models.user import User, UserRole
from app.services.gstin import compute_check_digit
from tests.conftest import BUSINESS_GSTIN, TEST_EMAIL, TEST_PASSWORD

SECOND_EMAIL = "owner-2@example.com"
SECOND_PASSWORD = "anothersecret123"
SECOND_GSTIN = "27AAGCB7383J2Z7"


def _valid_gstin(index: int) -> str:
    """A distinct checksum-valid GSTIN, for tests that need more than a couple.

    Registration is not the subject of these tests but the check digit is
    still enforced underneath them, so a made-up 15th character would fail on
    the GSTIN rather than on what is being asserted. Built rather than listed
    because a table of constants is one more thing to extend every time a test
    wants one more business.
    """
    # 2 state + 10 PAN (5 letters, 4 digits, 1 letter) + 1 entity + "Z" = 14.
    first14 = f"27AAGCB{7000 + index:04d}J1Z"
    return first14 + compute_check_digit(first14)


def register_second_business(client, *, email=SECOND_EMAIL, password=SECOND_PASSWORD,
                              gstin=SECOND_GSTIN):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "gstin": gstin,
            "legal_name": "Second Business Pvt Ltd",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def link(auth_client, *, email=SECOND_EMAIL, password=SECOND_PASSWORD):
    return auth_client.post(
        "/api/v1/businesses/mine/link", json={"email": email, "password": password}
    )


# ---------------------------------------------------------------------------
# GET /businesses/mine
# ---------------------------------------------------------------------------

class TestListingMyBusinesses:
    def test_a_fresh_login_sees_only_its_own_business(self, auth_client, business):
        body = auth_client.get("/api/v1/businesses/mine").json()
        assert [item["id"] for item in body["items"]] == [business.id]
        assert body["items"][0]["is_home"] is True
        assert body["items"][0]["gstin"] == BUSINESS_GSTIN

    def test_it_requires_authentication(self, client):
        assert client.get("/api/v1/businesses/mine").status_code == 401

    def test_a_linked_business_appears_alongside_the_home_one(
        self, auth_client, client, business
    ):
        register_second_business(client)
        link(auth_client)

        body = auth_client.get("/api/v1/businesses/mine").json()
        assert len(body["items"]) == 2
        assert {item["gstin"] for item in body["items"]} == {BUSINESS_GSTIN, SECOND_GSTIN}
        home = next(item for item in body["items"] if item["gstin"] == BUSINESS_GSTIN)
        linked = next(item for item in body["items"] if item["gstin"] == SECOND_GSTIN)
        assert home["is_home"] is True
        assert linked["is_home"] is False
        assert linked["role"] == "owner"

    def test_a_linked_business_that_was_deleted_drops_out_of_the_list(
        self, auth_client, client, business, db_session
    ):
        """The membership outlives the business it points at.

        Unlinking soft-deletes the membership; deleting the *business* does
        not, because the two are separate rows and nothing cascades a soft
        delete. So a live membership can point at a tombstone, and listing has
        to filter on the far side of the join rather than trusting that a
        membership implies a business worth showing.

        Left unfiltered this is not a cosmetic bug: the row is rendered by
        ``_out``, so a deleted registration keeps appearing in the tenant
        switcher, and picking it acts as a business that is supposed to be
        gone.
        """
        second = register_second_business(client)
        link(auth_client)
        assert len(auth_client.get("/api/v1/businesses/mine").json()["items"]) == 2

        deleted = db_session.get(Business, second["business"]["id"])
        deleted.soft_delete()
        db_session.commit()

        body = auth_client.get("/api/v1/businesses/mine").json()
        assert [item["id"] for item in body["items"]] == [business.id]
        # The membership is untouched — it is the listing that filters, not the
        # delete that cleaned up after itself.
        assert db_session.query(BusinessMembership).count() == 1

    def test_listing_costs_the_same_number_of_queries_at_one_link_and_at_many(
        self, auth_client, db_session, business
    ):
        """The listing must not read the businesses table once per membership.

        ``membership.business`` is a plain lazy relationship, so walking the
        memberships in a loop emits one SELECT per row. Nobody sees it at the
        two or three registrations a practice starts with, and the endpoint is
        on the critical path of every page load — the business switcher calls
        it — so the cost lands on a consultant with thirty client GSTINs and
        on nobody who would report it.

        Counting the reads at two sizes is what makes this a claim about the
        shape of the query rather than about a number that a schema change
        could shift for an unrelated reason. Same count at 1 as at 12, or the
        loop is back.
        """

        def _reads_of_businesses_for(link_count: int, first_gstin: int) -> int:
            user = db_session.query(User).filter_by(email=TEST_EMAIL).one()
            # Only the memberships go: the businesses stay behind, so each
            # sizing needs GSTINs of its own or the second insert collides
            # with the first's rows on the unique index.
            db_session.query(BusinessMembership).delete()
            db_session.commit()
            for index in range(first_gstin, first_gstin + link_count):
                gstin = _valid_gstin(index)
                linked = Business(
                    gstin=gstin,
                    legal_name=f"Linked {index} Pvt Ltd",
                    state_code=gstin[:2],
                )
                db_session.add(linked)
                db_session.flush()
                db_session.add(
                    BusinessMembership(
                        user_id=user.id, business_id=linked.id, role=UserRole.OWNER
                    )
                )
            db_session.commit()

            # A real request opens its own session and shares nothing with the
            # rows just written. Without this the lazy loads are answered out
            # of the identity map, no SQL is emitted, and the N+1 the test
            # exists to catch is invisible to it.
            db_session.expunge_all()

            reads: list[str] = []

            def _record(conn, cursor, statement, parameters, context, executemany):
                squashed = " ".join(statement.split()).lower()
                if squashed.startswith("select") and "from businesses" in squashed:
                    reads.append(squashed)

            engine = db_session.get_bind()
            event.listen(engine, "before_cursor_execute", _record)
            try:
                response = auth_client.get("/api/v1/businesses/mine")
            finally:
                event.remove(engine, "before_cursor_execute", _record)

            assert response.status_code == 200, response.text
            assert len(response.json()["items"]) == link_count + 1
            return len(reads)

        at_one = _reads_of_businesses_for(1, first_gstin=0)
        at_twelve = _reads_of_businesses_for(12, first_gstin=100)
        assert at_one == at_twelve, (
            f"{at_one} reads of businesses for one link, {at_twelve} for twelve: "
            "the listing is loading each membership's business on its own."
        )


# ---------------------------------------------------------------------------
# POST /businesses/mine/link
# ---------------------------------------------------------------------------

class TestLinkingABusiness:
    def test_the_right_password_links_it(self, auth_client, client, db_session):
        register_second_business(client)
        response = link(auth_client)
        assert response.status_code == 201, response.text
        assert response.json()["gstin"] == SECOND_GSTIN
        assert response.json()["is_home"] is False

        row = db_session.query(BusinessMembership).one()
        assert row.business.gstin == SECOND_GSTIN

    def test_the_wrong_password_is_refused(self, auth_client, client):
        register_second_business(client)
        response = link(auth_client, password="not-the-right-password")
        assert response.status_code == 401

    def test_an_unknown_email_is_refused_the_same_way_as_a_wrong_password(
        self, auth_client, client
    ):
        register_second_business(client)
        wrong_password = link(auth_client, password="not-the-right-password")
        unknown_email = link(auth_client, email="nobody@example.com")
        assert wrong_password.status_code == unknown_email.status_code == 401
        assert wrong_password.json()["detail"] == unknown_email.json()["detail"]

    def test_linking_your_own_business_again_is_refused(self, auth_client):
        response = link(auth_client, email=TEST_EMAIL, password=TEST_PASSWORD)
        assert response.status_code == 409
        assert "already your business" in response.json()["detail"].lower()

    def test_linking_the_same_business_twice_is_refused(self, auth_client, client):
        register_second_business(client)
        assert link(auth_client).status_code == 201
        second = link(auth_client)
        assert second.status_code == 409
        assert "already linked" in second.json()["detail"].lower()

    def test_an_inactive_accounts_password_is_refused(
        self, auth_client, client, db_session
    ):
        register_second_business(client)
        other = db_session.query(User).filter_by(email=SECOND_EMAIL).one()
        other.is_active = False
        db_session.commit()

        assert link(auth_client).status_code == 401

    def test_linking_requires_authentication(self, client):
        register_second_business(client)
        response = client.post(
            "/api/v1/businesses/mine/link",
            json={"email": SECOND_EMAIL, "password": SECOND_PASSWORD},
        )
        assert response.status_code == 401

    def test_the_linked_accounts_role_is_carried_over(self, auth_client, client, db_session):
        register_second_business(client, email="viewer@example.com", password="viewersecret1")
        viewer = db_session.query(User).filter_by(email="viewer@example.com").one()
        viewer.role = UserRole.VIEWER
        db_session.commit()

        response = link(auth_client, email="viewer@example.com", password="viewersecret1")
        assert response.json()["role"] == "viewer"


# ---------------------------------------------------------------------------
# DELETE /businesses/mine/{business_id}
# ---------------------------------------------------------------------------

class TestUnlinkingABusiness:
    def test_it_removes_the_membership(self, auth_client, client, db_session):
        register_second_business(client)
        linked_id = link(auth_client).json()["id"]

        response = auth_client.delete(f"/api/v1/businesses/mine/{linked_id}")
        assert response.status_code == 204

        body = auth_client.get("/api/v1/businesses/mine").json()
        assert [item["id"] for item in body["items"]] == [
            item["id"] for item in body["items"] if item["is_home"]
        ]

    def test_unlinking_something_never_linked_is_404(self, auth_client, business):
        response = auth_client.delete(f"/api/v1/businesses/mine/{business.id + 999}")
        assert response.status_code == 404

    def test_the_home_business_cannot_be_unlinked(self, auth_client, business):
        # It has no membership row to remove — it is not reached through one.
        response = auth_client.delete(f"/api/v1/businesses/mine/{business.id}")
        assert response.status_code == 404

    def test_unlinking_requires_authentication(self, client):
        # No `business` fixture here on purpose: it pulls in `auth_client`,
        # which mutates this same TestClient's headers as a side effect —
        # exactly the authentication this test exists to require the absence
        # of. Any id does; the auth check runs before the row is looked up.
        assert client.delete("/api/v1/businesses/mine/1").status_code == 401


# ---------------------------------------------------------------------------
# X-Business-Id
# ---------------------------------------------------------------------------

class TestSwitchingBusinessWithTheHeader:
    def test_no_header_acts_for_the_home_business_as_always(self, auth_client, business):
        response = auth_client.get("/api/v1/dashboard")
        assert response.status_code == 200
        assert response.json()["business_gstin"] == business.gstin

    def test_a_linked_businesss_id_switches_the_active_tenant(
        self, auth_client, client, business
    ):
        register_second_business(client)
        linked_id = link(auth_client).json()["id"]

        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": str(linked_id)}
        )
        assert response.status_code == 200
        assert response.json()["business_gstin"] == SECOND_GSTIN

    def test_an_unlinked_business_id_is_refused(self, auth_client, client, business):
        second = register_second_business(client)
        other_business_id = second["business"]["id"]

        # Never linked — auth_client's user has no membership to it.
        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": str(other_business_id)}
        )
        assert response.status_code == 403

    def test_a_business_id_that_does_not_exist_is_refused(self, auth_client):
        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": "999999"}
        )
        assert response.status_code == 403

    def test_switching_to_your_own_id_explicitly_still_works(self, auth_client, business):
        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": str(business.id)}
        )
        assert response.status_code == 200
        assert response.json()["business_gstin"] == business.gstin

    def test_unlinking_revokes_the_switch(self, auth_client, client, business):
        register_second_business(client)
        linked_id = link(auth_client).json()["id"]
        auth_client.delete(f"/api/v1/businesses/mine/{linked_id}")

        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": str(linked_id)}
        )
        assert response.status_code == 403

    def test_data_written_while_switched_lands_under_the_linked_business(
        self, auth_client, client, db_session
    ):
        from app.models.invoice import Invoice

        register_second_business(client)
        linked_id = link(auth_client).json()["id"]

        response = auth_client.post(
            "/api/v1/invoices/upload",
            files={"file": ("bill.txt", b"Invoice No: SW-1\nTotal Amount: 100.00", "text/plain")},
            data={"invoice_type": "purchase"},
            headers={"X-Business-Id": str(linked_id)},
        )
        assert response.status_code == 201, response.text

        invoice = db_session.query(Invoice).filter_by(invoice_number="SW-1").one()
        assert invoice.business_id == linked_id

    def test_a_deactivated_business_is_refused_even_with_a_valid_membership(
        self, auth_client, client, db_session
    ):
        register_second_business(client)
        linked_id = link(auth_client).json()["id"]

        from app.models.business import Business

        target = db_session.get(Business, linked_id)
        target.is_active = False
        db_session.commit()

        response = auth_client.get(
            "/api/v1/dashboard", headers={"X-Business-Id": str(linked_id)}
        )
        assert response.status_code == 403
