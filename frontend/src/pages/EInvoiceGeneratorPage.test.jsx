import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EInvoiceGeneratorPage from "./EInvoiceGeneratorPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/e-invoice-generator"]}>
      <EInvoiceGeneratorPage />
    </MemoryRouter>,
  );
}

describe("EInvoiceGeneratorPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /E-Invoice JSON Generator/i })).toBeInTheDocument();
    expect(screen.getByText(/GSTN schema format/)).toBeInTheDocument();
  });

  it("shows JSON output when all required fields are filled", async () => {
    renderPage();
    const gstinInputs = screen.getAllByPlaceholderText("15-digit GSTIN");
    await userEvent.type(gstinInputs[0], "27AAPFU0939F1ZV");
    await userEvent.type(gstinInputs[1], "27AADCB2230M1ZX");

    const legalNames = screen.getAllByPlaceholderText("Business legal name");
    await userEvent.type(legalNames[0], "Seller Co");
    await userEvent.type(legalNames[1], "Buyer Co");

    const selects = screen.getAllByRole("combobox");
    // selects: [0]=Supply Type, [1]=Doc Type, [2]=Seller State, [3]=Buyer State, [4]=GST Rate
    await userEvent.selectOptions(selects[2], "27");
    await userEvent.selectOptions(selects[3], "27");

    await userEvent.type(screen.getByPlaceholderText("e.g. INV-2026-001"), "INV-001");
    await userEvent.type(screen.getByPlaceholderText("Item/service description"), "Laptop");
    await userEvent.type(screen.getByPlaceholderText("e.g. 84713010"), "84713010");
    await userEvent.type(screen.getByPlaceholderText("1"), "2");
    await userEvent.type(screen.getByPlaceholderText("Per unit price"), "50000");

    expect(screen.getByText("Copy JSON")).toBeInTheDocument();
    expect(screen.getByText("Download JSON")).toBeInTheDocument();
  });

  it("shows tax breakdown for items", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[2], "27");
    await userEvent.selectOptions(selects[3], "27");

    await userEvent.type(screen.getByPlaceholderText("1"), "1");
    await userEvent.type(screen.getByPlaceholderText("Per unit price"), "10000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Assessable Value");
    expect(result.textContent).toContain("CGST");
    expect(result.textContent).toContain("SGST");
  });

  it("shows IGST for inter-state supply", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[2], "27");
    await userEvent.selectOptions(selects[3], "29");

    await userEvent.type(screen.getByPlaceholderText("1"), "1");
    await userEvent.type(screen.getByPlaceholderText("Per unit price"), "10000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("IGST");
  });

  it("renders FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
  });

  it("renders related tools", () => {
    renderPage();
    expect(screen.getByText("More Free GST Tools")).toBeInTheDocument();
  });
});
