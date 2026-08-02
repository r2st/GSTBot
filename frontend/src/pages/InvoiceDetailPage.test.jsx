import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
});
