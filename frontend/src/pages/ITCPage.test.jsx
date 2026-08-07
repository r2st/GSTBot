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
    rule_37_reversal: heads(),
    total_reversal: heads(),
    net_available: heads({ igst: "18000.00" }),
    set_off: {
      steps: [{ credit_head: "igst", liability_head: "igst", amount: "18000.00" }],
      cash_payable: heads({ igst: "2000.00" }),
      credit_carried_forward: heads(),
      credit_used: heads({ igst: "18000.00" }),
      total_cash: "2000.00",
    },
    reverse_charge: {
      taxable_value: "0.00",
      tax: heads(),
      credit: heads(),
      invoice_count: 0,
      cash_payable: "0.00",
    },
    cash_payable: "2000.00",
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

  it("asks for the reverse-charge tax as cash the credit cannot settle", async () => {
    mockApi(
      summary({
        reverse_charge: {
          taxable_value: "100000.00",
          tax: heads({ igst: "18000.00" }),
          credit: heads({ igst: "18000.00" }),
          invoice_count: 1,
          cash_payable: "18000.00",
        },
        cash_payable: "20000.00",
      }),
    );
    const { container } = renderPage();

    await loaded();
    // Not the set-off's ₹2,000: that waterfall settles output tax only.
    const card = statCard(container, "Cash to pay");
    expect(card).toHaveTextContent("₹20,000.00");
    expect(card).toHaveTextContent("Includes ₹18,000.00 on reverse charge");
    expect(screen.getByText("Reverse charge, in cash")).toBeInTheDocument();
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

  it("reverses this period's Rule 37 share, not the standing exposure", async () => {
    // An invoice that lapsed in an earlier month is still listed as overdue —
    // the credit is still gone — but this period's return does not give it
    // back a second time. Showing the running total in the reversal column
    // left it not adding up to the total on the row beneath it.
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
        rule_37_reversal: heads(),
        total_reversal: heads(),
      }),
    );
    renderPage();

    // The section heading carries the same words, so scope to the table cell.
    const cell = (await screen.findAllByText(/Rule 37 — unpaid suppliers/)).find(
      (element) => element.tagName === "TD",
    );
    const row = cell.closest("tr");
    expect(within(row).queryByText("₹18,000.00")).not.toBeInTheDocument();
    // The overdue invoice is still listed: the credit is gone, it was just
    // given back in an earlier month's return.
    expect(screen.getByRole("link", { name: "OLD-1" })).toBeInTheDocument();
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

  describe("when answers come back out of order", () => {
    /**
     * A fetch that hands back the levers instead of resolving on its own.
     *
     * The bug here is an ordering one, so the test has to be able to answer the
     * second request before the first. A mock that resolves by itself can only
     * ever answer them in order, which is the one case that was never broken.
     */
    function deferredFetch() {
      const pending = [];
      global.fetch = vi.fn(
        (url, options = {}) =>
          new Promise((resolve, reject) => {
            pending.push({
              url: String(url),
              signal: options.signal,
              answer: (body) =>
                resolve({
                  ok: true,
                  status: 200,
                  statusText: "OK",
                  text: async () => JSON.stringify(body),
                }),
            });
            // An aborted fetch does not resolve with a partial answer; it
            // rejects with an AbortError, so the mock has to as well.
            options.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      return pending;
    }

    /** Steps the picker back `count` months, one selection at a time. */
    async function stepBack(user, pending, count) {
      const select = screen.getByLabelText("Period");
      for (let step = 1; step <= count; step += 1) {
        await user.selectOptions(select, select.options[step].value);
        await waitFor(() => expect(pending).toHaveLength(step + 1));
      }
    }

    it("abandons the request the newer period supersedes", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(summary());
      await loaded();

      await stepBack(user, pending, 2);

      // The month in the middle was called off the moment the next one was
      // asked for. Only the request describing the selected period is live.
      expect(pending[1].signal.aborted).toBe(true);
      expect(pending[2].signal.aborted).toBe(false);
    });

    it("does not put one month's credit under another month's heading", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      const { container } = renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(summary());
      await loaded();

      await stepBack(user, pending, 2);

      // The newest request answers first, which is the whole point: responses
      // do not come back in the order they were sent.
      pending[2].answer(
        summary({
          set_off: {
            ...summary().set_off,
            cash_payable: heads({ igst: "500.00" }),
            total_cash: "500.00",
          },
          cash_payable: "500.00",
        }),
      );
      await waitFor(() =>
        expect(statCard(container, "Cash to pay")).toHaveTextContent("₹500.00"),
      );

      // Now the abandoned month finally lands. Before this it repainted the
      // claimable credit, the reversals and the cash payable, leaving one
      // month's position on screen under the period picker showing another.
      pending[1].answer(
        summary({
          set_off: {
            ...summary().set_off,
            cash_payable: heads({ igst: "64000.00" }),
            total_cash: "64000.00",
          },
          cash_payable: "64000.00",
        }),
      );

      await waitFor(() =>
        expect(statCard(container, "Cash to pay")).toHaveTextContent("₹500.00"),
      );
      expect(screen.queryByText("₹64,000.00")).not.toBeInTheDocument();
    });

    it("does not raise an error banner for a request it cancelled itself", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(summary());
      await loaded();

      await stepBack(user, pending, 2);
      pending[2].answer(summary());

      await loaded();
      // "signal is aborted without reason" in front of someone who simply
      // changed month would be worse than the stale figures the abort exists
      // to prevent.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
