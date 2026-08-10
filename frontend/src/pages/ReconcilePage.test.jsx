import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentPeriod, periodLabel } from "../lib/format";
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
function mockApi({ imported2b, latest, onPost, fail } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    const ok = (body) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(body),
    });
    const refused = (status, detail) => ({
      ok: false,
      status,
      statusText: "",
      text: async () => JSON.stringify({ detail }),
    });
    const notFound = () => refused(404, "Not found");

    if (options.method === "POST") return ok(await onPost(url, options));
    // `fail` stands in for the server being unable to answer at all, which is
    // the case a 404 must not be confused with.
    if (fail) return refused(fail.status, fail.message);
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

/**
 * A fetch that hands back the levers instead of resolving on its own.
 *
 * The bugs here are ordering ones, so the test has to be able to answer the
 * second period before the first. A mock that resolves by itself can only
 * ever answer them in order, which is the one case that was never broken.
 *
 * This page sends two requests per period rather than one, so `pending`
 * fills two at a time and the URL is what says which of the pair is which.
 */
function deferredFetch() {
  const pending = [];
  global.fetch = vi.fn(
    (url, options = {}) =>
      new Promise((resolve, reject) => {
        pending.push({
          url: String(url),
          method: options.method ?? "GET",
          signal: options.signal,
          answer: (body) =>
            resolve({
              ok: true,
              status: 200,
              statusText: "OK",
              text: async () => JSON.stringify(body),
            }),
          refuse: (status) =>
            resolve({
              ok: false,
              status,
              statusText: "",
              text: async () => JSON.stringify({ detail: "Not found" }),
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

/** Switch to the month before the default, whenever the suite happens to run. */
async function selectPreviousPeriod(user) {
  const select = screen.getByLabelText("Period");
  const value = select.options[1].value;
  await user.selectOptions(select, value);
  return value;
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

  describe("a period the server could not answer for", () => {
    // A 404 is this page's empty state and a 500 is not, but both arrive as a
    // rejected promise. Treating the whole rejected branch as "nothing here
    // yet" told a user their period was empty on the strength of never having
    // found out — and then invited them to import a 2B they had already
    // imported.
    it("reports a server failure instead of calling the period empty", async () => {
      mockApi({ fail: { status: 500, message: "Database unreachable" } });
      renderPage();

      expect(await screen.findByText("Database unreachable")).toBeInTheDocument();
      // And stops calling it empty, which is the half of this the banner does
      // not do on its own. The sentence is not a caption on the banner — it is
      // a finding about the period, and it comes with an instruction to go and
      // import a 2B that may well already be there.
      expect(screen.queryByText(/No GSTR-2B imported yet/)).not.toBeInTheDocument();
    });

    it("says something even when the edge answers with no body it can read", async () => {
      mockApi({ fail: { status: 503, message: null } });
      renderPage();

      // statusText is empty over HTTP/2, so the code has to carry the message.
      expect(await screen.findByText(/temporarily unavailable|503/)).toBeInTheDocument();
    });

    it("keeps the empty state silent when the period really is empty", async () => {
      mockApi({});
      renderPage();

      await screen.findByText(/No GSTR-2B imported yet/);
      // A 404 from both endpoints is the ordinary first visit to a period.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not invite a run it could not find out about", async () => {
      // The other half of the same fault, on the other endpoint. The 2B loads,
      // the run endpoint answers 500, and the page offers "Run the
      // reconciliation to see what matches" — which says this period has never
      // been reconciled. Every figure that sentence is standing in for comes
      // from the run it claims does not exist.
      global.fetch = vi.fn(async (url) => {
        if (String(url).includes("/latest")) {
          return {
            ok: false,
            status: 500,
            statusText: "",
            text: async () => JSON.stringify({ detail: "Database unreachable" }),
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(imported()),
        };
      });
      renderPage();

      await screen.findByText(/invoices imported/);
      expect(await screen.findByText("Database unreachable")).toBeInTheDocument();
      expect(
        screen.queryByText(/Run the reconciliation to see what matches/),
      ).not.toBeInTheDocument();
    });

    it("does not raise a banner for the run alone being absent", async () => {
      // The common case after an import: a 2B is there, nothing has been
      // reconciled against it yet, and only the run endpoint answers 404.
      mockApi({ imported2b: imported() });
      renderPage();

      await screen.findByText(/invoices imported/);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
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

  it("blames the month a failed run was for, not the month now selected", async () => {
    const user = userEvent.setup();
    const pending = deferredFetch();
    renderPage();

    const started = currentPeriod();
    const startedLoads = pending.splice(0);
    startedLoads.find((r) => r.url.includes("/gstr2b/")).answer(imported());
    startedLoads.find((r) => r.url.includes("/latest")).refuse(404);
    await screen.findByText(/invoices imported/);

    await user.click(screen.getByRole("button", { name: /Run reconciliation/ }));
    await waitFor(() => expect(pending).toHaveLength(1));
    const reconcile = pending.pop();
    expect(reconcile.method).toBe("POST");

    // The picker stays live while a run is in flight — nothing disables it.
    const moved = await selectPreviousPeriod(user);
    expect(moved).not.toBe(started);
    const movedLoads = pending.splice(0);
    movedLoads.find((r) => r.url.includes("/gstr2b/")).refuse(404);
    movedLoads.find((r) => r.url.includes("/latest")).refuse(404);
    await screen.findByText(/No GSTR-2B imported yet/);

    reconcile.refuse(500);

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(`Could not reconcile ${periodLabel(started)}`);
    expect(banner).not.toHaveTextContent(periodLabel(moved));
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

  describe("when answers come back out of order", () => {
    it("abandons the pair of requests the previous period supersedes", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(2));
      pending[0].answer(imported());
      pending[1].answer(run());
      await screen.findByText("INV-2026-0042");

      await selectPreviousPeriod(user);
      await waitFor(() => expect(pending).toHaveLength(4));

      // Both halves of the superseded load are cancelled, not just the one the
      // page happened to be rendering.
      expect(pending[0].signal.aborted).toBe(true);
      expect(pending[1].signal.aborted).toBe(true);
      expect(pending[2].signal.aborted).toBe(false);
      expect(pending[3].signal.aborted).toBe(false);
    });

    it("does not put one month's exposure under another month's period", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(2));
      await selectPreviousPeriod(user);
      await waitFor(() => expect(pending).toHaveLength(4));

      // The second period answers first, which is the whole point: responses
      // do not come back in the order they were sent.
      pending[2].answer(imported({ invoice_count: 7 }));
      pending[3].answer(run({ itc_at_risk: "1234.00", report: { findings: [] } }));
      await screen.findByText("₹1,234.00");

      // Now the abandoned first period lands. Nothing on this screen carries
      // its own month, so before the abort its ₹90,000 at risk and its five
      // findings simply replaced the ones belonging to the period in the
      // picker.
      pending[0].answer(imported());
      pending[1].answer(run());

      await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
      expect(screen.getByText("₹1,234.00")).toBeInTheDocument();
      expect(screen.queryByText("₹90,000.00")).not.toBeInTheDocument();
      expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
    });

    it("does not raise an error banner for a request it cancelled itself", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(2));
      await selectPreviousPeriod(user);
      await waitFor(() => expect(pending).toHaveLength(4));

      pending[2].refuse(404);
      pending[3].refuse(404);
      await screen.findByText(/No GSTR-2B imported yet/);

      // An AbortError carries no status, so the 404-is-the-empty-state test
      // does not exempt it: left unguarded, "The operation was aborted."
      // reaches the banner of someone who simply changed month.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // The loads above are aborted when the period moves. These two are not
  // loads: they are the actions the page exists for, they are the slowest
  // requests it makes, and the period picker stays live throughout both.
  describe("when the period changes while an action is in flight", () => {
    it("does not put a superseded run's findings under the month now on screen", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(2));
      pending[0].answer(imported());
      pending[1].refuse(404);
      await screen.findByText(/invoices imported/);

      // Reconciling is the slowest thing this page does — it walks the whole
      // purchase register against the statement — so it is the request most
      // likely to still be running when someone moves on to another month.
      await user.click(screen.getByRole("button", { name: /Run reconciliation/ }));
      await waitFor(() => expect(pending).toHaveLength(3));
      expect(pending[2].method).toBe("POST");

      await selectPreviousPeriod(user);
      await waitFor(() => expect(pending).toHaveLength(5));
      pending[3].answer(imported({ invoice_count: 7 }));
      pending[4].refuse(404);
      await screen.findByText(/7\b/);

      // Now the run for the month that is no longer selected comes back.
      pending[2].answer(run());

      // Nothing below the picker carries its own month, so applying it would
      // report the previous month's ₹90,000 at risk, its findings and its
      // matched count as belonging to the period in the picker.
      await waitFor(() => expect(screen.getByText(/7\b/)).toBeInTheDocument());
      expect(screen.queryByText("₹90,000.00")).not.toBeInTheDocument();
      expect(screen.queryByText("GHOST-1")).not.toBeInTheDocument();
    });

    it("reloads the period the imported file was for, not the one it was started from", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(2));
      const startedOn = screen.getByLabelText("Period").value;
      pending[0].refuse(404);
      pending[1].refuse(404);
      await screen.findByText(/No GSTR-2B imported yet/);

      const file = new File(['{"data":{}}'], "gstr2b.json", { type: "application/json" });
      await user.upload(screen.getByLabelText(/Import GSTR-2B/), file);
      await waitFor(() => expect(pending).toHaveLength(3));
      expect(pending[2].method).toBe("POST");

      // A 2B is a few megabytes over a phone connection, and the picker is
      // live while it uploads.
      await selectPreviousPeriod(user);
      await waitFor(() => expect(pending).toHaveLength(5));
      pending[3].refuse(404);
      pending[4].refuse(404);

      pending[2].answer(imported({ period: startedOn, invoice_count: 42 }));

      // The statement was for the month the upload was started from, so that
      // is the month whose figures it may be shown under — the page follows
      // the file rather than refetching the month it left behind and
      // captioning it with the month in the picker.
      await waitFor(() => expect(screen.getByLabelText("Period")).toHaveValue(startedOn));
      const reload = pending.slice(5).filter((p) => p.url.includes("/gstr2b/"));
      expect(reload).toHaveLength(1);
      expect(reload[0].url).toContain(startedOn);
    });
  });

  describe("an invoice this statement declares late", () => {
    // A May 2B routinely carries April invoices the supplier filed late. The
    // report lists them, because the statement names them, but every counter
    // the server sends deliberately leaves them out — April already counted
    // them, and adding them here would grow April's matched count every time a
    // supplier caught up on an old one.
    //
    // So two numbers on this screen are right about different questions, and
    // the screen has to survive them disagreeing. The stat card is the period's
    // own tally and excludes the carried row; the chip beside the filter counts
    // the rows that filter yields and includes it. The "Late filing" marker is
    // the only thing on the page that explains why — without it the extra row
    // is unaccounted for, and a user counting rows finds one more than every
    // number beside them.

    /** The standard run plus one late-filed April invoice, matched. */
    function withCarried() {
      const base = run();
      return run({
        report: {
          ...base.report,
          findings: [
            ...base.report.findings,
            {
              category: "matched",
              invoice_id: 21,
              invoice_number: "APR/0098",
              supplier_gstin: "29AAGCB7383J1Z4",
              supplier_name: "Northwind Supplies",
              invoice_date: "2026-03-28",
              matched_on: "exact",
              carried: true,
              note: "Booked in 2026-03; declared in this statement",
              differences: [],
              books: { taxable_value: "20000.00", total_tax: "3600.00" },
              gstr2b: { taxable_value: "20000.00", total_tax: "3600.00" },
            },
          ],
        },
      });
    }

    it("marks the row so the extra line is not unexplained", async () => {
      mockApi({ imported2b: imported(), latest: withCarried() });
      renderPage();

      const row = (await screen.findByText("APR/0098")).closest("tr");
      const marker = within(row).getByText("Late filing");
      expect(marker).toBeInTheDocument();
      // Which month booked it rides on the marker rather than in a column of
      // its own, which would be empty on every other row.
      expect(marker).toHaveAttribute("title", "Booked in 2026-03; declared in this statement");
    });

    it("leaves the marker off the period's own rows", async () => {
      mockApi({ imported2b: imported(), latest: withCarried() });
      renderPage();

      const row = (await screen.findByText("INV-2026-0042")).closest("tr");
      expect(within(row).queryByText("Late filing")).not.toBeInTheDocument();
    });

    it("counts the carried row on the chip, which labels the list", async () => {
      mockApi({ imported2b: imported(), latest: withCarried() });
      renderPage();

      // Two matched rows are shown under this filter, so the chip says two.
      // Taken from the server's matched_count it said one, over a list of two.
      const chip = await screen.findByRole("button", { name: /^Matched \(/ });
      expect(chip).toHaveTextContent("Matched (2)");
      expect(screen.getByRole("button", { name: /^All \(/ })).toHaveTextContent("All (5)");

      await userEvent.click(chip);
      const rows = within(screen.getByRole("table")).getAllByRole("row");
      expect(rows).toHaveLength(3); // header + the two the chip counted
    });

    it("keeps the carried row off the stat card, which is the period's own", async () => {
      mockApi({ imported2b: imported(), latest: withCarried() });
      renderPage();

      // The run's own numerator over the run's own denominator. Taking the
      // numerator from the chip tally instead would read "2 / 3" — a period
      // that matched more invoices than it considered.
      const card = (await screen.findByText("Matched", { selector: ".stat-label" })).closest(
        ".stat-card",
      );
      expect(within(card).getByText("1 / 3")).toBeInTheDocument();
    });
  });

  /**
   * The other side of two branches every fixture above enters the same way.
   *
   * `run()` carries `itc_at_risk: "90000.00"` and one matched invoice of
   * three, so every assertion in this file has read the cards in their alarmed
   * state. A clean period — nothing at risk, everything matched — is the
   * outcome the product is for, and until here nothing rendered one.
   */
  describe("a period with nothing wrong", () => {
    it("reads the risk card as good when no ITC is at risk", async () => {
      mockApi({
        imported2b: imported(),
        latest: run({ itc_at_risk: "0.00" }),
      });
      renderPage();

      const card = (await screen.findByText("ITC at risk", { selector: ".stat-label" })).closest(
        ".stat-card",
      );
      expect(card).toHaveClass("tone-good");
    });

    it("reads the matched card as good only when every invoice matched", async () => {
      mockApi({
        imported2b: imported(),
        latest: run({ matched_count: 3, total_invoices: 3 }),
      });
      renderPage();

      const card = (await screen.findByText("Matched", { selector: ".stat-label" })).closest(
        ".stat-card",
      );
      expect(within(card).getByText("3 / 3")).toBeInTheDocument();
      expect(card).toHaveClass("tone-good");
    });
  });

  it("does nothing when the file picker is dismissed without a file", async () => {
    // Opening the picker and pressing Cancel fires `change` with an empty
    // FileList. The guard for it is one line and had never run: every other
    // upload test here hands over a file. Without it the extension check
    // reads `undefined.name` and the screen dies on a cancelled dialog.
    //
    // fireEvent rather than `user.upload(input, [])` — user-event treats an
    // empty upload as nothing to do and never dispatches the event, so the
    // guard would go on being unreached while the test passed.
    const onPost = vi.fn();
    mockApi({ imported2b: imported(), latest: run(), onPost });
    renderPage();
    await screen.findByText("ITC at risk", { selector: ".stat-label" });

    fireEvent.change(screen.getByLabelText(/Replace GSTR-2B|Import GSTR-2B/), {
      target: { files: [] },
    });

    expect(onPost).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
