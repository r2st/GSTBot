import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../hooks/useAuth";
import { StubAuth } from "../test/auth";
import PricingPage from "./PricingPage";

const PRICING_RESPONSE = {
  tiers: {
    free: {
      name: "Free",
      price_display: "₹0/month",
      price_monthly: 0,
      features: ["5 GST lookups/month", "Basic compliance"],
    },
    pro: {
      name: "Pro",
      price_display: "₹499/month",
      price_monthly: 499,
      features: ["Unlimited lookups", "HSN/SAC search", "Filing reminders", "Excel export"],
    },
    enterprise: {
      name: "Enterprise",
      price_display: "₹1,999/month",
      price_monthly: 1999,
      features: ["API access", "Bulk operations", "Priority support", "Custom reports"],
    },
  },
};

const SUBSCRIPTION_RESPONSE = {
  id: 1,
  tier: "free",
  status: "active",
  razorpay_subscription_id: null,
};

function mockFetch(...bodies) {
  const fetch = vi.fn();
  bodies.forEach((body) => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(body),
    });
  });
  global.fetch = fetch;
  return fetch;
}

function renderPage({ authenticated = true } = {}) {
  if (authenticated) {
    return render(
      <MemoryRouter>
        <StubAuth>
          <PricingPage />
        </StubAuth>
      </MemoryRouter>,
    );
  }
  return render(
    <MemoryRouter>
      <PricingPage />
    </MemoryRouter>,
  );
}

describe("PricingPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("shows all three tiers", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("shows prices for each tier", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findByText("₹0/month")).toBeInTheDocument();
    expect(screen.getByText("₹499/month")).toBeInTheDocument();
    expect(screen.getByText("₹1,999/month")).toBeInTheDocument();
  });

  it("lists features for each tier", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findByText("5 GST lookups/month")).toBeInTheDocument();
    expect(screen.getByText("Unlimited lookups")).toBeInTheDocument();
    expect(screen.getByText("API access")).toBeInTheDocument();
  });

  it("highlights the Pro tier as most popular", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findByText("Most Popular")).toBeInTheDocument();
  });

  it("marks the current plan", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findByRole("button", { name: "Current plan" })).toBeDisabled();
  });

  it("offers subscribe buttons for non-current tiers", async () => {
    mockFetch(PRICING_RESPONSE, SUBSCRIPTION_RESPONSE);
    renderPage();

    expect(await screen.findAllByRole("button", { name: "Subscribe" })).toHaveLength(2);
  });

  it("offers cancel when on a paid plan", async () => {
    mockFetch(PRICING_RESPONSE, { ...SUBSCRIPTION_RESPONSE, tier: "pro" });
    renderPage();

    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("offers downgrade to free when on a paid plan", async () => {
    mockFetch(PRICING_RESPONSE, { ...SUBSCRIPTION_RESPONSE, tier: "pro" });
    renderPage();

    expect(await screen.findByRole("button", { name: "Downgrade" })).toBeInTheDocument();
  });

  it("shows loading state", () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading pricing...")).toBeInTheDocument();
  });

  it("shows error when pricing fails to load", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "",
      text: async () => JSON.stringify({ detail: "Server error" }),
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Server error/);
  });

  it("disables subscribe buttons when not signed in", async () => {
    mockFetch(PRICING_RESPONSE);
    const noAuth = {
      user: null,
      loading: false,
      canWrite: false,
      login: () => {},
      register: () => {},
      logout: () => {},
      switchBusiness: () => {},
    };

    render(
      <MemoryRouter>
        <AuthContext.Provider value={noAuth}>
          <PricingPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    const buttons = await screen.findAllByRole("button", { name: "Sign in to subscribe" });
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
