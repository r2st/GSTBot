"""Razorpay integration: subscription creation, verification, webhooks.

Degrades gracefully when credentials are not configured — the product works
without payments, the free tier is the default.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.models.subscription import SubscriptionTier

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.razorpay.com/v1"


def is_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def _auth() -> tuple[str, str]:
    return (settings.razorpay_key_id, settings.razorpay_key_secret)


def _plan_id_for_tier(tier: SubscriptionTier) -> str | None:
    if tier == SubscriptionTier.PRO:
        return settings.razorpay_plan_id_pro or None
    if tier == SubscriptionTier.ENTERPRISE:
        return settings.razorpay_plan_id_enterprise or None
    return None


def create_customer(email: str, name: str | None = None) -> dict[str, Any] | None:
    if not is_configured():
        return None
    try:
        resp = httpx.post(
            f"{_BASE_URL}/customers",
            json={"email": email, "name": name or email.split("@")[0]},
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("Razorpay create_customer failed")
        return None


def create_subscription(
    plan_id: str,
    customer_id: str | None = None,
    total_count: int = 12,
) -> dict[str, Any] | None:
    if not is_configured():
        return None
    payload: dict[str, Any] = {
        "plan_id": plan_id,
        "total_count": total_count,
    }
    if customer_id:
        payload["customer_id"] = customer_id
    try:
        resp = httpx.post(
            f"{_BASE_URL}/subscriptions",
            json=payload,
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("Razorpay create_subscription failed")
        return None


def create_order(
    amount_paise: int,
    currency: str = "INR",
    receipt: str | None = None,
) -> dict[str, Any] | None:
    """Create a one-time payment order (used for the checkout flow)."""
    if not is_configured():
        return None
    payload: dict[str, Any] = {
        "amount": amount_paise,
        "currency": currency,
    }
    if receipt:
        payload["receipt"] = receipt
    try:
        resp = httpx.post(
            f"{_BASE_URL}/orders",
            json=payload,
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("Razorpay create_order failed")
        return None


def verify_payment_signature(
    order_id: str,
    payment_id: str,
    signature: str,
) -> bool:
    """Verify the Razorpay payment signature using HMAC-SHA256."""
    if not settings.razorpay_key_secret:
        return False
    message = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify a Razorpay webhook signature."""
    secret = settings.razorpay_webhook_secret
    if not secret:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def cancel_subscription(subscription_id: str) -> dict[str, Any] | None:
    if not is_configured():
        return None
    try:
        resp = httpx.post(
            f"{_BASE_URL}/subscriptions/{subscription_id}/cancel",
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("Razorpay cancel_subscription failed")
        return None


def fetch_subscription(subscription_id: str) -> dict[str, Any] | None:
    if not is_configured():
        return None
    try:
        resp = httpx.get(
            f"{_BASE_URL}/subscriptions/{subscription_id}",
            auth=_auth(),
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("Razorpay fetch_subscription failed")
        return None


# Pricing data served to the frontend (amounts in paise for Razorpay, display in rupees).
TIER_PRICING = {
    SubscriptionTier.FREE: {
        "name": "Free",
        "price_monthly": 0,
        "price_display": "Free",
        "features": [
            "5 GST lookups/month",
            "Basic compliance check",
            "Single business",
        ],
    },
    SubscriptionTier.PRO: {
        "name": "Pro",
        "price_monthly": 499_00,
        "price_display": "₹499/month",
        "features": [
            "Unlimited GST lookups",
            "HSN/SAC code search",
            "Return filing reminders",
            "Export to Excel",
            "Priority email support",
        ],
    },
    SubscriptionTier.ENTERPRISE: {
        "name": "Enterprise",
        "price_monthly": 1999_00,
        "price_display": "₹1,999/month",
        "features": [
            "Everything in Pro",
            "API access",
            "Bulk operations",
            "Priority support",
            "Custom reports",
            "Dedicated account manager",
        ],
    },
}
