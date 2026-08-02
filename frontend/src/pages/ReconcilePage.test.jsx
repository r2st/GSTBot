import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReconcilePage from "./ReconcilePage";

const PERIOD = "2026-04";

function imported(overrides = {}) {
  return {
    id: 1,
    period: PERIOD,
    return_type: "gstr2b",
    status: "imported",
    invoice_count: 2,
    total_taxable_value: "550000.00",
    total_cgst: "0.00",
    total_sgst: "0.00",
    total_igst: "99000.00",
    total_cess: "0.00",
    created_at: "2026-05-14T10:00:00Z",
    other_periods: [],
    replaced_previous: false,
    message: "Imported 2 invoices for 2026-04",
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    id: 7,
    period: PERIOD,
    status: "completed",
    total_invoices: 3,
    matched_count: 1,
    mismatched_count: 1,
    missing_in_2b_count: 1,
    missing_in_books_count: 1,
    duplicate_count: 0,
    itc_eligible: "72000.00",
    itc_at_risk: "90000.00",
    itc_claimed: "162000.00",
    started_at: "2026-05-14T10:01:00Z",
    completed_at: "2026-05-14T10:01:02Z",
    error: null,
    created_at: "2026-05-14T10:01:00Z",
    report: {
      tolerance: "1.00",
      findings: [
        {
          category: "matched",
          invoice_id: 11,
          invoice_number: "INV-2026-0042",
          supplier_gstin: "29AAGCB7383J1Z4",
          supplier_name: "Northwind Supplies",
          invoice_date: "2026-04-15",
          matched_on: "exact",
          differences: [],
          books: { taxable_value: "450000.00", total_tax: "81000.00" },
          gstr2b: { taxable_value: "450000.00", total_tax: "81000.00" },
        },
        {
          category: "mismatched",
          invoice_id: 12,
          invoice_number: "DH/451",
          supplier_gstin: "27AACCM6094J1Z3",
          supplier_name: "Deccan Hardware",
          invoice_date: "2026-04-18",
          matched_on: "exact",
          differences: [
            { field: "igst", books: "18000.00", gstr2b: "16200.00", delta: "1800.00" },
          ],
          books: { taxable_value: "100000.00", total_tax: "18000.00" },
          gstr2b: { taxable_value: "100000.00", total_tax: "16200.00" },
        },
        {
          category: "missing_in_2b",
          invoice_id: 13,
          invoice_number: "GHOST-1",
          supplier_gstin: "29AAGCB7383J1Z4",
          supplier_name: "Northwind Supplies",
          invoice_date: "2026-04-20",
          differences: [],
          books: { taxable_value: "500000.00", total_tax: "90000.00" },
        },
        {
          category: "missing_in_books",
          invoice_number: "UNBOOKED-9",
          supplier_gstin: "27AACCM6094J1Z3",
          supplier_name: "Deccan Hardware",
          invoice_date: "2026-04-22",
          note: "In GSTR-2B but not in the purchase register",
          differences: [],
          gstr2b: { taxable_value: "10000.00", total_tax: "1800.00" },
        },
      ],
    },
    ...overrides,
  };
}

/** Route fetches by URL so the page's two parallel loads resolve independently. */
function mockApi({ imported2b, latest, onPost } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    const ok = (body) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(body),
    });
    const notFound = () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => JSON.stringify({ detail: "Not found" }),
    });

    if (options.method === "POST") return ok(await onPost(url, options));
    if (url.includes("/gstr2b/")) return imported2b ? ok(imported2b) : notFound();
    if (url.includes("/latest")) return latest ? ok(latest) : notFound();
    return notFound();
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReconcilePage />
    </MemoryRouter>,
  );
}

