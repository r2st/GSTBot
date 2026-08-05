import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersPage from "./SuppliersPage";

function supplier(overrides = {}) {
  return {
    id: 1,
    gstin: "29AAGCB7383J1Z4",
    legal_name: "Northwind Supplies Pvt Ltd",
    trade_name: "Northwind",
    state_code: "29",
    compliance_score: 92,
    risk_level: "low",
    total_invoices: 24,
    matched_invoices: 22,
    mismatched_invoices: 1,
    missing_invoices: 1,
    late_filings: 0,
    last_filed_period: "2026-04",
    last_seen_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function scoreDetail(overrides = {}) {
  return {
    gstin: "29AAGCB7383J1Z4",
    score: 92,
    risk_level: "low",
    confidence: 0.85,
    components: [
      {
        name: "match_rate",
        score: 93.75,
        weight: 50,
        detail: "22 matched, 1 mismatched, 1 never filed, of 24",
      },
      { name: "timeliness", score: 100, weight: 20, detail: "Files on the due date" },
      {
        name: "consistency",
        score: 88,
        weight: 20,
        detail: "Match rate varies by 6 points across 3 periods",
      },
      { name: "recency", score: null, weight: 10, detail: "Never seen filing" },
    ],
    observations: [
      { period: "2026-02", matched: 6, mismatched: 0, missing: 1, filing_delay_days: 4 },
      { period: "2026-03", matched: 8, mismatched: 1, missing: 0, filing_delay_days: 0 },
      { period: "2026-04", matched: 8, mismatched: 0, missing: 0, filing_delay_days: null },
    ],
    invoices_observed: 24,
    periods_observed: 3,
    recommended_provision_pct: 6.8,
    recommendation: "Broadly reliable. Hold 6.8% of the credit until the 2B confirms it.",
    ...overrides,
  };
}

function detail(overrides = {}) {
  return {
    ...supplier(),
    score_detail: scoreDetail(),
    exposure: {
      invoice_count: 24,
      tax_total: "180000.00",
      tax_at_risk: "9000.00",
      unpaid_count: 2,
    },
    ...overrides,
  };
}

/**
 * Route by URL: the list refetches on every filter and search keystroke, and
 * the detail and rescore calls interleave with it.
 */
function mockApi({ items = [supplier()], detail: one = detail(), rescored = 3, fail } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    const target = String(url);
    const json = (body, status = 200) => ({
      ok: status < 400,
      status,
      statusText: status < 400 ? "OK" : "Error",
      text: async () => JSON.stringify(body),
    });

    if (fail) return json({ detail: fail.message }, fail.status);
    if (options.method === "POST" && target.includes("/suppliers/rescore")) {
      return json({ rescored, items: [] });
    }
    if (/\/suppliers\/\d+/.test(target)) return json(one);
    return json({ items, total: items.length });
  });
}

const renderPage = () => render(<SuppliersPage />);

/** Resolves once the list has replaced the loading placeholder. */
const loaded = (total = 1) =>
  screen.findByRole("heading", { name: `${total} supplier${total === 1 ? "" : "s"}` });

