import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateCodesContext } from "../hooks/useStateCodes";
import { StubAuth } from "../test/auth";
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
    invoice_value: "1180.00",
    warnings: [],
    parsed_with: "heuristics",
    extraction_confidence: 0.8,
    ...overrides,
  };
}

async function renderPage(data = invoice(), { role } = {}) {
  global.fetch.mockResolvedValueOnce(jsonResponse(data));
  render(
    <MemoryRouter initialEntries={["/invoices/42"]}>
      <StubAuth role={role}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </StubAuth>
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

  it("identifies an invoice by its id when nothing read a number off it", async () => {
    // The heading is how someone knows which invoice they are looking at, and
    // an unreadable number is exactly the case that brought them here. An
    // empty heading over a form of empty fields gives no way to tell this
    // page from a failed load.
    await renderPage(
      invoice({
        invoice_number: null,
        counterparty_name: null,
        parsed_with: null,
        extraction_confidence: null,
      }),
    );

    expect(screen.getByRole("heading", { name: "Invoice #42" })).toBeInTheDocument();
    // And says the extraction is unattributed rather than reading "Read by".
    expect(screen.getByText(/Read by unknown/)).toBeInTheDocument();
    // A null field is an empty box, not the string "null" for the user to
    // delete before they can type the number they are reading off the paper.
    expect(screen.getByLabelText("Invoice number")).toHaveValue("");
    expect(screen.getByLabelText("Counterparty name")).toHaveValue("");
  });

  it("shows a placeholder while the invoice loads", () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/invoices/42"]}>
        <StubAuth>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </StubAuth>
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading invoice…")).toBeInTheDocument();
  });

  it("says why the invoice never arrived instead of loading forever", async () => {
    // With no invoice there is no form, so a failed load renders the same
    // branch as a slow one. Reporting it is the only thing separating "the
    // server is down" from a placeholder that never resolves.
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Invoice not found." }, { status: 404 }),
    );
    render(
      <MemoryRouter initialEntries={["/invoices/42"]}>
        <StubAuth>
          <Routes>
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          </Routes>
        </StubAuth>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Invoice not found.");
    expect(screen.queryByText("Loading invoice…")).not.toBeInTheDocument();
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

  it("warns about a sales number the portal will reject the return over", async () => {
    // Rule 46(b) allows letters, digits, '-' and '/'. Said here, while the
    // paper is still in the reviewer's hand; left to the filing screen it is a
    // line in a report a month later, after the upload has been refused.
    const user = userEvent.setup();
    await renderPage(invoice({ invoice_type: "sales" }));

    await retype(user, "Invoice number", "INV#42");

    expect(await screen.findByText(/Rule 46\(b\)/)).toBeInTheDocument();
  });

  it("leaves a supplier's own numbering alone", async () => {
    // The fixture is a purchase. That serial is the supplier's, it is what
    // GSTR-2B carries, and the buyer cannot renumber someone else's invoice.
    const user = userEvent.setup();
    await renderPage();

    await retype(user, "Invoice number", "INV#42");
    await user.tab();

    expect(screen.queryByText(/Rule 46\(b\)/)).not.toBeInTheDocument();
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

    describe("while the delete is still in flight", () => {
      /**
       * Leave the next request in flight for the rest of the test.
       *
       * Never answered on purpose. Every assertion below is about the state of
       * the page *during* the request, and answering one at the end of the
       * test lands its `setBusy(false)` — or its navigation — after the test
       * body has returned, which is a React act() warning in every one of
       * them. The unmount in `afterEach` is what ends these.
       */
      function holdNextRequest() {
        global.fetch.mockImplementationOnce(() => new Promise(() => {}));
      }

      it("will not send a second delete for the same invoice", async () => {
        // Delete used to be the one write here that never took the busy lock,
        // so its own button stayed live for the length of its own request. A
        // second click sent a second DELETE for a row already gone, and the
        // 404 that earns banners "Invoice not found" over a deletion that had
        // in fact just succeeded — a refusal describing nothing the user did.
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        holdNextRequest();
        const before = global.fetch.mock.calls.length;

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(global.fetch.mock.calls).toHaveLength(before + 1));

        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(global.fetch.mock.calls).toHaveLength(before + 1);

      });

      it("locks the button rather than only ignoring the second click", async () => {
        // Disabled, not merely inert: a live button that does nothing is how
        // someone concludes the first click missed and keeps clicking.
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        holdNextRequest();

        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled(),
        );
      });

      it("keeps its label while it is locked", async () => {
        // `busy` is one lock across all three writes, so renaming this button
        // to "Deleting…" would make it say so during a save started from the
        // form below. Re-extract beside it keeps its label for the same
        // reason; the disabled state is what carries the in-flight news.
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        holdNextRequest();

        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled(),
        );
        expect(screen.queryByRole("button", { name: /Deleting/ })).toBeNull();
      });

      it("locks the other two writes against the row being removed", async () => {
        // Save and Re-extract were left clickable through a delete, which is
        // the pair of requests that races to decide whether the invoice still
        // exists: whether a PATCH is accepted after the DELETE, or refused by
        // it, came down to which one the server happened to finish first.
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        holdNextRequest();

        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Re-extract" })).toBeDisabled(),
        );
        expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
      });

      it("does not let the submit button claim a save is under way", async () => {
        // It said "Saving…" off the shared lock, which was already untrue
        // during a re-extract and is worse over a row being deleted. The other
        // three pages that share a busy lock this way all say "Working…".
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        holdNextRequest();

        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Working…" })).toBeInTheDocument(),
        );
        expect(screen.queryByRole("button", { name: /Saving/ })).toBeNull();
      });

      it("clears any earlier banner instead of leaving it over the attempt", async () => {
        // The other two writes blank the error as they start. Without the same
        // line here, a refusal from the previous attempt sits over a delete
        // that is going through, and there is no way to tell the stale banner
        // from a fresh one.
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderPage();
        global.fetch.mockResolvedValueOnce(
          jsonResponse({ detail: "Invoice is part of a filed return" }, { status: 409 }),
        );

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

        holdNextRequest();
        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      });
    });

    it("gives the buttons back when the delete is refused", async () => {
      // The lock has to be released in `finally`, or a refusal that a retry
      // could clear — a period unlocked, a filing withdrawn — leaves a page
      // whose only way forward is a reload.
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await renderPage();
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Invoice is part of a filed return" }, { status: 409 }),
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled(),
      );
      expect(screen.getByRole("button", { name: "Re-extract" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Save corrections" })).toBeEnabled();
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
          <StubAuth>
            <Link to="/invoices/43">Open 43</Link>
            <Routes>
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            </Routes>
          </StubAuth>
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

    // Clearing the form on the way in stops one invoice's values being *sent*
    // to another's id. These are the other direction: a write that was already
    // in flight, answering onto the page of the invoice that replaced it.
    it("does not land a save for the invoice that was left on the one opened after it", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await retype(user, "Counterparty name", "Acme Supplies Pvt Ltd");
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(pending).toHaveLength(2));
      expect(pending[1].method).toBe("PATCH");
      expect(pending[1].url).toContain("/invoices/42");

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      // The PATCH answers with the invoice it wrote — invoice 42. Adopting it
      // makes the form a working copy of 42 again while the URL, and every
      // control on the page, still name 43. The next save then PATCHes 42's
      // GSTIN, dates and figures onto 43: the same corruption clearing the
      // form on the way in was added to prevent, arriving by the other door.
      pending[1].answer(invoice({ counterparty_name: "Acme Supplies Pvt Ltd" }));

      await waitFor(() =>
        expect(screen.getByText("INV-2026-0043")).toBeInTheDocument(),
      );
      expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("Acme Supplies Pvt Ltd")).not.toBeInTheDocument();
    });

    it("does not banner a superseded save's failure over the invoice opened after it", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await retype(user, "Counterparty name", "Acme Supplies Pvt Ltd");
      await user.click(screen.getByRole("button", { name: "Save corrections" }));
      await waitFor(() => expect(pending).toHaveLength(2));

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      // The refusal is about invoice 42, which is not the invoice this page
      // is showing any more. Left unguarded it sits over invoice 43, telling
      // someone who has not touched it that their correction was rejected.
      pending[1].answer({ detail: "Invoice 42 is locked." }, { status: 409 });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save corrections" })).not.toBeDisabled(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not land a re-extraction for the invoice that was left on the one opened after it", async () => {
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await user.click(screen.getByRole("button", { name: "Re-extract" }));

      await waitFor(() => expect(pending).toHaveLength(2));
      expect(pending[1].url).toContain("/invoices/42/reparse");

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      // Re-extraction is a second model pass over the stored file, so it is
      // the slowest write on this page and the one most likely to still be
      // running when the user moves on.
      pending[1].answer(invoice({ counterparty_name: "Reparsed Name" }));

      await waitFor(() =>
        expect(screen.getByText("INV-2026-0043")).toBeInTheDocument(),
      );
      expect(screen.queryByText("INV-2026-0042")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("Reparsed Name")).not.toBeInTheDocument();
    });

    it("does not banner a superseded re-extraction's failure over the next invoice", async () => {
      // The same guard on the other arm. The re-extraction is a model call, so
      // failing is the ordinary outcome when the key is missing or throttled —
      // and "no extraction key configured" over an invoice the user has just
      // opened and is correcting names a failure that did not happen to it.
      const user = userEvent.setup();
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await user.click(screen.getByRole("button", { name: "Re-extract" }));
      await waitFor(() => expect(pending).toHaveLength(2));

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      pending[1].answer({ detail: "Extraction is unavailable" }, { status: 503 });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Re-extract" })).toBeEnabled(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    // Delete is the only write on this page that can move the user, so a
    // superseded one lands harder than a superseded save: it does not put the
    // wrong values on screen, it takes the screen away.
    it("does not pull the user off the invoice opened after the one being deleted", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(pending).toHaveLength(2));
      expect(pending[1].method).toBe("DELETE");
      expect(pending[1].url).toContain("/invoices/42");

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");
      await retype(user, "Counterparty name", "Half-typed correction");

      // 42's delete lands now. Leaving for the list is right for 42 and wrong
      // for whoever is mid-correction on 43.
      pending[1].answer({}, { status: 204 });

      await waitFor(() =>
        expect(screen.getByText("INV-2026-0043")).toBeInTheDocument(),
      );
      expect(screen.getByLabelText("Counterparty GSTIN")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Half-typed correction")).toBeInTheDocument();
    });

    it("does not banner a superseded delete's refusal over the invoice opened after it", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const pending = deferredFetch();
      renderAtFortyTwo();

      await waitFor(() => expect(pending).toHaveLength(1));
      pending[0].answer(invoice());
      await screen.findByLabelText("Counterparty GSTIN");
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(pending).toHaveLength(2));

      await openFortyThree(user);
      await waitFor(() => expect(pending).toHaveLength(3));
      pending[2].answer(invoice({ id: 43, invoice_number: "INV-2026-0043" }));
      await screen.findByText("INV-2026-0043");

      // The refusal is about invoice 42. Over invoice 43 it reads as 43 being
      // the one that is part of a filed return and cannot be removed.
      pending[1].answer({ detail: "Invoice 42 is part of a filed return" }, { status: 409 });

      await waitFor(() =>
        expect(screen.getByText("INV-2026-0043")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
  describe("the facts that decide what the credit is worth", () => {
    // Rule 37 reverses the whole of an invoice's credit once it is 180 days
    // unpaid, and Rule 43 spreads a capital good's credit over sixty months.
    // The API has always taken all four of these fields; nothing in the app
    // could send them, so a business six months in had credit reversed on
    // invoices it had paid on time — in a GSTR-3B it then filed.

    it("offers the ledger facts no extraction can supply", async () => {
      await renderPage();

      expect(screen.getByLabelText("Supplier paid on")).toBeInTheDocument();
      expect(screen.getByLabelText("Capital goods")).toBeInTheDocument();
      expect(screen.getByLabelText("Credit is claimable")).toBeInTheDocument();
      expect(screen.getByLabelText("Reverse charge")).toBeInTheDocument();
    });

    it("fills the flags from the invoice rather than from a string", async () => {
      // Coerced through "" the way the text fields are, a false flag would
      // arrive as the string "false" — which is truthy, so every unticked box
      // would tick itself.
      await renderPage(
        invoice({ itc_eligible: true, reverse_charge: false, is_capital_good: false }),
      );

      expect(screen.getByLabelText("Credit is claimable")).toBeChecked();
      expect(screen.getByLabelText("Reverse charge")).not.toBeChecked();
      expect(screen.getByLabelText("Capital goods")).not.toBeChecked();
    });

    it("records a payment date, which is what stops the Rule 37 reversal", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ paid_at: null }));

      await retype(user, "Supplier paid on", "2026-05-01");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ paid_at: "2026-05-01" })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        paid_at: "2026-05-01",
      });
    });

    it("clears a payment date as null, which puts the clock back on", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ paid_at: "2026-05-01" }));

      await retype(user, "Supplier paid on", "");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ paid_at: null })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ paid_at: null });
    });

    it("sends an unticked flag as false, never as null", async () => {
      // `itc_eligible` is a NOT NULL column and the schema refuses an explicit
      // null on it — sent as null the save came back 422 with a message about
      // a field the user had merely unticked.
      const user = userEvent.setup();
      await renderPage(invoice({ itc_eligible: true }));

      await user.click(screen.getByLabelText("Credit is claimable"));
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ itc_eligible: false })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        itc_eligible: false,
      });
    });

    it("marks a purchase as capital goods", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ is_capital_good: false }));

      await user.click(screen.getByLabelText("Capital goods"));
      global.fetch.mockResolvedValueOnce(
        jsonResponse(invoice({ is_capital_good: true })),
      );
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        is_capital_good: true,
      });
    });

    it("leaves an untouched flag out of the request", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ itc_eligible: true, reverse_charge: false }));

      await retype(user, "Invoice number", "INV-CORRECTED");
      global.fetch.mockResolvedValueOnce(
        jsonResponse(invoice({ invoice_number: "INV-CORRECTED" })),
      );
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        invoice_number: "INV-CORRECTED",
      });
    });

    it("blocks a payment date before the invoice was issued", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ invoice_date: "2026-04-15", paid_at: null }));

      await retype(user, "Supplier paid on", "2026-01-01");
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      expect(
        await screen.findByText(/cannot have been paid before it was issued/),
      ).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("corrects a place of supply, which is what unblocks a filing", async () => {
      // "Place of supply is missing and cannot be derived from a GSTIN" is a
      // blocking error on /filing/validate, and there was no field on any
      // screen that could clear it.
      const user = userEvent.setup();
      await renderPage(invoice({ place_of_supply: null }));

      await retype(user, "Place of supply", "29");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ place_of_supply: "29" })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        place_of_supply: "29",
      });
    });

    it("blocks a place of supply that is not a state code", async () => {
      const user = userEvent.setup();
      await renderPage();

      await retype(user, "Place of supply", "ZZ");
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      expect(await screen.findByText(/two-digit state code/)).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("warns about a rate outside the slabs without blocking the save", async () => {
      const user = userEvent.setup();
      await renderPage(invoice({ tax_rate: "18" }));

      await retype(user, "Tax rate %", "15");

      expect(await screen.findByText(/is not a GST rate/)).toBeInTheDocument();
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ tax_rate: "15" })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
  });

  describe("the place of supply picker", () => {
    // The codes come from `/meta/states`, which the provider fetches once per
    // session. Supplying them through the context directly rather than mounting
    // the real provider keeps that request out of the response queue every test
    // in this file lines up — otherwise which of the two fetches went first
    // would decide whether a test saw its invoice.
    const CODES = { 27: "Maharashtra", "07": "Delhi", 29: "Karnataka" };

    async function renderWithStates(data = invoice(), codes = CODES) {
      global.fetch.mockResolvedValueOnce(jsonResponse(data));
      render(
        <StateCodesContext.Provider value={{ codes, load: () => {} }}>
          <MemoryRouter initialEntries={["/invoices/42"]}>
            <StubAuth>
              <Routes>
                <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              </Routes>
            </StubAuth>
          </MemoryRouter>
        </StateCodesContext.Provider>,
      );
      await screen.findByLabelText("Counterparty GSTIN");
      return screen.getByLabelText("Place of supply");
    }

    it("names the states instead of asking for a code from memory", async () => {
      // 06 and 09 are both plausible guesses for a Delhi invoice and neither is
      // Delhi, and the wrong one settles IGST against CGST+SGST on a return.
      const select = await renderWithStates(invoice({ place_of_supply: "27" }));

      expect(select.tagName).toBe("SELECT");
      expect(select).toHaveValue("27");
      expect(
        [...select.options].map((option) => option.textContent),
      ).toEqual(["Not stated", "07 — Delhi", "27 — Maharashtra", "29 — Karnataka"]);
    });

    it("saves the code behind the state that was picked", async () => {
      const user = userEvent.setup();
      const select = await renderWithStates(invoice({ place_of_supply: "27" }));

      await user.selectOptions(select, "29");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ place_of_supply: "29" })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        place_of_supply: "29",
      });
    });

    it("takes a place of supply back off the invoice", async () => {
      // Blank is a real answer: the API accepts an invoice without one, and it
      // is /filing/validate that refuses the period. Sent as null, which is how
      // this API clears a field, rather than as an empty string.
      const user = userEvent.setup();
      const select = await renderWithStates(invoice({ place_of_supply: "27" }));

      await user.selectOptions(select, "");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ place_of_supply: null })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        place_of_supply: null,
      });
    });

    it("shows a single-digit code as the state it means", async () => {
      // The server pads `7` to `07` on the way in, so an invoice can hold
      // either. A select whose value matches no option renders blank, which
      // would read as this invoice having no place of supply at all.
      const select = await renderWithStates(invoice({ place_of_supply: "7" }));

      expect(select).toHaveValue("07");
    });

    it("does not re-send a code it only reformatted for the screen", async () => {
      // Showing `7` as `07` must not count as an edit. It would mark an invoice
      // nobody corrected as reviewed, on a field nobody looked at.
      const user = userEvent.setup();
      await renderWithStates(invoice({ place_of_supply: "7" }));

      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      expect(await screen.findByText("Nothing changed.")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("keeps a code the server does not know, and says it is not one", async () => {
      // The API refuses an unknown code on the way in, so this is a row from
      // before that check rather than one anyone can make now. Dropping it from
      // the list would silently blank the field and write that blank back on
      // the next save — a correction to a field nobody opened the invoice for.
      const select = await renderWithStates(invoice({ place_of_supply: "45" }));

      expect(select).toHaveValue("45");
      expect(screen.getByRole("option", { name: "45 — not a GST state code" })).toBeInTheDocument();
    });

    it("is the text box again when the lookup never answered", async () => {
      // `/meta/states` is public and metered by address. A dropdown that failed
      // to populate would leave the one field that unblocks a filing unfillable.
      const user = userEvent.setup();
      const input = await renderWithStates(invoice({ place_of_supply: null }), null);

      expect(input.tagName).toBe("INPUT");
      expect(screen.getByText("Two-digit state code")).toBeInTheDocument();

      await user.type(input, "29");
      global.fetch.mockResolvedValueOnce(jsonResponse(invoice({ place_of_supply: "29" })));
      await user.click(screen.getByRole("button", { name: "Save corrections" }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        place_of_supply: "29",
      });
    });
  });
});

describe("a viewer", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("is not offered the three writes this screen has", async () => {
    await renderPage(invoice(), { role: "viewer" });

    expect(screen.queryByRole("button", { name: "Re-extract" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Save corrections/ })).toBeNull();
  });

  it("keeps every extracted field on screen, because reading them is the point", async () => {
    await renderPage(invoice(), { role: "viewer" });

    expect(screen.getByLabelText("Counterparty GSTIN")).toHaveValue("27AAPFU0939F1ZV");
    expect(screen.getByLabelText("Invoice number")).toHaveValue("INV-2026-0042");
  });

  it("cannot type into a field whose edit could never be saved", async () => {
    // The fields stay rather than being swapped for text, so without this they
    // would accept an edit and silently drop it — a correction someone made,
    // watched appear on screen, and never filed.
    await renderPage(invoice(), { role: "viewer" });

    expect(screen.getByLabelText("Counterparty GSTIN")).toBeDisabled();
    expect(screen.getByLabelText("Capital goods")).toBeDisabled();
  });

  it("leaves an owner all three", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: "Re-extract" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save corrections/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Counterparty GSTIN")).toBeEnabled();
  });
});
