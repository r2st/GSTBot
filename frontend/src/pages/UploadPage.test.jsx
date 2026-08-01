import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadPage from "./UploadPage";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

function invoiceResponse(overrides = {}) {
  return {
    queued: false,
    message: "Invoice processed",
    invoice: {
      id: 1,
      invoice_number: "INV-2026-0042",
      counterparty_gstin: "29AAGCB7383J1Z4",
      invoice_date: "2026-04-15",
      total_value: "531000.00",
      warnings: [],
      ...overrides,
    },
  };
}

function file(name = "invoice.txt") {
  return new File(["invoice text"], name, { type: "text/plain" });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

describe("UploadPage", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("uploads a file and shows what was extracted", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText(/₹5,31,000.00/)).toBeInTheDocument();
  });

  it("defaults to a purchase, since that is what ITC is claimed on", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    expect(screen.getByLabelText("Purchase (claim ITC)")).toBeChecked();

    await user.upload(screen.getByLabelText("Choose files"), file());
    await waitFor(() => {
      expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("purchase");
    });
  });

  it("sends the chosen type when uploading a sales invoice", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    await user.click(screen.getByLabelText("Sales (feeds GSTR-1)"));
    await user.upload(screen.getByLabelText("Choose files"), file());

    await waitFor(() => {
      expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("sales");
    });
  });

  it("shows extraction warnings rather than hiding them", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse(invoiceResponse({ warnings: ["No valid supplier GSTIN found"] })),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    // A flagged invoice can be corrected; a silently-accepted bad one is
    // filed wrong.
    expect(await screen.findByText("No valid supplier GSTIN found")).toBeInTheDocument();
  });

  it("reports a per-file failure without losing the batch", async () => {
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: { message: "This file was already uploaded as invoice 3", invoice_id: 3 } },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse(invoiceResponse({ invoice_number: "INV-2" })));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText(/already uploaded as invoice 3/)).toBeInTheDocument();
    expect(await screen.findByText("INV-2")).toBeInTheDocument();
  });

  it("uploads a batch one file at a time", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
    ]);

    // Sequential rather than concurrent: a burst hits the free tier's rate
    // limit and every invoice after the first falls back to heuristics.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  it("surfaces the plan limit as the server stated it", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse(
        { detail: "Plan 'free' allows 50 invoices per month. Upgrade to continue uploading." },
        { status: 402 },
      ),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    expect(await screen.findByText(/Upgrade to continue uploading/)).toBeInTheDocument();
  });
});
