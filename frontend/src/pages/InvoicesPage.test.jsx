import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import InvoicesPage from "./InvoicesPage";

const PAGE_SIZE = 25;

function invoice(overrides = {}) {
  return {
    id: 1,
    invoice_number: "INV-2026-0042",
    invoice_type: "purchase",
    invoice_date: "2026-04-15",
    counterparty_name: "Northwind Supplies",
    counterparty_gstin: "29AAGCB7383J1Z4",
    taxable_value: "450000.00",
    cgst: "0.00",
    sgst: "0.00",
    igst: "81000.00",
    cess: "0.00",
    total_value: "531000.00",
    invoice_value: "531000.00",
    status: "matched",
    ...overrides,
  };
}

/**
 * Capture every request URL, because what this page is *for* is turning
 * filters and pagination into a query string. The assertions read the
 * captured URLs rather than the rendered rows wherever the query is the point.
 */
function mockApi({ items = [invoice()], total = items.length, fail } = {}) {
  const urls = [];
  global.fetch = vi.fn(async (url) => {
    urls.push(String(url));
    if (fail) {
      return {
        ok: false,
        status: fail.status ?? 500,
        statusText: "Error",
        text: async () => JSON.stringify({ detail: fail.message }),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ items, total, limit: PAGE_SIZE, offset: 0 }),
    };
  });
  return urls;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoicesPage />
    </MemoryRouter>,
  );
}

