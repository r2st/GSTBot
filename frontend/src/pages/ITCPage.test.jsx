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
    rule_37_reavailment: heads(),
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

/**
 * The s.16(4) answer, defaulting to nothing outstanding.
 *
 * An empty `years` renders no panel at all, which is what every existing test
 * on this page is entitled to see — none of them are about credit expiring, and
 * a default carrying a year would put unexpected rupee figures into assertions
 * about the period's own position.
 */
function lapsing(overrides = {}) {
  return {
    years: [],
    total_at_risk: "0.00",
    total_expired: "0.00",
    lead_days: 90,
    ...overrides,
  };
}

function lapsingYear(overrides = {}) {
  return {
    financial_year: "2024-25",
    deadline: "2025-11-30",
    days_remaining: 45,
    expired: false,
    tax: { igst: "9000.00", cgst: "0.00", sgst: "0.00", cess: "0.00", total: "9000.00" },
    invoice_count: 4,
    periods: ["2024-07", "2024-08"],
    ...overrides,
  };
}

function mockApi(body, { status = 200, lapsing: lapsingBody = lapsing() } = {}) {
  global.fetch = vi.fn(async (url) => {
    // Routed by URL: the page asks for the period summary and the s.16(4)
    // position independently, and answering both with the same body would let a
    // test pass on a panel reading the wrong endpoint's data.
    if (String(url).includes("/itc/lapsing")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify(lapsingBody),
      };
    }
    return {
      ok: status < 400,
      status,
      statusText: status < 400 ? "OK" : "Error",
      text: async () => JSON.stringify(body),
    };
  });
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

  it("keeps a reversal row usable when the parser named nothing on the invoice", async () => {
    // Rule 37 reverses on the invoice date and the payment date, both of which
    // the matcher has regardless of what the extraction read off the scan. So
    // this row is raised for invoices with no number and no supplier — and it
    // is the row that costs real money to ignore, so it has to stay clickable.
    mockApi(
      summary({
        rule_37: {
          overdue: [
            {
              invoice_id: 41,
              invoice_number: null,
              supplier_gstin: null,
              supplier_name: null,
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

    const link = await screen.findByRole("link", { name: "(no number)" });
    expect(link).toHaveAttribute("href", "/invoices/41");
    // Name over GSTIN, with neither read: a dash, and no "null" beneath it.
    expect(link.closest("tr").querySelectorAll("td")[2].textContent).toBe("—");
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
    mockApi({ detail: "This business has been deactivated. Contact support to reactivate it." }, { status: 403 });
    renderPage();

    expect(await screen.findByText("This business has been deactivated. Contact support to reactivate it.")).toBeInTheDocument();
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
            // The s.16(4) panel fetches once on mount and never follows the
            // picker, so it is answered immediately and kept out of `pending`.
            // The ordering under test is between two *period* summaries, and
            // these tests answer them by index — an unrelated entry would move
            // every index they name.
            if (String(url).includes("/itc/lapsing")) {
              resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () => JSON.stringify(lapsing()),
              });
              return;
            }
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

describe("Rule 37's re-availment", () => {
  // A reversal with no way back is a permanent overstatement of tax, and the
  // figure that undoes it has to be visible on the screen that showed the
  // reversal — otherwise the credit reappears in the 3B with nothing on any
  // screen explaining where it came from.

  it("shows the credit taken back when a supplier is finally paid", async () => {
    mockApi(summary({ rule_37_reavailment: heads({ igst: "18000.00" }) }));
    render(
      <MemoryRouter>
        <ITCPage />
      </MemoryRouter>,
    );

    const row = (await screen.findByText("Re-availed: suppliers paid")).closest("tr");
    expect(within(row).getAllByText("₹18,000.00")).not.toHaveLength(0);
    expect(
      screen.getByText(/Credit an earlier return reversed under Rule 37/),
    ).toBeInTheDocument();
  });

  it("keeps the row off a month that re-availed nothing", async () => {
    // Most months trigger no re-availment at all, and a row of zeros beside
    // the two figures read on every load is furniture.
    mockApi(summary());
    render(
      <MemoryRouter>
        <ITCPage />
      </MemoryRouter>,
    );

    await screen.findAllByText("Credit available");
    expect(screen.queryByText("Re-availed: suppliers paid")).not.toBeInTheDocument();
  });
});

describe("purchases that carry no credit", () => {
  // "Credit available" is built from the period's purchases, but not from all
  // of them: an invoice that is exempt, nil-rated or blocked under s.17(5) had
  // tax on it that is simply not creditable. Without saying so, the figure
  // looks too low for the number of invoices behind it, and the obvious
  // reading — that something was missed in the books — is the wrong one.

  it("says how many of the period's invoices carry none", async () => {
    mockApi(summary({ invoice_count: 9, unclaimed_count: 2 }));
    render(
      <MemoryRouter>
        <ITCPage />
      </MemoryRouter>,
    );

    const help = await screen.findByText(
      "9 purchase invoices, 2 carrying no claimable credit",
    );
    // Under the figure it qualifies, not loose on the page.
    expect(within(help.closest("tr")).getByText("Credit available")).toBeInTheDocument();
  });

  it("says nothing extra when every invoice carries credit", async () => {
    // The common month. A trailing ", 0 carrying no claimable credit" on every
    // load is noise, and reads as a finding when it is the absence of one.
    mockApi(summary({ invoice_count: 3, unclaimed_count: 0 }));
    render(
      <MemoryRouter>
        <ITCPage />
      </MemoryRouter>,
    );

    const help = await screen.findByText("3 purchase invoices");
    expect(within(help.closest("tr")).getByText("Credit available")).toBeInTheDocument();
    expect(screen.queryByText(/carrying no claimable credit/)).not.toBeInTheDocument();
  });
});

describe("a summary missing the fields a newer backend added", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("falls back to the set-off's own cash figure when there is no combined one", async () => {
    // `cash_payable` is the whole of it — the waterfall's residue plus the
    // reverse-charge tax credit may not settle. An API that predates it still
    // sends `set_off.total_cash`, and half the answer is better than a tile
    // reading "₹0.00" on a period with money owing.
    mockApi(summary({ cash_payable: null }));
    const { container } = renderPage();

    await loaded();
    expect(statCard(container, "Cash to pay")).toHaveTextContent("₹2,000.00");
  });

  it("reads a period with nothing to pay as good rather than as a warning", async () => {
    mockApi(
      summary({
        output_tax: heads(),
        cash_payable: "0.00",
        set_off: {
          steps: [{ credit_head: "igst", liability_head: "igst", amount: "0.00" }],
          cash_payable: heads(),
          credit_carried_forward: heads({ igst: "18000.00" }),
          credit_used: heads(),
          total_cash: "0.00",
        },
      }),
    );
    const { container } = renderPage();

    await loaded();
    expect(statCard(container, "Cash to pay")).toHaveClass("tone-good");
  });

  it("leaves the re-availment row out when the field is absent, not just zero", async () => {
    // The row is conditional on there being some. `undefined > 0` is false by
    // luck rather than by intent, so the `?? 0` is what actually decides it —
    // and an absent field must read as "none", never as a row of blanks.
    mockApi(summary({ rule_37_reavailment: null }));
    const { container } = renderPage();

    await loaded();
    const table = container.querySelector("table");
    expect(within(table).queryByText("Re-availed: suppliers paid")).not.toBeInTheDocument();
    // The rows either side of it, which are read every month, are still there.
    expect(within(table).getByText("Credit available")).toBeInTheDocument();
    expect(within(table).getByText("Less: reversals")).toBeInTheDocument();
  });
});

describe("a period whose liability no credit reaches", () => {
  it("says so rather than showing an empty list", async () => {
    // A first month of trading, or one where every rupee of credit was
    // reversed: there is liability and nothing to set against it. The set-off
    // panel is the screen's answer to "what do I actually pay", so an empty
    // list under its heading reads as a screen that failed to load rather than
    // as the answer — which is that the whole liability is payable in cash.
    mockApi(
      summary({
        available: heads(),
        net_available: heads(),
        set_off: {
          steps: [],
          cash_payable: heads({ igst: "20000.00" }),
          credit_carried_forward: heads(),
          credit_used: heads(),
          total_cash: "20000.00",
        },
        cash_payable: "20000.00",
      }),
    );
    render(
      <MemoryRouter>
        <ITCPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("No credit could be applied to this period’s liability."),
    ).toBeInTheDocument();
  });

  describe("credit that expires under section 16(4)", () => {
    const panel = () =>
      screen.findByRole("heading", { name: "Section 16(4) — credit that expires" });

    it("names the credit a financial year is about to lose for good", async () => {
      mockApi(summary(), { lapsing: lapsing({ years: [lapsingYear()], total_at_risk: "9000.00" }) });
      renderPage();

      await panel();
      const table = screen.getByRole("region", {
        name: "Credit approaching its section 16(4) deadline",
      });
      expect(within(table).getByText("2024-25")).toBeInTheDocument();
      expect(within(table).getByText("45d left")).toBeInTheDocument();
      // The row's own figure. It repeats in the total beneath the table, which
      // is why this is scoped rather than asked of the whole page.
      expect(within(table).getByText("₹9,000.00")).toBeInTheDocument();
    });

    it("names a year already lost rather than counting down past zero", async () => {
      // An expired year is the most important row here, not the least — a
      // negative countdown would read as a deadline still worth chasing.
      mockApi(summary(), {
        lapsing: lapsing({
          years: [lapsingYear({ expired: true, days_remaining: -12, financial_year: "2022-23" })],
          total_expired: "9000.00",
        }),
      });
      renderPage();

      await panel();
      expect(screen.getByText("Lapsed")).toBeInTheDocument();
      expect(screen.queryByText("-12d left")).not.toBeInTheDocument();
    });

    it("says which returns to file, not just how much is at stake", async () => {
      // The amount without the task is a warning; the periods are what make it
      // something a business can act on, which is why the API returns them.
      mockApi(summary(), { lapsing: lapsing({ years: [lapsingYear()] }) });
      renderPage();

      await panel();
      expect(screen.getByText("July 2024, August 2024")).toBeInTheDocument();
    });

    it("copes with a year that has no unfiled period left to name", async () => {
      mockApi(summary(), { lapsing: lapsing({ years: [lapsingYear({ periods: [] })] }) });
      renderPage();

      await panel();
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("stays out of the way entirely when nothing is expiring", async () => {
      mockApi(summary());
      renderPage();

      await screen.findByRole("heading", { name: "Rule 37 — unpaid suppliers" });
      expect(
        screen.queryByRole("heading", { name: "Section 16(4) — credit that expires" }),
      ).not.toBeInTheDocument();
    });

    it("survives a period whose own summary could not be loaded", async () => {
      // The whole point of fetching it separately: a lapsing deadline is the
      // one figure on this screen that cannot be recovered later, so it must
      // not be hidden by an unrelated failure on the month being viewed.
      mockApi(summary(), {
        status: 500,
        lapsing: lapsing({ years: [lapsingYear()], total_at_risk: "9000.00" }),
      });
      renderPage();

      expect(await panel()).toBeInTheDocument();
      const table = screen.getByRole("region", {
        name: "Credit approaching its section 16(4) deadline",
      });
      expect(within(table).getByText("₹9,000.00")).toBeInTheDocument();
    });

    it("does not raise a banner when only the lapsing panel fails", async () => {
      global.fetch = vi.fn(async (url) => {
        if (String(url).includes("/itc/lapsing")) {
          return { ok: false, status: 500, statusText: "Error", text: async () => "{}" };
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(summary()),
        };
      });
      renderPage();

      await screen.findByRole("heading", { name: "Rule 37 — unpaid suppliers" });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("asks for the whole register rather than the month on screen", async () => {
      // s.16(4) governs a financial year, and the credit closest to being lost
      // is on invoices from a year the picker cannot reach.
      const user = userEvent.setup();
      mockApi(summary(), { lapsing: lapsing({ years: [lapsingYear()] }) });
      renderPage();

      await panel();
      const asked = global.fetch.mock.calls.filter(([url]) =>
        String(url).includes("/itc/lapsing"),
      );
      expect(asked).toHaveLength(1);
      expect(String(asked[0][0])).toBe("/api/v1/itc/lapsing");

      const select = await screen.findByLabelText("Period");
      await user.selectOptions(select, select.options[1].value);

      await waitFor(() =>
        expect(
          global.fetch.mock.calls.filter(([url]) => String(url).includes("/itc/lapsing")),
        ).toHaveLength(1),
      );
    });
  });
});
