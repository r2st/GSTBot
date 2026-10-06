"""Subscription management, pricing, and Razorpay payment flow."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_business, get_current_user, require_writer
from app.core.rate_limit import RateLimit
from app.models.business import Business
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.models.user import User
from app.schemas.subscription import (
    CreateOrderRequest,
    CreateOrderResponse,
    PricingResponse,
    SubscriptionOut,
    TierFeatures,
    UsageItem,
    UsageSummaryResponse,
    VerifyPaymentRequest,
)
from app.services import gst_calendar, razorpay_client
from app.services import usage as usage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

_pricing_limit = RateLimit("pricing", "60/minute", by="ip")
_order_limit = RateLimit("create_order", "10/minute")
_verify_limit = RateLimit("verify_payment", "10/minute")
_usage_limit = RateLimit("usage", "60/minute")
_webhook_limit = RateLimit("razorpay_webhook", "30/minute", by="ip")


@router.get(
    "/pricing",
    response_model=PricingResponse,
    summary="Available subscription tiers and pricing",
    dependencies=[Depends(_pricing_limit)],
)
def pricing() -> PricingResponse:
    tiers = {
        tier.value: TierFeatures(**info)
        for tier, info in razorpay_client.TIER_PRICING.items()
    }
    return PricingResponse(
        tiers=tiers,
        razorpay_key_id=settings.razorpay_key_id,
    )


@router.get(
    "/current",
    response_model=SubscriptionOut | None,
    summary="The current business's subscription",
    dependencies=[Depends(_usage_limit)],
)
def current_subscription(
    business: Business = Depends(get_current_business),
    db: Session = Depends(get_db),
) -> SubscriptionOut | None:
    sub = usage_service.get_subscription(db, business.id)
    if sub is None:
        return None
    return SubscriptionOut.model_validate(sub)


@router.post(
    "/create-order",
    response_model=CreateOrderResponse,
    summary="Create a Razorpay order for a tier upgrade",
    dependencies=[Depends(require_writer), Depends(_order_limit)],
)
def create_order(
    payload: CreateOrderRequest,
    business: Business = Depends(get_current_business),
    db: Session = Depends(get_db),
) -> CreateOrderResponse:
    if payload.tier == SubscriptionTier.FREE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create an order for the free tier.",
        )
    if not razorpay_client.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment processing is not configured.",
        )

    pricing = razorpay_client.TIER_PRICING[payload.tier]
    order = razorpay_client.create_order(
        amount_paise=pricing["price_monthly"],
        receipt=f"biz_{business.id}_{payload.tier.value}",
    )
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create payment order. Try again, or contact support if this persists.",
        )
    return CreateOrderResponse(
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        razorpay_key_id=settings.razorpay_key_id,
        tier=payload.tier,
    )


@router.post(
    "/verify-payment",
    response_model=SubscriptionOut,
    summary="Verify Razorpay payment and activate subscription",
    dependencies=[Depends(require_writer), Depends(_verify_limit)],
)
def verify_payment(
    payload: VerifyPaymentRequest,
    business: Business = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    if not razorpay_client.verify_payment_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed. Contact support if you were charged, or try the payment again.",
        )

    sub = usage_service.get_subscription(db, business.id)
    if sub is None:
        sub = Subscription(
            business_id=business.id,
            tier=payload.tier,
            status=SubscriptionStatus.ACTIVE,
            razorpay_subscription_id=payload.razorpay_payment_id,
        )
        db.add(sub)
    else:
        sub.tier = payload.tier
        sub.status = SubscriptionStatus.ACTIVE
        sub.razorpay_subscription_id = payload.razorpay_payment_id
    db.commit()
    db.refresh(sub)

    logger.info(
        "Subscription activated",
        extra={
            "business_id": business.id,
            "user_id": current_user.id,
            "tier": payload.tier.value,
        },
    )
    return SubscriptionOut.model_validate(sub)


@router.post(
    "/cancel",
    response_model=SubscriptionOut,
    summary="Cancel the current subscription (reverts to free)",
    dependencies=[Depends(require_writer), Depends(_verify_limit)],
)
def cancel_subscription(
    business: Business = Depends(get_current_business),
    db: Session = Depends(get_db),
) -> SubscriptionOut:
    sub = usage_service.get_subscription(db, business.id)
    if sub is None or sub.tier == SubscriptionTier.FREE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active paid subscription to cancel.",
        )
    if sub.razorpay_subscription_id and razorpay_client.is_configured():
        result = razorpay_client.cancel_subscription(sub.razorpay_subscription_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not cancel subscription with payment provider. Try again, or contact support if this persists.",
            )
    sub.tier = SubscriptionTier.FREE
    sub.status = SubscriptionStatus.CANCELLED
    db.commit()
    db.refresh(sub)
    return SubscriptionOut.model_validate(sub)


@router.get(
    "/usage",
    response_model=UsageSummaryResponse,
    summary="API usage for the current month",
    dependencies=[Depends(_usage_limit)],
)
def usage_summary(
    period: str | None = Query(default=None, pattern=gst_calendar.PERIOD_PATTERN),
    business: Business = Depends(get_current_business),
    db: Session = Depends(get_db),
) -> UsageSummaryResponse:
    tier = usage_service.get_tier(db, business.id)
    actual_period = period or usage_service.current_period()
    rows = usage_service.get_usage_summary(db, business.id, actual_period)
    return UsageSummaryResponse(
        tier=tier,
        period=actual_period,
        usage=[UsageItem(**r) for r in rows],
    )


@router.post(
    "/webhook",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
    summary="Razorpay webhook receiver",
    dependencies=[Depends(_webhook_limit)],
)
async def razorpay_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not razorpay_client.verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        logger.error(
            "Razorpay webhook body is not valid JSON",
            extra={"body_length": len(body), "body_prefix": body[:200].decode("utf-8", errors="replace")},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook body is not valid JSON.",
        )

    event = payload.get("event", "")
    entity = (payload.get("payload", {}).get("payment", {}).get("entity", {})
              or payload.get("payload", {}).get("subscription", {}).get("entity", {}))
    razorpay_id = entity.get("id") or entity.get("subscription_id")

    if not razorpay_id:
        return {"status": "ok"}

    sub = db.scalar(
        select(Subscription).where(
            Subscription.razorpay_subscription_id == razorpay_id
        )
    )
    if sub is None:
        return {"status": "ok", "detail": "no matching subscription"}

    _TRANSITION: dict[str, SubscriptionStatus] = {
        "subscription.halted": SubscriptionStatus.PAST_DUE,
        "subscription.cancelled": SubscriptionStatus.CANCELLED,
        "subscription.expired": SubscriptionStatus.EXPIRED,
        "subscription.activated": SubscriptionStatus.ACTIVE,
        "subscription.charged": SubscriptionStatus.ACTIVE,
        "payment.failed": SubscriptionStatus.PAST_DUE,
    }

    new_status = _TRANSITION.get(event)
    if new_status is not None and sub.status != new_status:
        old = sub.status
        sub.status = new_status
        db.commit()
        logger.info(
            "Webhook transitioned subscription %s → %s",
            old.value, new_status.value,
            extra={
                "business_id": sub.business_id,
                "razorpay_id": razorpay_id,
                "event": event,
            },
        )
    return {"status": "ok"}
