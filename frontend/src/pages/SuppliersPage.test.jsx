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
});