describe("ReconcilePage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("tells a first-time user where to get the file", async () => {
    mockApi({});
    renderPage();

    expect(await screen.findByText(/No GSTR-2B imported yet/)).toBeInTheDocument();
    expect(screen.getByText(/Returns → GSTR-2B → Download/)).toBeInTheDocument();
  });

  it("cannot reconcile before a 2B exists", async () => {
    mockApi({});
    renderPage();

    await screen.findByText(/No GSTR-2B imported yet/);
    expect(screen.getByRole("button", { name: /Run reconciliation/ })).toBeDisabled();
  });

  it("enables reconciling once a 2B is imported", async () => {
    mockApi({ imported2b: imported() });
    renderPage();

    expect(await screen.findByText(/invoices imported/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run reconciliation/ })).toBeEnabled();
  });

  it("shows the ITC figures a run produced", async () => {
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    expect(await screen.findByText("₹72,000.00")).toBeInTheDocument();
    expect(screen.getByText("₹1,62,000.00")).toBeInTheDocument();
    // ITC at risk is ₹90,000 and so is the one unfiled invoice behind it, so
    // the figure legitimately appears in both the tile and the findings table.
    expect(screen.getAllByText("₹90,000.00").length).toBeGreaterThan(0);
  });

  it("lists every finding with its outcome", async () => {
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("DH/451")).toBeInTheDocument();
    expect(screen.getByText("GHOST-1")).toBeInTheDocument();
    expect(screen.getByText("UNBOOKED-9")).toBeInTheDocument();
  });

  it("names the field that differs on a mismatch", async () => {
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    const row = (await screen.findByText("DH/451")).closest("tr");
    expect(within(row).getByText("igst")).toBeInTheDocument();
    expect(within(row).getByText(/₹18,000.00 vs ₹16,200.00/)).toBeInTheDocument();
  });

  it("links a finding back to the invoice it is about", async () => {
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    const link = await screen.findByRole("link", { name: "INV-2026-0042" });
    expect(link).toHaveAttribute("href", "/invoices/11");
  });

  it("leaves a portal-only invoice unlinked, since it has no invoice of ours", async () => {
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    await screen.findByText("UNBOOKED-9");
    expect(screen.queryByRole("link", { name: "UNBOOKED-9" })).not.toBeInTheDocument();
  });

  it("filters the findings by outcome", async () => {
    const user = userEvent.setup();
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: /Missing in 2B \(1\)/ }));

    expect(screen.getByText("GHOST-1")).toBeInTheDocument();
    expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
    // The filter explains what the category means and what to do about it.
    expect(screen.getByText(/This credit is at risk until they file/)).toBeInTheDocument();
  });

  it("runs a reconciliation and shows the result", async () => {
    const user = userEvent.setup();
    mockApi({
      imported2b: imported(),
      onPost: async () => run(),
    });
    renderPage();

    await screen.findByText(/invoices imported/);
    await user.click(screen.getByRole("button", { name: /Run reconciliation/ }));

    expect(await screen.findByText("GHOST-1")).toBeInTheDocument();
    // The period is whichever month the picker defaults to, so this asserts
    // the confirmation shape rather than pinning the suite to a clock.
    expect(screen.getByText(/^Reconciled \w+ \d{4}$/)).toBeInTheDocument();
  });

  it("surfaces a failed run as the server explained it", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url, options = {}) => {
      if (options.method === "POST") {
        return {
          ok: false,
          status: 409,
          statusText: "Conflict",
          text: async () =>
            JSON.stringify({ detail: "No GSTR-2B has been imported for 2026-04." }),
        };
      }
      if (url.includes("/gstr2b/")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(imported()),
        };
      }
      return { ok: false, status: 404, statusText: "Not Found", text: async () => "{}" };
    });
    renderPage();

    await screen.findByText(/invoices imported/);
    await user.click(screen.getByRole("button", { name: /Run reconciliation/ }));

    expect(
      await screen.findByText(/No GSTR-2B has been imported for 2026-04/),
    ).toBeInTheDocument();
  });

  it("uploads a 2B and reports what the server made of it", async () => {
    const user = userEvent.setup();
    let posted = null;
    mockApi({
      onPost: async (url, options) => {
        posted = { url, body: options.body };
        return imported({ message: "Imported 2 invoices for 2026-04" });
      },
    });
    renderPage();

    await screen.findByText(/No GSTR-2B imported yet/);
    const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    await waitFor(() =>
      expect(screen.getByText("Imported 2 invoices for 2026-04")).toBeInTheDocument(),
    );
    expect(posted.url).toContain("/reconciliation/gstr2b/import");
    expect(posted.body).toBeInstanceOf(FormData);
    expect(posted.body.get("file").name).toBe("gstr2b.json");
  });

  it("follows the period the server read out of the file", async () => {
    const user = userEvent.setup();
    mockApi({
      onPost: async () =>
        imported({ period: "2026-02", message: "Imported 2 invoices for 2026-02" }),
    });
    renderPage();

    await screen.findByText(/No GSTR-2B imported yet/);
    const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    // The picker moves to the file's period rather than leaving a stale month
    // on screen next to the newly imported statement.
    await waitFor(() =>
      expect(screen.getByLabelText(/Period/)).toHaveValue("2026-02"),
    );
  });

  it("offers to replace rather than import once one exists", async () => {
    mockApi({ imported2b: imported() });
    renderPage();

    expect(await screen.findByText(/Replace GSTR-2B/)).toBeInTheDocument();
  });

  it("refuses an oversized 2B without asking the server", async () => {
    const user = userEvent.setup();
    let posted = false;
    mockApi({
      onPost: async () => {
        posted = true;
        return imported();
      },
    });
    renderPage();
    await screen.findByText(/No GSTR-2B imported yet/);

    const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 41 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/over the 15 MB limit/);
    expect(posted).toBe(false);
  });

  it("refuses an empty 2B file", async () => {
    const user = userEvent.setup();
    mockApi({});
    renderPage();
    await screen.findByText(/No GSTR-2B imported yet/);

    const file = new File([""], "gstr2b.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 0 });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/still be downloading/);
  });

  it("reloads the summary when the file was for the period on screen", async () => {
    // The period did not change, so nothing re-renders on its own — the page
    // has to refetch, or the freshly imported statement is invisible until a
    // manual reload.
    const user = userEvent.setup();
    const gstr2bGets = [];
    // The page opens on the current month, so the file has to come back
    // stamped with whatever that is for the periods to agree.
    const onScreen = () => screen.getByLabelText(/Period/).value;
    global.fetch = vi.fn(async (url, options = {}) => {
      const ok = (body) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify(body),
      });
      if (options.method === "POST") return ok(imported({ period: onScreen() }));
      if (String(url).includes("/gstr2b/")) {
        gstr2bGets.push(url);
        // Not imported on the first look, imported afterwards.
        return gstr2bGets.length === 1
          ? { ok: false, status: 404, statusText: "Not Found", text: async () => "{}" }
          : ok(imported({ period: onScreen() }));
      }
      return { ok: false, status: 404, statusText: "Not Found", text: async () => "{}" };
    });
    renderPage();
    await screen.findByText(/No GSTR-2B imported yet/);
    const before = onScreen();

    const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    await waitFor(() => expect(gstr2bGets.length).toBeGreaterThan(1));
    expect(screen.getByLabelText(/Period/)).toHaveValue(before);
  });

  it("explains a rejected import rather than reporting a silent success", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url, options = {}) => {
      if (options.method === "POST") {
        return {
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          text: async () =>
            JSON.stringify({ detail: "That file is a GSTR-2A, not a GSTR-2B" }),
        };
      }
      return { ok: false, status: 404, statusText: "Not Found", text: async () => "{}" };
    });
    renderPage();
    await screen.findByText(/No GSTR-2B imported yet/);

    const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is a GSTR-2A, not a GSTR-2B",
    );
  });

  it("says a category is empty rather than showing a bare table", async () => {
    // A clean run has no duplicates, and an empty table under the "Duplicates"
    // heading reads as a page that failed to load.
    const user = userEvent.setup();
    mockApi({ imported2b: imported(), latest: run() });
    renderPage();
    await screen.findByText("INV-2026-0042");

    await user.click(screen.getByRole("button", { name: /Duplicate \(0\)/ }));

    expect(screen.getByText("Nothing in this category.")).toBeInTheDocument();
  });
});
