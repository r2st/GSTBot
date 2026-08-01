import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

const BUCKET = {
  count: 0,
  taxable_value: "0.00",
  cgst: "0.00",
  sgst: "0.00",
  igst: "0.00",
  cess: "0.00",
  total_tax: "0.00",
  total_value: "0.00",
};

function dashboard(overrides = {}) {
  return {
    business_gstin: "27AAPFU0939F1ZV",
    business_name: "Umang Traders",
    period: "2026-04",
    counts: { total: 3, sales: 1, purchase: 2, by_status: { parsed: 3 }, needs_review: 1 },
    sales: { ...BUCKET, count: 1, igst: "18000.00", total_tax: "18000.00" },
    purchase: { ...BUCKET, count: 2, igst: "9000.00", total_tax: "9000.00" },
    net_liability: {
      cgst: "0.00",
      sgst: "0.00",
      igst: "9000.00",
      cess: "0.00",
      total: "9000.00",
    },
    output_tax: "18000.00",
    input_tax_credit: "9000.00",
    itc_at_risk: "0.00",
    plan_usage: {
      plan: "free",
      invoices_this_month: 3,
      monthly_limit: 50,
      remaining: 47,
    },
    recent_periods: [],
    open_alerts: 0,
    next_due_date: "2026-05-20",
    last_reconciliation: null,
    ...overrides,
  };
}

function mockDashboard(body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "",
    text: async () => JSON.stringify(body),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("shows the headline figures in rupees", async () => {
    mockDashboard(dashboard());
    renderPage();

    // The headline figure shows in the stat tile and again in the tax
    // breakdown, so this is findAll rather than find.
    expect((await screen.findAllByText(/₹18,000.00/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₹9,000.00/).length).toBeGreaterThan(0);
  });

  it("identifies the business", async () => {
    mockDashboard(dashboard());
    renderPage();
    expect(await screen.findByText(/27AAPFU0939F1ZV/)).toBeInTheDocument();
  });

  it("breaks tax down per head", async () => {
    mockDashboard(dashboard());
    renderPage();

    // Each head is shown separately because credit cannot be pooled across
    // them — a single netted figure would misstate what is actually payable.
    expect(await screen.findByRole("row", { name: /IGST/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /CGST/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SGST/ })).toBeInTheDocument();
  });

  it("counts invoices needing review", async () => {
    mockDashboard(dashboard());
    renderPage();
    expect(await screen.findByText("Needs review")).toBeInTheDocument();
  });

  it("warns loudly once a deadline has passed", async () => {
    vi.setSystemTime(new Date(2026, 5, 1)); // 1 June, past the 20 May due date.
    mockDashboard(dashboard());
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent(/overdue/);
    vi.useRealTimers();
  });

  it("shows the remaining free-tier allowance", async () => {
    mockDashboard(dashboard());
    renderPage();
    expect(await screen.findByText(/47 remaining/)).toBeInTheDocument();
  });

  it("says unlimited for a plan with no cap", async () => {
    mockDashboard(
      dashboard({
        plan_usage: {
          plan: "pro",
          invoices_this_month: 900,
          monthly_limit: 0,
          remaining: null,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText(/unlimited/)).toBeInTheDocument();
  });

  it("surfaces a failed load instead of showing stale zeroes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => JSON.stringify({ detail: "Database unavailable" }),
    });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
  });
});
