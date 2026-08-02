import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  describe("the GSTR-3B due date notice", () => {
    // The due date in the fixture is 20 May 2026; each case moves "today"
    // relative to it. A missed 3B carries interest at 18% and a per-day late
    // fee, so how loud this gets is the point of the component.
    afterEach(() => vi.useRealTimers());

    async function noticeOn(year, monthIndex, day, body = dashboard()) {
      vi.setSystemTime(new Date(year, monthIndex, day));
      mockDashboard(body);
      renderPage();
      return screen.findByRole("status");
    }

    it("stays quiet in tone when the deadline is comfortably away", async () => {
      const notice = await noticeOn(2026, 4, 1); // 19 days out.

      expect(notice).toHaveClass("banner-neutral");
      expect(notice).toHaveTextContent(/19 days left/);
    });

    it("turns to a warning inside a week", async () => {
      const notice = await noticeOn(2026, 4, 15); // 5 days out.

      expect(notice).toHaveClass("banner-warn");
      expect(notice).toHaveTextContent(/5 days left/);
    });

    it("escalates to the overdue styling inside three days", async () => {
      // Filing needs the books closed first, so three days out is already
      // the point of no return for most businesses — it gets the same red as
      // a missed deadline rather than the amber of the week before.
      const notice = await noticeOn(2026, 4, 18); // 2 days out.

      expect(notice).toHaveClass("banner-bad");
      expect(notice).toHaveTextContent(/2 days left/);
    });

    it("counts the day itself as still open", async () => {
      const notice = await noticeOn(2026, 4, 20); // The due date.

      expect(notice).toHaveClass("banner-bad");
      expect(notice).toHaveTextContent(/0 days left/);
      expect(notice).not.toHaveTextContent(/overdue/);
    });

    it("says nothing at all when no deadline is known", async () => {
      // A business registered mid-period has no computed due date yet, and
      // an empty banner is worse than no banner.
      vi.setSystemTime(new Date(2026, 4, 1));
      mockDashboard(dashboard({ next_due_date: null }));
      renderPage();

      await screen.findByText(/Umang Traders/);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("the net liability trend", () => {
    const trend = [
      { period: "2026-02", net_liability: { total: "4000.00" } },
      { period: "2026-03", net_liability: { total: "8000.00" } },
      { period: "2026-04", net_liability: { total: "0.00" } },
    ];

    it("is hidden until there is more than one period to compare", async () => {
      mockDashboard(dashboard({ recent_periods: [] }));
      renderPage();

      await screen.findByText(/Umang Traders/);
      expect(screen.queryByText("Net liability trend")).not.toBeInTheDocument();
    });

    it("plots a bar per period, labelled by month", async () => {
      mockDashboard(dashboard({ recent_periods: trend }));
      const { container } = renderPage();

      expect(await screen.findByText("Net liability trend")).toBeInTheDocument();
      expect(container.querySelectorAll(".chart-col")).toHaveLength(3);
      expect([...container.querySelectorAll(".chart-label")].map((n) => n.textContent)).toEqual([
        "02",
        "03",
        "04",
      ]);
    });

    it("scales the bars against the tallest period, not against the total", async () => {
      mockDashboard(dashboard({ recent_periods: trend }));
      const { container } = renderPage();

      await screen.findByText("Net liability trend");
      const bars = [...container.querySelectorAll(".chart-bar")];
      expect(bars[1].style.height).toBe("100%"); // The peak.
      expect(bars[0].style.height).toBe("50%"); // Half of it.
    });

    it("still draws a sliver for a period with nothing owed", async () => {
      // A zero-height bar is indistinguishable from a missing month, which
      // reads as lost data rather than a nil return.
      mockDashboard(dashboard({ recent_periods: trend }));
      const { container } = renderPage();

      await screen.findByText("Net liability trend");
      expect([...container.querySelectorAll(".chart-bar")][2].style.height).toBe("2%");
    });

    it("gives each bar a readable figure on hover", async () => {
      mockDashboard(dashboard({ recent_periods: trend }));
      const { container } = renderPage();

      await screen.findByText("Net liability trend");
      // The bar itself only carries a height; the exact figure lives in the
      // tooltip, spelled out in full rather than the abbreviated axis label.
      expect(container.querySelector(".chart-bar")).toHaveAttribute(
        "title",
        "February 2026: ₹4,000.00",
      );
    });
  });

  describe("the period picker", () => {
    it("refetches for the chosen period", async () => {
      vi.setSystemTime(new Date(2026, 4, 1));
      mockDashboard(dashboard());
      renderPage();
      await screen.findByText(/Umang Traders/);

      await userEvent.selectOptions(screen.getByLabelText("Period"), "2026-03");

      await waitFor(() =>
        expect(global.fetch.mock.calls.at(-1)[0]).toContain("period=2026-03"),
      );
      vi.useRealTimers();
    });

    it("keeps the previous figures on screen while the new period loads", async () => {
      // Replacing a populated dashboard with skeletons reads as "your data is
      // gone"; the page dims instead and marks itself busy.
      vi.setSystemTime(new Date(2026, 4, 1));
      mockDashboard(dashboard());
      const { container } = renderPage();
      await screen.findByText(/Umang Traders/);

      let release;
      global.fetch = vi.fn(
        () => new Promise((resolve) => {
          release = () => resolve({
            ok: true,
            status: 200,
            statusText: "",
            text: async () => JSON.stringify(dashboard({ period: "2026-03" })),
          });
        }),
      );
      await userEvent.selectOptions(screen.getByLabelText("Period"), "2026-03");

      await waitFor(() =>
        expect(container.querySelector(".page")).toHaveAttribute("aria-busy", "true"),
      );
      expect(screen.getByText(/Umang Traders/)).toBeInTheDocument();

      release();
      vi.useRealTimers();
    });
  });
});
