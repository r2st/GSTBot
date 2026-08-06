import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilingPage from "./FilingPage";

const PERIOD = "2026-04";

/** The month before this one, which is the newest period that can be filed. */
function previousPeriod(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function validation(overrides = {}) {
  const issues = overrides.issues ?? [];
  return {
    period: PERIOD,
    ok: issues.every((issue) => issue.severity !== "error"),
    invoice_count: 3,
    error_count: issues.filter((issue) => issue.severity === "error").length,
    warning_count: issues.filter((issue) => issue.severity === "warning").length,
    ...overrides,
    issues,
  };
}

function gstr1(overrides = {}) {
  return {
    period: PERIOD,
    return_type: "gstr1",
    document: {
      gstin: "29AAGCB7383J1Z4",
      fp: "042026",
      version: "GST3.0.4",
      hash: "hash",
      b2b: [{ ctin: "29AAGCB7383J1Z5", inv: [{ inum: "INV-1" }] }],
    },
    validation: validation(),
    ...overrides,
  };
}

function gstr3b(overrides = {}) {
  return {
    period: PERIOD,
    return_type: "gstr3b",
    document: {
      gstin: "29AAGCB7383J1Z4",
      ret_period: "042026",
      gstbot_set_off: {
        steps: [],
        cash_payable: { igst: "2000.00", cgst: "0.00", sgst: "0.00", cess: "0.00", total: "2000.00" },
        credit_carried_forward: {
          igst: "500.00",
          cgst: "0.00",
          sgst: "0.00",
          cess: "0.00",
          total: "500.00",
        },
        credit_used: { igst: "18000.00", cgst: "0.00", sgst: "0.00", cess: "0.00", total: "18000.00" },
        total_cash: "2000.00",
      },
    },
    validation: validation(),
    ...overrides,
  };
}

function standing(overrides = {}) {
  return {
    period: PERIOD,
    return_type: "gstr1",
    due_date: "2026-05-11",
    filed: false,
    filed_on: null,
    arn: null,
    filed_late: false,
    days_until_due: 5,
    ...overrides,
  };
}

function filingStatus(items = []) {
  return { as_of: "2026-05-06", items };
}

/**
 * Route by URL rather than by call order: the page fires a preview fetch on
 * mount and again on every period or return-type change, so a queue of
 * responses would drift the moment a test changes one of them.
 */
function mockApi({
  gstr1: one = gstr1(),
  gstr3b: three = gstr3b(),
  status = 200,
  filingStatus: statusBody = filingStatus(),
  filingStatusStatus = 200,
  onRecordFiled,
  recordFailure,
} = {}) {
  global.fetch = vi.fn(async (url, options) => {
    const href = String(url);

    if (href.includes("/filing/status")) {
      return {
        ok: filingStatusStatus < 400,
        status: filingStatusStatus,
        statusText: filingStatusStatus < 400 ? "OK" : "Error",
        text: async () => JSON.stringify(statusBody),
      };
    }
    if (/\/filing\/gstr(1|3b)\/filed$/.test(href)) {
      onRecordFiled?.({ url: href, body: JSON.parse(options?.body ?? "{}") });
      return {
        ok: !recordFailure,
        status: recordFailure?.status ?? 201,
        statusText: recordFailure ? "Error" : "Created",
        text: async () =>
          JSON.stringify(recordFailure?.body ?? { id: 1, period: PERIOD }),
      };
    }
    if (href.includes("/filing/export/")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        blob: async () => new Blob(["{}"], { type: "application/json" }),
        headers: {
          get: () => 'attachment; filename="gstr1_29AAGCB7383J1Z4_042026.json"',
        },
      };
    }
    const body = String(url).includes("/filing/gstr3b") ? three : one;
    return {
      ok: status < 400,
      status,
      statusText: status < 400 ? "OK" : "Error",
      text: async () => JSON.stringify(body),
    };
  });
}

/**
 * Step the picker back to the month before this one and return it.
 *
 * The picker opens on the current month, and a return for a month that has not
 * ended cannot be recorded — the portal does not open it until the month is
 * over, and the server refuses the record. So every test about recording a
 * filing has to be on a completed period first.
 */
async function selectCompletedPeriod(user) {
  const select = await screen.findByLabelText("Period");
  const previous = select.options[1].value;
  await user.selectOptions(select, previous);
  return previous;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FilingPage />
    </MemoryRouter>,
  );
}

/** Resolves once a preview has replaced the loading placeholder. */
const loaded = () => screen.findByRole("heading", { name: "Export" });

/** The tiles repeat their figures further down, so assert against the tile. */
function statCard(container, label) {
  const card = [...container.querySelectorAll(".stat-card")].find(
    (node) => node.querySelector(".stat-label")?.textContent === label,
  );
  if (!card) throw new Error(`no stat card labelled "${label}"`);
  return card;
}