describe("SuppliersPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("lists a supplier with its risk band and counts", async () => {
    mockApi();
    renderPage();

    await loaded();
    expect(screen.getByText("Low risk")).toBeInTheDocument();
    expect(screen.getByText("Northwind Supplies Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("29AAGCB7383J1Z4")).toBeInTheDocument();
    // The score renders as a meter, labelled for anyone not seeing the bar.
    expect(screen.getByRole("img", { name: "92 out of 100" })).toBeInTheDocument();
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("distinguishes an unrated supplier from a badly rated one", async () => {
    mockApi({
      items: [
        supplier({
          id: 2,
          compliance_score: null,
          risk_level: "unknown",
          last_filed_period: null,
        }),
      ],
    });
    renderPage();

    await loaded();
    // Scoped to the row: "Unrated" is also one of the filter buttons.
    const row = within(screen.getByRole("table"));
    expect(row.getByText("Unrated")).toBeInTheDocument();
    // Never an empty bar, which would read as a score of zero.
    expect(row.getByText("No evidence yet")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /out of 100/ })).not.toBeInTheDocument();
  });

  it("explains an empty register rather than showing a bare table", async () => {
    mockApi({ items: [] });
    renderPage();

    await loaded(0);
    expect(screen.getByText(/No suppliers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens the breakdown behind a supplier's score", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Details" }));

    const panel = (
      await screen.findByRole("heading", { name: "How the score is made up" })
    ).closest("section");

    expect(within(panel).getByText("Match rate")).toBeInTheDocument();
    expect(within(panel).getByText("Filing timeliness")).toBeInTheDocument();
    expect(
      within(panel).getByText("22 matched, 1 mismatched, 1 never filed, of 24"),
    ).toBeInTheDocument();
    // Confidence and the provisioning advice are the point of the panel.
    expect(within(panel).getByText("85%")).toBeInTheDocument();
    expect(within(panel).getByText("6.8%")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Hold 6.8% of the credit until the 2B confirms it/),
    ).toBeInTheDocument();
  });

  it("shows a component with no evidence as unscored, not as zero", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Details" }));

    const panel = (
      await screen.findByRole("heading", { name: "How the score is made up" })
    ).closest("section");
    // Recency has never been observed; it must not render a zero-width bar.
    expect(within(panel).getByText("Never seen filing")).toBeInTheDocument();
    expect(within(panel).getByText("No evidence yet")).toBeInTheDocument();
  });

  it("reports the filing history newest first", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Details" }));

    const history = (await screen.findByRole("heading", { name: "Filing history" }))
      .nextElementSibling;
    const periods = within(history)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.cells[0].textContent);
    expect(periods).toEqual(["April 2026", "March 2026", "February 2026"]);

    expect(within(history).getByText("4 days late")).toBeInTheDocument();
    expect(within(history).getByText("On time")).toBeInTheDocument();
    // An unknown filing date is a dash, not "on time".
    expect(within(history).getByText("—")).toBeInTheDocument();
  });

  it("shows the credit currently resting on a supplier", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Details" }));

    const exposure = (await screen.findByRole("heading", { name: "Exposure right now" }))
      .nextElementSibling;
    expect(within(exposure).getByText("₹9000.00")).toBeInTheDocument();
    expect(within(exposure).getByText("2")).toBeInTheDocument();
  });

  it("closes the detail panel again", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Details" }));
    await screen.findByRole("heading", { name: "How the score is made up" });

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("heading", { name: "How the score is made up" }),
    ).not.toBeInTheDocument();
  });

  it("filters the list by risk band", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "High risk" }));

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain("risk_level=high"),
    );

    // "All" clears the filter rather than sending an empty parameter.
    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).not.toContain("risk_level"),
    );
  });

  it("searches by name or GSTIN", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.type(screen.getByRole("searchbox"), "north");

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain("search=north"),
    );
  });

  describe("a search the user is still typing into", () => {
    /**
     * A fetch that hands each request back to the test instead of answering it.
     *
     * The bug this covers is an ordering one, so the test has to be able to
     * answer the *second* request before the first. A mock that resolves on its
     * own can only ever answer them in order, which is the one case that was
     * never broken.
     */
    function deferredFetch() {
      const pending = [];
      global.fetch = vi.fn(
        (url, options = {}) =>
          new Promise((resolve, reject) => {
            const entry = {
              url: String(url),
              signal: options.signal,
              answer: (body) =>
                resolve({
                  ok: true,
                  status: 200,
                  statusText: "OK",
                  text: async () => JSON.stringify(body),
                }),
            };
            // Rejecting the way the real thing does: an aborted fetch does not
            // resolve with a partial answer, it rejects with an AbortError.
            options.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
            pending.push(entry);
          }),
      );
      return pending;
    }

    const named = (name) => supplier({ id: name.length, legal_name: name });

    it("abandons the request the next keystroke supersedes", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer({ items: [named("Northwind Supplies Pvt Ltd")], total: 1 });
      await loaded();

      await user.type(screen.getByRole("searchbox"), "no");
      await waitFor(() => expect(pending.length).toBeGreaterThan(2));

      // Everything before the newest request has been called off. Each of them
      // describes a search term the box no longer holds.
      const superseded = pending.slice(1, -1);
      expect(superseded.length).toBeGreaterThan(0);
      superseded.forEach((request) => expect(request.signal.aborted).toBe(true));
      expect(pending.at(-1).signal.aborted).toBe(false);
    });

    it("does not let a slow earlier answer overwrite a newer one", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer({ items: [named("Northwind Supplies Pvt Ltd")], total: 1 });
      await loaded();

      await user.type(screen.getByRole("searchbox"), "no");
      await waitFor(() => expect(pending.length).toBeGreaterThan(2));

      // The newest request answers first, which is the whole point: responses
      // do not come back in the order they were sent.
      const newest = pending.at(-1);
      expect(newest.url).toContain("search=no");
      newest.answer({ items: [named("Nordic Tooling")], total: 1 });
      await screen.findByText("Nordic Tooling");

      // Now the request for "n" finally lands. It was aborted, so its answer
      // never reaches the page — before this, it repainted the table with rows
      // for a term the search box had already moved past.
      pending[1].answer({ items: [named("Ansel Metals"), named("Bharat Cables")], total: 2 });

      await waitFor(() => expect(screen.getByText("Nordic Tooling")).toBeInTheDocument());
      expect(screen.queryByText("Ansel Metals")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "1 supplier" })).toBeInTheDocument();
    });

    it("does not raise an error banner for a request it cancelled itself", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer({ items: [named("Northwind Supplies Pvt Ltd")], total: 1 });
      await loaded();

      await user.type(screen.getByRole("searchbox"), "no");
      await waitFor(() => expect(pending.length).toBeGreaterThan(2));
      pending.at(-1).answer({ items: [named("Nordic Tooling")], total: 1 });

      await screen.findByText("Nordic Tooling");
      // "signal is aborted without reason" in front of someone who simply kept
      // typing would be worse than the stale rows the abort exists to prevent.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("rescores every supplier and reloads the list", async () => {
    const user = userEvent.setup();
    mockApi({ rescored: 3 });
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Rescore all" }));

    expect(await screen.findByText("Rescored 3 supplier(s)")).toBeInTheDocument();
    const posted = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
    expect(posted[0]).toContain("/suppliers/rescore");
    // The list is refetched afterwards, so the screen reflects the new scores.
    expect(global.fetch.mock.calls.at(-1)[0]).toContain("/suppliers");
    expect(global.fetch.mock.calls.at(-1)[1]?.method ?? "GET").toBe("GET");
  });

  it("surfaces an API failure", async () => {
    mockApi({ fail: { status: 403, message: "Business is inactive" } });
    renderPage();

    expect(await screen.findByText("Business is inactive")).toBeInTheDocument();
  });

  /**
   * The list loads, and a later call fails. `mockApi`'s `fail` breaks every
   * request, which would never get us past the placeholder — so these route
   * the failure at one URL and leave the rest working.
   */
  describe("when a follow-up call fails after the list is on screen", () => {
    function mockApiFailing(predicate, { status = 500, message = "Server error" } = {}) {
      global.fetch = vi.fn(async (url, options = {}) => {
        const target = String(url);
        const json = (body, code = 200) => ({
          ok: code < 400,
          status: code,
          statusText: code < 400 ? "OK" : "Error",
          text: async () => JSON.stringify(body),
        });

        if (predicate(target, options)) return json({ detail: message }, status);
        if (options.method === "POST" && target.includes("/suppliers/rescore")) {
          return json({ rescored: 3, items: [] });
        }
        if (/\/suppliers\/\d+/.test(target)) return json(detail());
        return json({ items: [supplier()], total: 1 });
      });
    }

    it("keeps the list when one supplier's detail cannot be opened", async () => {
      const user = userEvent.setup();
      mockApiFailing((url) => /\/suppliers\/\d+/.test(url), {
        status: 404,
        message: "Supplier not found",
      });
      renderPage();

      await loaded();
      await user.click(screen.getByRole("button", { name: "Details" }));

      expect(await screen.findByText("Supplier not found")).toBeInTheDocument();
      // The row it was opened from is still there — a failed drill-down must
      // not take the register with it.
      expect(screen.getByText("Northwind Supplies Pvt Ltd")).toBeInTheDocument();
    });

    it("reports a rescore that did not run", async () => {
      const user = userEvent.setup();
      mockApiFailing(
        (url, options) => options.method === "POST" && url.includes("/suppliers/rescore"),
        { status: 503, message: "Scoring is backed up, try again shortly" },
      );
      renderPage();

      await loaded();
      await user.click(screen.getByRole("button", { name: "Rescore all" }));

      expect(
        await screen.findByText("Scoring is backed up, try again shortly"),
      ).toBeInTheDocument();
      // No success notice alongside the error, and the button is usable again.
      expect(screen.queryByText(/Rescored/)).not.toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Rescore all" })).not.toBeDisabled(),
      );
    });
  });

  describe("the last-filed column", () => {
    it("falls back to when the supplier was last seen if they have never filed", async () => {
      mockApi({
        items: [supplier({ last_filed_period: null, last_seen_at: "2026-03-09" })],
      });
      renderPage();

      await loaded();
      expect(screen.getByText("09 Mar 2026")).toBeInTheDocument();
    });

    it("shows a dash for a supplier that has neither filed nor been seen", async () => {
      mockApi({ items: [supplier({ last_filed_period: null, last_seen_at: null })] });
      renderPage();

      await loaded();
      const row = screen.getByText("29AAGCB7383J1Z4").closest("tr");
      expect(within(row).getByText("—")).toBeInTheDocument();
    });
  });
});
