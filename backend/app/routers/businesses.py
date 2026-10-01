"""Multi-GSTIN access: which businesses one login can act for, and linking another.

A GST registration is one GSTIN, and this product's tenant is the registration
— see :mod:`app.models.business`. So a company holding three registrations, or
an accountant serving several clients, ends up with several separate DoAide GST
logins, one per sign-up. This router is what lets one of those logins reach
the others: link a second account by proving you also hold its password, then
pick which business a request acts for with the ``X-Business-Id`` header — see
:func:`app.core.deps.get_current_business`.

Nothing here changes what a tenant *is*. A membership only widens which single
business one already-authenticated request may act as; every business-scoped
table still keys every row to exactly one ``business_id``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.params import RowId
from app.core.rate_limit import RateLimit
from app.core.security import verify_password
from app.models.business import Business
from app.models.business_membership import BusinessMembership, MembershipRole
from app.models.user import User
from app.schemas.business import LinkBusinessIn, MyBusinessesOut, MyBusinessOut

router = APIRouter(prefix="/businesses", tags=["businesses"])

_read_limit = RateLimit("businesses_read", "120/minute")
# Verifies a password, so it earns the same tight budget login itself has —
# see app.routers.auth._login_limit.
_link_limit = RateLimit("businesses_link", "20/minute", by="ip")


def _out(business: Business, *, role: str, is_home: bool) -> MyBusinessOut:
    return MyBusinessOut(
        id=business.id,
        gstin=business.gstin,
        legal_name=business.legal_name,
        trade_name=business.trade_name,
        plan=business.plan,
        role=role,
        is_home=is_home,
    )


@router.get(
    "/mine",
    response_model=MyBusinessesOut,
    summary="Every business this login can act for",
    description=(
        "The caller's own tenant, first, plus any business linked with "
        "`POST /businesses/mine/link`. Pass a listed `id` as the "
        "`X-Business-Id` header on any other request to act for that "
        "business instead of the caller's own."
    ),
    dependencies=[Depends(_read_limit)],
)
def my_businesses(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> MyBusinessesOut:
    """The caller's own tenant, plus every business they have linked."""
    items: list[MyBusinessOut] = []

    # ``Business.reachable()`` on both halves, and it is the same predicate
    # ``get_current_business`` refuses on. This list is what the switcher
    # offers, so anything in it that a request cannot then act for is a menu
    # entry whose only outcome is a 403 — and a *suspended* business used to
    # be exactly that, because this filtered soft deletes and forgot
    # ``is_active``. The user clicked their own company and was told they had
    # no access to it. Filtering is the honest answer: what they have lost is
    # the ability to act for that business, and the switcher is a list of the
    # businesses they can.
    home = db.get(Business, current_user.business_id)
    if home is not None and home.is_reachable:
        items.append(_out(home, role=current_user.role.value, is_home=True))

    # Joined rather than walked. ``membership.business`` is a lazy
    # relationship, so reading it inside the loop cost one SELECT per
    # membership — invisible at the two or three registrations a practice
    # starts with, and paid on every page load by the consultant with thirty
    # client GSTINs, because the business switcher calls this endpoint.
    #
    # The join also moves the liveness filter into the database. A row cannot
    # come back without its business, so the loop no longer needs a `is None`
    # branch that only a broken foreign key could ever reach.
    rows = db.execute(
        select(BusinessMembership, Business)
        .join(Business, Business.id == BusinessMembership.business_id)
        .where(
            BusinessMembership.user_id == current_user.id,
            BusinessMembership.deleted_at.is_(None),
            Business.reachable(),
        )
    ).all()
    for membership, business in rows:
        items.append(_out(business, role=membership.role.value, is_home=False))

    return MyBusinessesOut(items=items)


@router.post(
    "/mine/link",
    response_model=MyBusinessOut,
    status_code=status.HTTP_201_CREATED,
    summary="Link another GSTIN registration's login to this one",
    description=(
        "Proves access the only way this product can without an invitation "
        "flow it does not have: the *other* account's own email and "
        "password. A correct password already proves ownership of the "
        "account it unlocks, so a successful call links that account's "
        "business immediately, carrying over its own role.\n\n"
        "For the person who signed up separately for each GSTIN they hold — "
        "which is how sign-up works, one registration at a time — and wants "
        "to work across all of them from one session rather than logging in "
        "and out."
    ),
    responses={
        401: {"description": "That email and password do not match an active account."},
        409: {"description": "Already your own business, or already linked."},
    },
    dependencies=[Depends(_link_limit)],
)
def link_business(
    payload: LinkBusinessIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MyBusinessOut:
    """Link another account's business here, proven by that account's own password."""
    other = db.scalar(select(User).where(User.email == payload.email.lower()))
    # Same message whether the email is unknown or the password is wrong —
    # telling the two apart would let this endpoint be used to check whether
    # an email address has a DoAide GST account at all.
    if other is None or not other.is_active or not verify_password(
        payload.password, other.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email and password do not match an active account.",
        )

    if other.business_id == current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That is already your business."
        )

    # A closed or suspended registration cannot be acted for, so a membership
    # to one is access to nothing. Answering 201 for it was the worst of both:
    # the caller was told the link succeeded, the business then never appeared
    # in ``GET /businesses/mine`` because that filters the same way, and every
    # request sending its id came back "Business is inactive" — with no way to
    # tell that from a bug. The password was correct, so this leaks nothing
    # they did not already prove they know.
    target = db.get(Business, other.business_id)
    if target is None or not target.is_reachable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "That business is closed or suspended, so there is nothing to "
                "link to. Contact support if you think it should be active."
            ),
        )

    existing = db.scalar(
        select(BusinessMembership).where(
            BusinessMembership.user_id == current_user.id,
            BusinessMembership.business_id == other.business_id,
            BusinessMembership.deleted_at.is_(None),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That business is already linked."
        )

    # UserRole and MembershipRole share the same three values on purpose: the
    # access someone has on their own business is exactly the access carried
    # over onto a second one linked this way.
    role = MembershipRole(other.role.value)
    membership = BusinessMembership(
        user_id=current_user.id, business_id=other.business_id, role=role
    )
    db.add(membership)
    db.commit()

    # ``target`` again rather than a second ``db.get``: the commit expired it,
    # so reading it here reloads the row exactly once either way, and one name
    # for one row is one fewer thing that can be checked and then not used.
    return _out(target, role=role.value, is_home=False)


@router.delete(
    "/mine/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Unlink a business from this login",
    description=(
        "Removes access this login gained through `POST /businesses/mine/link`. "
        "The caller's own business has no membership row to remove and is "
        "unaffected — this can only ever narrow what a *linked* session can "
        "reach, never sign the caller out of their own tenant."
    ),
    responses={404: {"description": "Not linked to this login."}},
    dependencies=[Depends(_link_limit)],
)
def unlink_business(
    business_id: RowId,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a linked business from this login."""
    membership = db.scalar(
        select(BusinessMembership).where(
            BusinessMembership.user_id == current_user.id,
            BusinessMembership.business_id == business_id,
            BusinessMembership.deleted_at.is_(None),
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not linked.")
    membership.soft_delete()
    db.commit()
