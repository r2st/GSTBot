import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ITCPage from "./ITCPage";

const PERIOD = "2026-04";

function heads({ igst = "0.00", cgst = "0.00", sgst = "0.00", cess = "0.00" } = {}) {
  const total = [igst, cgst, sgst, cess]
    .reduce((sum, value) => sum + Number(value), 0)
    .toFixed(2);
  return { igst, cgst, sgst, cess, total };
}

function summary(overrides = {}) {
  return {
    period: PERIOD,
    available: heads({ igst: "18000.00" }),
    output_tax: heads({ igst: "20000.00" }),
    rule_37: {
      overdue: [],
      approaching: [],
      reversal: heads(),
      approaching_amount: heads(),
      days: 180,
      warning_days: 30,
    },
    proportionate: {
      exempt_turnover: "0.00",
      total_turnover: "1000000.00",
      exempt_ratio: "0.000000",
      common_credit: heads({ igst: "18000.00" }),
      rule_42_reversal: heads(),
      capital_credit: heads(),
      capital_credit_this_month: heads(),
      rule_43_reversal: heads(),
      total_reversal: heads(),
      capital_months: 60,
    },
    total_reversal: heads(),
    net_available: heads({ igst: "18000.00" }),
    set_off: {
      steps: [{ credit_head: "igst", liability_head: "igst", amount: "18000.00" }],
      cash_payable: heads({ igst: "2000.00" }),
      credit_carried_forward: heads(),
      credit_used: heads({ igst: "18000.00" }),
      total_cash: "2000.00",
    },
    itc_at_risk: "0.00",
    reconciled: true,
    invoice_count: 3,
    unclaimed_count: 0,
    ...overrides,
  };
}

function mockApi(body, { status = 200 } = {}) {
  global.fetch = vi.fn(async () => ({
    ok: status < 400,
    status,
    statusText: status < 400 ? "OK" : "Error",
    text: async () => JSON.stringify(body),
  }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ITCPage />
    </MemoryRouter>,
  );
}

/**
 * The headline figures repeat further down the page — "Credit available" is
 * both a tile and a row of the by-head table — so tile assertions have to name
 * the tile rather than the text.
 */
function statCard(container, label) {
  const card = [...container.querySelectorAll(".stat-card")].find(
    (node) => node.querySelector(".stat-label")?.textContent === label,
  );
  if (!card) throw new Error(`no stat card labelled "${label}"`);
  return card;
}

/** Resolves once the summary has replaced the loading placeholder. */
const loaded = () => screen.findByRole("heading", { name: "Position by tax head" });

describe("ITCPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("shows the headline credit and cash position", async () => {
    mockApi(summary());
    const { container } = renderPage();

    await loaded();
    expect(statCard(container, "Credit available")).toHaveTextContent("₹18,000.00");
    expect(statCard(container, "Cash to pay")).toHaveTextContent("₹2,000.00");
  });

  it("warns when the period has not been reconciled", async () => {
    mockApi(summary({ reconciled: false }));
    renderPage();

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(/No reconciliation has been run/i);
    expect(within(banner).getByRole("link", { name: /reconcile the period/i })).toHaveAttribute(
      "href",
      "/reconcile",
    );
  });

  it("does not warn once the period is reconciled", async () => {
    mockApi(summary({ reconciled: true }));
    renderPage();

    await loaded();
    expect(screen.queryByText(/No reconciliation has been run/i)).not.toBeInTheDocument();
  });

  it("spells out how the credit was set off", async () => {
    mockApi(summary());
    renderPage();

    expect(
      await screen.findByText(/IGST credit → IGST liability/),
    ).toBeInTheDocument();
  });

  it("explains that CGST credit cannot settle SGST", async () => {
    mockApi(summary());
    renderPage();

    expect(
      await screen.findByText(/CGST credit can never settle SGST/i),
    ).toBeInTheDocument();
  });

  it("lists invoices whose credit has reversed under Rule 37", async () => {
    mockApi(
      summary({
        rule_37: {
          overdue: [
            {
              invoice_id: 11,
              invoice_number: "OLD-1",
              supplier_gstin: "29AAGCB7383J1Z4",
              supplier_name: "Northwind Supplies",
              invoice_date: "2025-06-01",
              days_outstanding: 333,
              days_remaining: -153,
              tax: heads({ igst: "18000.00" }),
              overdue: true,
            },
          ],
          approaching: [],
          reversal: heads({ igst: "18000.00" }),
          approaching_amount: heads(),
          days: 180,
          warning_days: 30,
        },
      }),
    );
    renderPage();

    expect(await screen.findByText("Reversed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OLD-1" })).toHaveAttribute(
      "href",
      "/invoices/11",
    );
    expect(screen.getByText("333 outstanding")).toBeInTheDocument();
  });

  it("flags invoices approaching the 180-day deadline differently", async () => {
    mockApi(
      summary({
        rule_37: {
          overdue: [],
          approaching: [
            {
              invoice_id: 12,
              invoice_number: "SOON-1",
              supplier_gstin: "29AAGCB7383J1Z4",
              supplier_name: "Northwind",
              invoice_date: "2026-01-01",
              days_outstanding: 160,
              days_remaining: 20,
              tax: heads({ igst: "9000.00" }),
              overdue: false,
            },
          ],
          reversal: heads(),
          approaching_amount: heads({ igst: "9000.00" }),
          days: 180,
          warning_days: 30,
        },
      }),
    );
    renderPage();

    expect(await screen.findByText("Due soon")).toBeInTheDocument();
    expect(screen.getByText("20 left")).toBeInTheDocument();
  });

  it("says so plainly when nothing is outstanding", async () => {
    mockApi(summary());
    renderPage();

    expect(
      await screen.findByText(/Nothing outstanding past the deadline/i),
    ).toBeInTheDocument();
  });

  it("shows the exempt share driving the Rule 42 reversal", async () => {
    mockApi(
      summary({
        proportionate: {
          ...summary().proportionate,
          exempt_turnover: "250000.00",
          total_turnover: "1000000.00",
          exempt_ratio: "0.250000",
          rule_42_reversal: heads({ igst: "4500.00" }),
          total_reversal: heads({ igst: "4500.00" }),
        },
        total_reversal: heads({ igst: "4500.00" }),
      }),
    );
    renderPage();

    expect(await screen.findByText("25.00%")).toBeInTheDocument();
  });

  it("surfaces an API failure", async () => {
    mockApi({ detail: "Business is inactive" }, { status: 403 });
    renderPage();

    expect(await screen.findByText("Business is inactive")).toBeInTheDocument();
  });

  it("reloads when the period changes", async () => {
    const user = userEvent.setup();
    mockApi(summary());
    renderPage();

    await loaded();
    expect(global.fetch.mock.calls[0][0]).toContain("/itc?period=");

    const select = screen.getByLabelText("Period");
    // The month before the default, whenever the suite happens to run.
    const previous = select.options[1].value;
    await user.selectOptions(select, previous);

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain(`/itc?period=${previous}`),
    );
  });
});
