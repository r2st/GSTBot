import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilingPage from "./FilingPage";

const PERIOD = "2026-04";

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

/**
 * Route by URL rather than by call order: the page fires a preview fetch on
 * mount and again on every period or return-type change, so a queue of
 * responses would drift the moment a test changes one of them.
 */
function mockApi({ gstr1: one = gstr1(), gstr3b: three = gstr3b(), status = 200 } = {}) {
  global.fetch = vi.fn(async (url) => {
    if (String(url).includes("/filing/export/")) {
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
});
