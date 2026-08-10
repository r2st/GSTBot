"""Shared FastAPI dependencies: the current user, and the tenant they act for."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.business import Business
from app.models.business_membership import BusinessMembership
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Resolve the authenticated user from the bearer token."""
    subject = decode_access_token(token)
    if subject is None:
        raise _credentials_exc
    try:
        user_id = int(subject)
    except (TypeError, ValueError) as exc:
        raise _credentials_exc from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _credentials_exc
    return user


def get_current_business(
    x_business_id: int | None = Header(default=None, alias="X-Business-Id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Business:
    """The tenant the request acts for.

    Every business-scoped route depends on this rather than reading
    ``current_user.business_id`` itself, so the tenant a request may touch is
    resolved in exactly one place. A route that forgets it has no
    ``business_id`` to filter on and fails loudly, instead of quietly reading
    across tenants.

    Defaults to the caller's own tenant, exactly as it always has — a request
    that never sends ``X-Business-Id`` is unaffected by any of what follows.
    A header naming a *different* business is only honoured when a live
    :class:`~app.models.business_membership.BusinessMembership` links this
    user to it; see ``POST /businesses/mine/link`` for how one gets created.
    Anything else — an id nobody granted, a stale membership, a business that
    has since gone inactive — is a 403 rather than a silent fall-back to the
    caller's own tenant, because a client that believes it is acting for one
    business must never be quietly handed another's data instead.
    """
    business_id = current_user.business_id
    if x_business_id is not None and x_business_id != current_user.business_id:
        member = db.scalar(
            select(BusinessMembership).where(
                BusinessMembership.user_id == current_user.id,
                BusinessMembership.business_id == x_business_id,
                BusinessMembership.deleted_at.is_(None),
            )
        )
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to that business",
            )
        business_id = x_business_id

    business = db.get(Business, business_id)
    if business is None or business.deleted_at is not None or not business.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Business is inactive"
        )
    return business
