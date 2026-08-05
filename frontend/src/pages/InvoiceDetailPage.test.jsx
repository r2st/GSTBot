import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceDetailPage from "./InvoiceDetailPage";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

function invoice(overrides = {}) {
  return {
    id: 42,
    invoice_number: "INV-2026-0042",
    invoice_type: "purchase",
    status: "needs_review",
    counterparty_gstin: "27AAPFU0939F1ZV",
    counterparty_name: "Acme Supplies",
    invoice_date: "2026-04-15",
    hsn_code: "8471",
    taxable_value: "1000.00",
    cgst: "90.00",
    sgst: "90.00",
    igst: "0.00",
    cess: "0.00",
    total_value: "1180.00",
    warnings: [],
    parsed_with: "heuristics",
    extraction_confidence: 0.8,
    ...overrides,
  };
}

async function renderPage(data = invoice()) {
  global.fetch.mockResolvedValueOnce(jsonResponse(data));
  render(
    <MemoryRouter initialEntries={["/invoices/42"]}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  // Wait for the load to land before any interaction.
  await screen.findByLabelText("Counterparty GSTIN");
}

/** Replace a field's contents. */
async function retype(user, label, value) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value !== "") await user.type(input, value);
  return input;
}

describe("InvoiceDetailPage", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows a placeholder while the invoice loads", () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/invoices/42"]}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading invoice…")).toBeInTheDocument();
  });

  it("fills the form from the extracted fields", async () => {
    await renderPage();
    expect(screen.getByLabelText("Counterparty GSTIN")).toHaveValue("27AAPFU0939F1ZV");
    expect(screen.getByLabelText("Total value")).toHaveValue(1180);
  });

  it("saves only the fields that changed", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Invoice number", "INV-CORRECTED");
    global.fetch.mockResolvedValueOnce(
      jsonResponse(invoice({ invoice_number: "INV-CORRECTED" })),
    );
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    // A user fixing one field must not blank the amounts by omission.
    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body).toEqual({ invoice_number: "INV-CORRECTED" });
  });

  it("does not send a request when nothing changed", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("Nothing changed.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks the save on a negative amount and says which field", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "CGST", "-5");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("CGST cannot be negative.")).toBeInTheDocument();
    // The request must not go out: the server would refuse it anyway, and the
    // round trip returns a less specific message.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks the save on a future invoice date", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Invoice date", "2099-01-01");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText(/cannot be dated in the future/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks the save on a malformed GSTIN", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Counterparty GSTIN", "27AAPFU");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText(/A GSTIN is 15 characters/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("marks the offending input invalid and describes it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "CGST", "-5");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    const input = screen.getByLabelText("CGST");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    // The message must be attached to the field, not left as loose text.
    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy)).toHaveTextContent("cannot be negative");
  });

  it("does not complain while a field is still being typed", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Mid-typing a GSTIN is not an error worth showing.
    await retype(user, "Counterparty GSTIN", "27AAP");
    expect(screen.queryByText(/A GSTIN is 15 characters/)).toBeNull();
  });

  it("complains once the field is left", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Counterparty GSTIN", "27AAP");
    await user.tab();

    expect(await screen.findByText(/A GSTIN is 15 characters/)).toBeInTheDocument();
  });

  it("warns about a total that does not add up but still saves it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Total value", "9999");
    // A warning, not a block: the user must be able to record what the paper
    // actually says, and rounding disputes are real.
    expect(await screen.findByText(/but the total says/)).toBeInTheDocument();

    global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ total_value: "9999.00" })));
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Corrections saved.")).toBeInTheDocument();
  });

  it("warns when a supply is both interstate and intrastate", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "IGST", "180");
    expect(
      await screen.findByText(/interstate or intrastate, not both/),
    ).toBeInTheDocument();
  });

  it("clears a field by sending null, not an empty string", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "HSN/SAC", "");
    global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ hsn_code: null })));
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ hsn_code: null });
  });

  it("surfaces a server rejection", async () => {
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Invoice number", "INV-2");
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Invoice already filed for this period" }, { status: 409 }),
    );
    await user.click(screen.getByRole("button", { name: "Save corrections" }));

    expect(await screen.findByText("Invoice already filed for this period")).toBeInTheDocument();
  });

  it("shows extraction warnings from the server", async () => {
    await renderPage(invoice({ warnings: ["No valid supplier GSTIN found"] }));
    expect(screen.getByText("No valid supplier GSTIN found")).toBeInTheDocument();
  });

  describe("re-extracting from the stored file", () => {
    it("replaces the form with what the second pass found", async () => {
      // The point of the button: the first extraction read the wrong GSTIN,
      // the user re-runs it, and the form must show the new value rather than
      // the stale one they were about to correct by hand.
      const user = userEvent.setup();
      await renderPage();
      global.fetch.mockResolvedValueOnce(
        jsonResponse(invoice({ counterparty_gstin: "29AAGCB7383J1Z4", parsed_with: "model" })),
      );

      await user.click(screen.getByRole("button", { name: "Re-extract" }));

      await waitFor(() =>
        expect(screen.getByText("Re-extracted from the stored file.")).toBeInTheDocument(),
      );
      const [url, options] = global.fetch.mock.calls.at(-1);
      expect(String(url)).toContain("/invoices/42/reparse");
      expect(options.method).toBe("POST");
      // The assertion the comment above has always described. The form is a
      // working copy of the invoice, and only the initial load used to refresh
      // it — so the panel showed the re-extracted GSTIN while the input the
      // user types into still held the one extraction had just replaced.
      expect(screen.getByLabelText("Counterparty GSTIN")).toHaveValue("29AAGCB7383J1Z4");
    });

    it("does not write the pre-extraction values back over the new ones", async () => {
      // The destructive half of the same gap, and only two clicks away:
      // re-extract, then save. Saving diffs the form against the invoice, so a
      // form still holding the old values sends every one of them as a
      // correction and undoes the extraction the user just asked for.
      const user = userEvent.setup();
      await renderPage();
      global.fetch.mockResolvedValueOnce(
        jsonResponse(
          invoice({
            counterparty_gstin: "29AAGCB7383J1Z4",
            counterparty_name: "Northwind Supplies",
            taxable_value: "2000.00",
          }),
        ),
      );

      await user.click(screen.getByRole("button", { name: "Re-extract" }));
      await waitFor(() =>
        expect(screen.getByText("Re-extracted from the stored file.")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      // Nothing was edited after the re-extraction, so there is nothing to
      // send — and certainly not the values it replaced.
      await screen.findByText("Nothing changed.");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("leaves the form agreeing with what the save actually stored", async () => {
      // The server settles the figure — money lands on the column's two
      // decimal places — so a draft left as typed disagrees with the invoice
      // beside it and is re-sent as a change on the next save.
      const user = userEvent.setup();
      await renderPage();

      await retype(user, "Taxable value", "2000");
      global.fetch.mockResolvedValueOnce(
        jsonResponse(invoice({ taxable_value: "2000.00" })),
      );
      await user.click(screen.getByRole("button", { name: "Save corrections" }));
      await screen.findByText("Corrections saved.");

      expect(screen.getByLabelText("Taxable value")).toHaveValue(2000);

      await user.click(screen.getByRole("button", { name: "Save corrections" }));
      await screen.findByText("Nothing changed.");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("surfaces a failure instead of leaving the button spinning", async () => {
      const user = userEvent.setup();
      await renderPage();
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Original file is no longer stored" }, { status: 409 }),
      );

      await user.click(screen.getByRole("button", { name: "Re-extract" }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("Original file is no longer stored"),
      );
      // busy must be cleared in `finally`, or the only way to retry is a reload.
      expect(screen.getByRole("button", { name: "Re-extract" })).toBeEnabled();
    });
  });

  describe("deleting the invoice", () => {
    it("asks before removing anything", async () => {
      // Deleting an invoice changes a filed period's figures, so the confirm
      // is the guard rail and a stray click must not get past it.
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await renderPage();
      const callsBefore = global.fetch.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(confirm).toHaveBeenCalled();
      expect(global.fetch.mock.calls).toHaveLength(callsBefore);
      expect(screen.getByLabelText("Counterparty GSTIN")).toBeInTheDocument();
    });

    it("deletes and returns to the list once confirmed", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderPage();
      global.fetch.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        const [url, options] = global.fetch.mock.calls.at(-1);
        expect(String(url)).toContain("/invoices/42");
        expect(options.method).toBe("DELETE");
      });
      // Staying on the detail page for a record that no longer exists would
      // show a form whose every save 404s.
      await waitFor(() =>
        expect(screen.queryByLabelText("Counterparty GSTIN")).not.toBeInTheDocument(),
      );
    });

    it("keeps the user on the page when the delete is refused", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderPage();
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Invoice is part of a filed return" }, { status: 409 }),
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("Invoice is part of a filed return"),
      );
      expect(screen.getByLabelText("Counterparty GSTIN")).toBeInTheDocument();
    });
  });

  describe("moving from one invoice to another", () => {
    /**
     * The route is `/invoices/:id`, and React Router keeps one component
     * instance across a parameter change. So the second invoice does not arrive
     * on a fresh page — it arrives on the previous invoice's page, and the test
     * has to move between the two the way the browser does.
     */
    function renderAtFortyTwo() {
      return render(
        <MemoryRouter initialEntries={["/invoices/42"]}>
          <Link to="/invoices/43">Open 43</Link>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    /** Follow the link to invoice 43, the way the browser would. */
    const openFortyThree = (user) =>
      user.click(screen.getByRole("link", { name: "Open 43" }));

    /** A fetch that hands back the levers instead of resolving on its own. */
    function deferredFetch() {
      const pending = [];
      global.fetch = vi.fn(
        (url, options = {}) =>
          new Promise((resolve, reject) => {
            pending.push({
              url: String(url),
              method: options.method ?? "GET",
              body: options.body,
              signal: options.signal,
              answer: (body, init) => resolve(jsonResponse(body, init)),
            });
            options.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted.");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
      return pending;
    }

    it("does not leave one invoice in the form under another one's id", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");

      // On to /invoices/43. Its request is still in flight.
      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(2));
      expect(pending[1].url).toContain("/invoices/43");

      // Nothing from invoice 42 may still be on screen: the form is a working
      // copy of one invoice, and every control on it now writes to 43. Saving
      // from here PATCHed 42's GSTIN, dates and figures onto invoice 43.
      expect(screen.queryByDisplayValue("27AAPFU0939F1ZV")).not.toBeInTheDocument();
      expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
      expect(screen.getByText("Loading invoice…")).toBeInTheDocument();
    });

    it("abandons the request the next invoice supersedes", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(2));

      expect(pending[0].url).toContain("/invoices/42");
      expect(pending[0].signal.aborted).toBe(true);
      expect(pending[1].signal.aborted).toBe(false);
    });

    it("does not let a slow earlier invoice overwrite the one asked for", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(2));

      // 43 answers first: responses do not come back in the order they were
      // sent, and the id in the URL is the only thing naming which is which.
      pending[1].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      pending[0].answer(invoice());

      await waitFor(() =>
        expect(screen.getByText("INV-2026-0043")).toBeInTheDocument(),
      );
      expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
    });

    it("does not raise an error banner for a request it cancelled itself", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(2));
      pending[1].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));

      await screen.findByText("INV-2026-0043");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
