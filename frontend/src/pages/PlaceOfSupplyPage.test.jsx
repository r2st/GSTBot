import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PlaceOfSupplyPage from "./PlaceOfSupplyPage";

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
    <MemoryRouter initialEntries={["/place-of-supply"]}>
      <PlaceOfSupplyPage />
    </MemoryRouter>,
  );
}

describe("PlaceOfSupplyPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Place of Supply Determiner/i })).toBeInTheDocument();
    expect(screen.getByText(/Find out whether your transaction/)).toBeInTheDocument();
  });

  it("shows intra-state when supplier and recipient are in the same state", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0], "27");
    await userEvent.selectOptions(selects[1], "27");
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Intra-State");
    expect(result.textContent).toContain("CGST");
    expect(result.textContent).toContain("SGST");
  });

  it("shows inter-state when supplier and recipient are in different states", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0], "27");
    await userEvent.selectOptions(selects[1], "29");
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Inter-State");
    expect(result.textContent).toContain("IGST");
  });

  it("calculates correct tax at the selected rate", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0], "27");
    await userEvent.selectOptions(selects[1], "27");
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("9%");
    expect(result.textContent).toContain("CGST");
    expect(result.textContent).toContain("SGST");
  });

  it("shows share buttons on result", async () => {
    renderPage();
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0], "27");
    await userEvent.selectOptions(selects[1], "27");
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
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