function lastQuery(urls) {
  return new URL(urls.at(-1), "http://localhost").searchParams;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InvoicesPage", () => {
  it("shows a loading skeleton before the first response lands", () => {
    mockApi();
    renderPage();
    // The skeleton announces itself through visually hidden text in a polite
    // live region rather than a role, so a screen reader is not left silent.
    expect(screen.getByText(/Loading invoices/)).toBeInTheDocument();
  });

  it("lists the invoices it fetched", async () => {
    mockApi({ items: [invoice(), invoice({ id: 2, invoice_number: "INV-2026-0043" })] });
    renderPage();

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-0043")).toBeInTheDocument();
  });

  it("links each row to its invoice", async () => {
    mockApi();
    renderPage();

    const link = await screen.findByRole("link", { name: "INV-2026-0042" });
    expect(link).toHaveAttribute("href", "/invoices/1");
  });

  it("falls back to the id when an invoice has no number", async () => {
    // An extraction that could not read the number still has to be reachable,
    // since correcting it is exactly what the user is here to do.
    mockApi({ items: [invoice({ invoice_number: null, id: 77 })] });
    renderPage();

    const link = await screen.findByRole("link", { name: "#77" });
    expect(link).toHaveAttribute("href", "/invoices/77");
  });

  it("sums the four tax heads into one column", async () => {
    // The table shows total tax, which no single field carries.
    mockApi({
      items: [
        invoice({ cgst: "40500.00", sgst: "40500.00", igst: "0.00", cess: "1000.00" }),
      ],
    });
    renderPage();

    const row = (await screen.findByText("INV-2026-0042")).closest("tr");
    expect(within(row).getByText("₹82,000.00")).toBeInTheDocument();
  });

  it("shows a dash for a counterparty that could not be read", async () => {
    mockApi({ items: [invoice({ counterparty_name: null, counterparty_gstin: null })] });
    renderPage();

    const row = (await screen.findByText("INV-2026-0042")).closest("tr");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("No GSTIN")).toBeInTheDocument();
  });

  it("invites a first upload when there are none at all", async () => {
    mockApi({ items: [], total: 0 });
    renderPage();

    expect(await screen.findByText("No invoices yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload your first invoice/i })).toHaveAttribute(
      "href",
      "/upload",
    );
  });

  describe("when a filter matches nothing", () => {
    /** Rows for the unfiltered list, nothing once a query string narrows it. */
    function mockFilterable() {
      const urls = [];
      global.fetch = vi.fn(async (url) => {
        const text = String(url);
        urls.push(text);
        const params = new URL(text, "http://localhost").searchParams;
        const narrowed = params.has("search") || params.has("status") || params.has("invoice_type");
        const items = narrowed ? [] : [invoice()];
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify({ items, total: items.length, limit: PAGE_SIZE, offset: 0 }),
        };
      });
      return urls;
    }

    it("does not tell a stocked book that it is empty", async () => {
      const user = userEvent.setup();
      mockFilterable();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await user.type(screen.getByRole("searchbox"), "zzz");

      expect(await screen.findByText("No invoices match these filters.")).toBeInTheDocument();
      // The books are not empty, so neither the claim nor the first-upload
      // invitation belongs on screen.
      expect(screen.queryByText("No invoices yet.")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /upload your first invoice/i }),
      ).not.toBeInTheDocument();
    });

    it("offers a way back to the full list", async () => {
      const user = userEvent.setup();
      mockFilterable();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await user.selectOptions(screen.getByLabelText("Status"), "failed");
      await screen.findByText("No invoices match these filters.");

      await user.click(screen.getByRole("button", { name: "Clear filters" }));

      expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
      expect(screen.getByLabelText("Status")).toHaveValue("");
    });

    it("still invites a first upload when nothing is filtered", async () => {
      // The first-run screen has to survive the fix: an account with no
      // invoices and no filters is the one case the invitation is for.
      mockApi({ items: [], total: 0 });
      renderPage();

      expect(await screen.findByText("No invoices yet.")).toBeInTheDocument();
      expect(screen.queryByText("No invoices match these filters.")).not.toBeInTheDocument();
    });
  });

  it("surfaces a failed load and lets it be dismissed", async () => {
    mockApi({ fail: { status: 500, message: "Database unreachable" } });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database unreachable");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("filters", () => {
    it("sends the selected type as a query parameter", async () => {
      const urls = mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.selectOptions(screen.getByLabelText("Type"), "purchase");

      await waitFor(() => expect(lastQuery(urls).get("invoice_type")).toBe("purchase"));
    });

    it("sends the selected status as a query parameter", async () => {
      const urls = mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.selectOptions(screen.getByLabelText("Status"), "mismatched");

      await waitFor(() => expect(lastQuery(urls).get("status")).toBe("mismatched"));
    });

    it("sends the search text as a query parameter", async () => {
      const urls = mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.type(screen.getByLabelText("Search"), "Northwind");

      await waitFor(() => expect(lastQuery(urls).get("search")).toBe("Northwind"));
    });

    it("omits a filter that is set back to All rather than sending it empty", async () => {
      // An empty `status=` is a filter for the empty status, not for none.
      const urls = mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.selectOptions(screen.getByLabelText("Status"), "parsed");
      await waitFor(() => expect(lastQuery(urls).get("status")).toBe("parsed"));

      await userEvent.selectOptions(screen.getByLabelText("Status"), "");
      await waitFor(() => expect(lastQuery(urls).has("status")).toBe(false));
    });

    it("returns to the first page when a filter changes", async () => {
      // Otherwise a narrower filter lands on an offset past the end of the
      // new result set and the table reads as empty.
      const urls = mockApi({ items: [invoice()], total: 80 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(lastQuery(urls).get("offset")).toBe(String(PAGE_SIZE)));

      await userEvent.selectOptions(screen.getByLabelText("Type"), "sales");
      await waitFor(() => expect(lastQuery(urls).get("offset")).toBe("0"));
    });
  });

  describe("pagination", () => {
    it("cannot go back from the first page", async () => {
      mockApi({ items: [invoice()], total: 80 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    });

    it("cannot go forward from the last page", async () => {
      mockApi({ items: [invoice()], total: 1 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("advances by a page", async () => {
      const urls = mockApi({ items: [invoice()], total: 80 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await waitFor(() => expect(lastQuery(urls).get("offset")).toBe("25"));
      expect(lastQuery(urls).get("limit")).toBe("25");
    });

    it("goes back a page", async () => {
      const urls = mockApi({ items: [invoice()], total: 80 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(lastQuery(urls).get("offset")).toBe("25"));

      await userEvent.click(screen.getByRole("button", { name: "Previous" }));
      await waitFor(() => expect(lastQuery(urls).get("offset")).toBe("0"));
    });

    it("counts the visible range from one, not zero", async () => {
      mockApi({ items: [invoice()], total: 80 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      expect(screen.getByText("1–25 of 80")).toBeInTheDocument();
    });

    it("does not claim more rows than exist on a short last page", async () => {
      mockApi({ items: [invoice()], total: 3 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      expect(screen.getByText("1–3 of 3")).toBeInTheDocument();
    });
  });

  it("keeps the table scrollable in its own container on a narrow screen", async () => {
    // The page must never scroll horizontally as a whole; the table does.
    mockApi();
    const { container } = renderPage();
    await screen.findByText("INV-2026-0042");

    expect(container.querySelector(".table-scroll table")).toBeInTheDocument();
  });
  describe("accessibility furniture", () => {
    it("names the screen in the document title", async () => {
      mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");
      expect(document.title).toBe("Invoices · GSTBot");
    });

    it("makes the scroll container a named, focusable region", async () => {
      mockApi();
      renderPage();
      await screen.findByText("INV-2026-0042");

      // Seven columns overflow on a phone. `overflow-x: auto` alone leaves the
      // hidden columns unreachable from a keyboard — there is nothing focusable
      // inside the overflow for Tab to land on.
      const region = screen.getByRole("region", { name: "Invoices" });
      expect(region).toHaveAttribute("tabindex", "0");
      expect(within(region).getByRole("table")).toBeInTheDocument();
    });

    it("announces the range after paging", async () => {
      // Next replaces the rows in place. Without a live region the only
      // feedback from the press is that focus stayed on the button.
      mockApi({ items: [invoice()], total: 60 });
      renderPage();
      await screen.findByText("INV-2026-0042");

      expect(screen.getByRole("status")).toHaveTextContent("1–25 of 60");
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("26–50 of 60"));
    });
  });

  describe("refetching over rows that are already on screen", () => {
    it("dims the table instead of replacing it with placeholders", async () => {
      mockApi();
      const { container } = renderPage();
      await screen.findByText("INV-2026-0042");

      let release;
      global.fetch = vi.fn(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () =>
                  JSON.stringify({ items: [], total: 0, limit: PAGE_SIZE, offset: 0 }),
              });
          }),
      );
      await userEvent.selectOptions(screen.getByLabelText("Status"), "failed");

      await waitFor(() =>
        expect(container.querySelector(".page")).toHaveAttribute("aria-busy", "true"),
      );
      // Swapping the rows for skeletons on every filter change reads as "your
      // invoices are gone"; the previous answer stays up, dimmed.
      expect(screen.getByText("INV-2026-0042")).toBeInTheDocument();
      expect(container.querySelector(".results")).toHaveClass("is-refreshing");

      release();
    });

    it("is not busy once the rows have landed", async () => {
      mockApi();
      const { container } = renderPage();
      await screen.findByText("INV-2026-0042");
      expect(container.querySelector(".page")).toHaveAttribute("aria-busy", "false");
      expect(container.querySelector(".results")).not.toHaveClass("is-refreshing");
    });

    it("leaves the filters usable while the rows are being refetched", async () => {
      // `.is-refreshing` carries `pointer-events: none`. Dimming the whole page
      // would take the search box down with the rows — and the search box is
      // what triggered the refetch, mid-word.
      mockApi();
      const { container } = renderPage();
      await screen.findByText("INV-2026-0042");

      global.fetch = vi.fn(() => new Promise(() => {}));
      await userEvent.selectOptions(screen.getByLabelText("Status"), "failed");

      await waitFor(() =>
        expect(container.querySelector(".results")).toHaveClass("is-refreshing"),
      );
      expect(container.querySelector(".filters")).not.toHaveClass("is-refreshing");
      expect(container.querySelector(".filters").closest(".is-refreshing")).toBeNull();
    });

    it("still shows placeholders on the very first load", async () => {
      // Nothing to dim yet — a blank page with no explanation is the thing the
      // skeleton exists to prevent.
      mockApi();
      const { container } = renderPage();
      expect(container.querySelector(".skeleton-table")).toBeInTheDocument();
      await screen.findByText("INV-2026-0042");
    });
  });
});
