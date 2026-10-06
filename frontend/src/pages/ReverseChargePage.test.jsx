import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ReverseChargePage from "./ReverseChargePage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
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
    <MemoryRouter initialEntries={["/reverse-charge"]}>
      <ReverseChargePage />
    </MemoryRouter>,
  );
}

describe("ReverseChargePage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Reverse Charge Calculator" })).toBeInTheDocument();
    expect(screen.getByText(/Calculate your GST liability under Reverse Charge/)).toBeInTheDocument();
  });

  it("shows applicable result for legal services", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Applicable");
    expect(result.textContent).toContain("CGST");
    expect(result.textContent).toContain("SGST");
  });

  it("shows IGST for interstate supply", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");
    await userEvent.click(screen.getByLabelText(/Interstate supply/));

    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("IGST");
  });

  it("shows not applicable for GTA forward charge", async () => {
    renderPage();
    await userEvent.selectOptions(
      screen.getAllByRole("combobox")[0],
      "gta_18",
    );
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Not Applicable");
  });

  it("calculates correct RCM at 18%", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("₹18,000");
  });

  it("shows share buttons on result", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/taxable value/i), "100000");
    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText(/What is Reverse Charge Mechanism/)).toBeInTheDocument();
  });

  it("renders related tools", () => {
    renderPage();
    expect(screen.getByText("More Free GST Tools")).toBeInTheDocument();
  });
});