describe("FilingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom implements neither, and saveBlob calls both on every download.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a clean period as ready to file", async () => {
    mockApi();
    const { container } = renderPage();

    await loaded();
    expect(statCard(container, "Ready to file")).toHaveTextContent("Yes");
    expect(statCard(container, "Ready to file")).toHaveTextContent("Nothing blocking");
    expect(statCard(container, "Errors")).toHaveTextContent("0");
  });

  it("refuses to call a period with errors ready", async () => {
    mockApi({
      gstr1: gstr1({
        validation: validation({
          issues: [
            {
              invoice_id: 7,
              invoice_number: "INV-7",
              field: "counterparty_gstin",
              severity: "error",
              message: "29AAGCB7383J1Z9 is not a valid GSTIN",
            },
          ],
        }),
      }),
    });
    const { container } = renderPage();

    await loaded();
    expect(statCard(container, "Ready to file")).toHaveTextContent("No");
    expect(statCard(container, "Ready to file")).toHaveTextContent("1 to fix");
    expect(
      screen.getByText(/fix them before filing, or the portal will reject/i),
    ).toBeInTheDocument();
  });

  it("lists each validation issue against its invoice", async () => {
    mockApi({
      gstr1: gstr1({
        validation: validation({
          issues: [
            {
              invoice_id: 7,
              invoice_number: "INV-7",
              field: "counterparty_gstin",
              severity: "error",
              message: "29AAGCB7383J1Z9 is not a valid GSTIN",
            },
            {
              invoice_id: 8,
              invoice_number: "INV-8",
              field: "hsn_code",
              severity: "warning",
              message: "HSN code is missing",
            },
          ],
        }),
      }),
    });
    renderPage();

    await loaded();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    // The field name is humanised rather than shown as a column name.
    expect(screen.getByText("counterparty gstin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV-7" })).toHaveAttribute(
      "href",
      "/invoices/7",
    );
  });

  it("says so plainly when there is nothing to fix", async () => {
    mockApi();
    renderPage();

    await loaded();
    expect(screen.getByText(/Nothing to fix/i)).toBeInTheDocument();
  });

  it("keeps the generated JSON hidden until it is asked for", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    expect(screen.queryByLabelText("Generated return JSON")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show generated JSON/i }));
    const json = await screen.findByLabelText("Generated return JSON");
    expect(json).toHaveTextContent('"fp": "042026"');

    await user.click(screen.getByRole("button", { name: /Hide generated JSON/i }));
    expect(screen.queryByLabelText("Generated return JSON")).not.toBeInTheDocument();
  });

  it("fetches the other return when the type is switched", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "GSTR-3B" }));

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain("/filing/gstr3b"),
    );
    expect(screen.getByRole("button", { name: "GSTR-3B" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows what the credit leaves to pay, but only on GSTR-3B", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    expect(
      screen.queryByRole("heading", { name: "What this leaves to pay" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "GSTR-3B" }));

    const panel = (await screen.findByRole("heading", { name: "What this leaves to pay" }))
      .closest("section");
    expect(within(panel).getByText("₹2,000.00")).toBeInTheDocument();
    expect(within(panel).getByText("₹18,000.00")).toBeInTheDocument();
    expect(within(panel).getByText("₹500.00")).toBeInTheDocument();
  });

  it("downloads an export under the name the server gave it", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: /Download GSTR-1 JSON/i }));

    expect(
      await screen.findByText("Downloaded gstr1_29AAGCB7383J1Z4_042026.json"),
    ).toBeInTheDocument();
    expect(global.fetch.mock.calls.at(-1)[0]).toContain("/filing/export/gstr1.json");
    expect(URL.createObjectURL).toHaveBeenCalled();
    // The object URL is released rather than leaked once the click is done.
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("asks for CSV separately from JSON", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    await user.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain("/filing/export/gstr1.csv"),
    );
  });

  it("surfaces an API failure", async () => {
    mockApi({ gstr1: { detail: "Business is inactive" }, status: 403 });
    renderPage();

    expect(await screen.findByText("Business is inactive")).toBeInTheDocument();
  });

  it("reloads when the period changes", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await loaded();
    const select = screen.getByLabelText("Period");
    // The month before the default, whenever the suite happens to run.
    const previous = select.options[1].value;
    await user.selectOptions(select, previous);

    await waitFor(() =>
      expect(global.fetch.mock.calls.at(-1)[0]).toContain(`period=${previous}`),
    );
  });

  describe("recording that a return was filed", () => {
    /**
     * Nothing in this product can observe a submission to the portal, so the
     * deadline alerting has only this record to go on. Until it existed there
     * was no way to say so from the app at all — the endpoint was live and
     * unreachable — which left every business permanently overdue on returns
     * they had already filed.
     */
    const markFiled = () => screen.findByRole("button", { name: /Mark GSTR-1 as filed/i });

    it("sends the period and return type the picker is showing", async () => {
      const user = userEvent.setup();
      const onRecordFiled = vi.fn();
      mockApi({ onRecordFiled });
      renderPage();

      const period = await selectCompletedPeriod(user);
      await user.click(await markFiled());

      await waitFor(() => expect(onRecordFiled).toHaveBeenCalled());
      const { url, body } = onRecordFiled.mock.calls[0][0];
      expect(url).toContain("/filing/gstr1/filed");
      expect(body.period).toBe(period);
    });

    it("records the return type the toggle is on, not the one it started on", async () => {
      const user = userEvent.setup();
      const onRecordFiled = vi.fn();
      mockApi({ onRecordFiled });
      renderPage();

      await loaded();
      await selectCompletedPeriod(user);
      await user.click(screen.getByRole("button", { name: "GSTR-3B" }));
      await user.click(await screen.findByRole("button", { name: /Mark GSTR-3B as filed/i }));

      await waitFor(() => expect(onRecordFiled).toHaveBeenCalled());
      expect(onRecordFiled.mock.calls[0][0].url).toContain("/filing/gstr3b/filed");
    });

    it("sends an ARN when one is typed, upper-cased and without spaces", async () => {
      const user = userEvent.setup();
      const onRecordFiled = vi.fn();
      mockApi({ onRecordFiled });
      renderPage();

      await selectCompletedPeriod(user);
      await user.type(
        await screen.findByLabelText(/ARN/i),
        "aa2704 26000000 x",
      );
      await user.click(await markFiled());

      await waitFor(() => expect(onRecordFiled).toHaveBeenCalled());
      expect(onRecordFiled.mock.calls[0][0].body.arn).toBe("AA270426000000X");
    });

    it("omits the ARN entirely rather than sending an empty one", async () => {
      const user = userEvent.setup();
      const onRecordFiled = vi.fn();
      mockApi({ onRecordFiled });
      renderPage();

      await selectCompletedPeriod(user);
      await user.click(await markFiled());

      await waitFor(() => expect(onRecordFiled).toHaveBeenCalled());
      // On the server an absent ARN means "not to hand" and leaves a stored one
      // alone; an empty string is not an ARN and would be refused.
      expect(onRecordFiled.mock.calls[0][0].body).not.toHaveProperty("arn");
    });

    it("refuses something that is plainly not an ARN before sending it", async () => {
      const user = userEvent.setup();
      const onRecordFiled = vi.fn();
      mockApi({ onRecordFiled });
      renderPage();

      await selectCompletedPeriod(user);
      await user.type(await screen.findByLabelText(/ARN/i), "AB12");
      await user.click(await markFiled());

      expect(await screen.findByRole("alert")).toHaveTextContent(/does not look like an ARN/i);
      expect(onRecordFiled).not.toHaveBeenCalled();
    });

    it("confirms the filing by naming its own period", async () => {
      const user = userEvent.setup();
      mockApi();
      renderPage();

      await selectCompletedPeriod(user);
      await user.click(await markFiled());

      expect(await screen.findByRole("status")).toHaveTextContent(/Recorded GSTR-1 for/i);
    });

    it("refetches the status so the panel stops calling it outstanding", async () => {
      const user = userEvent.setup();
      mockApi();
      renderPage();

      await loaded();
      await selectCompletedPeriod(user);
      const before = global.fetch.mock.calls.filter((call) =>
        String(call[0]).includes("/filing/status"),
      ).length;

      await user.click(await markFiled());

      await waitFor(() => {
        const after = global.fetch.mock.calls.filter((call) =>
          String(call[0]).includes("/filing/status"),
        ).length;
        expect(after).toBeGreaterThan(before);
      });
    });

    it("reports a refusal from the server rather than claiming success", async () => {
      const user = userEvent.setup();
      mockApi({
        recordFailure: {
          status: 422,
          body: { detail: "2026-04 could not have been filed on 2026-04-02." },
        },
      });
      renderPage();

      await selectCompletedPeriod(user);
      await user.click(await markFiled());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "2026-04 could not have been filed on 2026-04-02.",
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("does not offer to record a month that has not ended", async () => {
      // The picker opens on the current month, and the server refuses a record
      // for a period the portal has not opened yet. Left enabled, the first
      // thing anyone met on this panel was a 422 for doing the obvious thing.
      mockApi();
      renderPage();

      await loaded();
      expect(await markFiled()).toBeDisabled();
      expect(screen.getByLabelText(/ARN/i)).toBeDisabled();
      expect(screen.getByText(/has not ended yet, so there is nothing to record/i))
        .toBeInTheDocument();
    });

    it("offers it again as soon as a completed period is picked", async () => {
      const user = userEvent.setup();
      mockApi();
      renderPage();

      await loaded();
      await selectCompletedPeriod(user);

      expect(await markFiled()).toBeEnabled();
      expect(
        screen.queryByText(/has not ended yet, so there is nothing to record/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("the filing status panel", () => {
    it("shows each period's standing, due date and reference", async () => {
      mockApi({
        filingStatus: filingStatus([
          standing({
            filed: true,
            filed_on: "2026-05-09",
            arn: "AA270426000000X",
            days_until_due: 2,
          }),
          standing({ return_type: "gstr3b", due_date: "2026-05-20", days_until_due: -4 }),
        ]),
      });
      renderPage();

      const table = await screen.findByRole("region", { name: "Filing status by period" });
      expect(within(table).getByText("Filed")).toBeInTheDocument();
      expect(within(table).getByText("AA270426000000X")).toBeInTheDocument();
      expect(within(table).getByText("Overdue by 4d")).toBeInTheDocument();
    });

    it("marks a return filed after its due date as late rather than on time", async () => {
      mockApi({
        filingStatus: filingStatus([
          standing({ filed: true, filed_on: "2026-05-19", filed_late: true }),
        ]),
      });
      renderPage();

      const table = await screen.findByRole("region", { name: "Filing status by period" });
      expect(within(table).getByText("Filed late")).toBeInTheDocument();
      expect(within(table).queryByText("Filed")).not.toBeInTheDocument();
    });

    it("says a period is already recorded rather than offering it blind", async () => {
      mockApi({
        filingStatus: filingStatus([
          standing({
            period: previousPeriod(),
            filed: true,
            filed_on: "2026-05-09",
            arn: "AA270426000000X",
          }),
        ]),
      });
      const user = userEvent.setup();
      renderPage();

      await selectCompletedPeriod(user);
      expect(
        await screen.findByText(/Already recorded as filed on/i),
      ).toHaveTextContent("AA270426000000X");
    });

    it("keeps the export working when the status panel cannot load", async () => {
      // The page's job is preparing a return. A status panel that 500s must not
      // make the export buttons look broken, or put a banner over a page that
      // is working.
      mockApi({ filingStatusStatus: 500 });
      renderPage();

      await loaded();
      expect(
        screen.getByRole("button", { name: /Download GSTR-1 JSON/i }),
      ).toBeEnabled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Filing status by period" }),
      ).not.toBeInTheDocument();
    });
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
            // The filing-status panel fetches independently of the picker, so
            // it is answered immediately and kept out of `pending`. The
            // ordering under test is between the two *previews*; queueing an
            // unrelated third request here would only shift every index.
            if (String(url).includes("/filing/status")) {
              resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () => JSON.stringify(filingStatus()),
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

    it("abandons the preview the other return type supersedes", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(gstr1());
      await loaded();

      await user.click(screen.getByRole("button", { name: "GSTR-3B" }));
      await waitFor(() => expect(pending).toHaveLength(2));

      expect(pending[0].url).toContain("/filing/gstr1");
      expect(pending[0].signal.aborted).toBe(true);
      expect(pending[1].url).toContain("/filing/gstr3b");
      expect(pending[1].signal.aborted).toBe(false);
    });

    it("does not preview one return while offering to file the other", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      await user.click(screen.getByRole("button", { name: "GSTR-3B" }));
      await waitFor(() => expect(pending).toHaveLength(2));

      // GSTR-3B answers first, which is the whole point: responses do not come
      // back in the order they were sent.
      pending[1].answer(gstr3b());
      await loaded();
      expect(
        screen.getByRole("heading", { name: "What this leaves to pay" }),
      ).toBeInTheDocument();

      // Now the abandoned GSTR-1 lands. The heading, the export buttons and the
      // validation verdict all follow the toggle rather than the response, so
      // before this the page offered to file GSTR-3B over a GSTR-1 preview.
      pending[0].answer(gstr1({ validation: validation({ invoice_count: 99 }) }));

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "What this leaves to pay" }),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: /Download GSTR-3B JSON/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText("99")).not.toBeInTheDocument();
    });

    it("does not raise an error banner for a request it cancelled itself", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderPage();

      await waitFor(() => expect(pending).toHaveLength(1));
      await user.click(screen.getByRole("button", { name: "GSTR-3B" }));
      await waitFor(() => expect(pending).toHaveLength(2));
      pending[1].answer(gstr3b());

      await loaded();
      // "signal is aborted without reason" in front of someone who simply
      // switched return would be worse than the stale preview the abort exists
      // to prevent.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
