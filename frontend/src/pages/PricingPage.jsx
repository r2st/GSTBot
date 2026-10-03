import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
import { api } from "../lib/api";
import { track } from "../lib/track";

const TIER_ORDER = ["free", "pro", "enterprise"];
const TIER_LABELS = { free: "Free", pro: "Pro", enterprise: "Enterprise" };
const HIGHLIGHT_TIER = "pro";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  usePageTitle("Pricing — DoAide GST");
  const { user } = useAuth();
  const [pricing, setPricing] = useState(null);
  const [currentSub, setCurrentSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const p = await api.pricing();
      setPricing(p);
      if (user) {
        const sub = await api.currentSubscription();
        setCurrentSub(sub);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    track("pricing_view");
  }, []);

  async function handleSubscribe(tier) {
    if (tier === "free") return;
    setError(null);
    setSuccess(null);
    setPaying(true);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Could not load payment gateway. Please try again.");
        setPaying(false);
        return;
      }

      const order = await api.createOrder(tier);

      const options = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency,
        name: "DoAide GST",
        description: `${TIER_LABELS[tier]} Plan - Monthly`,
        order_id: order.order_id,
        handler: async function (response) {
          try {
            await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              tier,
            });
            setSuccess(`Subscribed to ${TIER_LABELS[tier]} plan!`);
            const sub = await api.currentSubscription();
            setCurrentSub(sub);
          } catch (err) {
            setError(err.message);
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          },
        },
        prefill: {
          email: user?.email || "",
          name: user?.full_name || "",
        },
        theme: { color: "#F0B429" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err.message);
      setPaying(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setSuccess(null);
    try {
      await api.cancelSubscription();
      setSuccess("Subscription cancelled. You are now on the Free plan.");
      const sub = await api.currentSubscription();
      setCurrentSub(sub);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="pricing-page">
        <p className="pricing-loading">Loading pricing...</p>
      </div>
    );
  }

  const currentTier = currentSub?.tier || "free";

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1>Simple, transparent pricing</h1>
        <p>Choose the plan that fits your GST compliance needs</p>
      </div>

      {error && <div className="pricing-error" role="alert">{error}</div>}
      {success && <div className="pricing-success" role="status">{success}</div>}

      <div className="pricing-grid">
        {pricing &&
          TIER_ORDER.map((tierKey) => {
            const tier = pricing.tiers[tierKey];
            if (!tier) return null;
            const isCurrent = currentTier === tierKey;
            const isHighlight = tierKey === HIGHLIGHT_TIER;

            return (
              <div
                key={tierKey}
                className={`pricing-card${isHighlight ? " pricing-card-highlight" : ""}${isCurrent ? " pricing-card-current" : ""}`}
              >
                {isHighlight && (
                  <div className="pricing-badge">Most Popular</div>
                )}
                <h2>{tier.name}</h2>
                <div className="pricing-price">{tier.price_display}</div>
                <ul className="pricing-features">
                  {tier.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <div className="pricing-action">
                  {isCurrent ? (
                    <>
                      <button className="btn btn-ghost" disabled>
                        Current plan
                      </button>
                      {tierKey !== "free" && (
                        <button
                          className="btn btn-danger-ghost"
                          onClick={handleCancel}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  ) : tierKey === "free" ? (
                    currentTier !== "free" ? (
                      <button className="btn btn-ghost" onClick={handleCancel}>
                        Downgrade
                      </button>
                    ) : null
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={paying || !user}
                      onClick={() => handleSubscribe(tierKey)}
                    >
                      {paying ? "Processing..." : user ? "Subscribe" : "Sign in to subscribe"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
