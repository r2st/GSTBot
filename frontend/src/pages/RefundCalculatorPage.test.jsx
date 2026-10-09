import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RefundCalculatorPage from "./RefundCalculatorPage";

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
    <MemoryRouter initialEntries={["/refund-calculator"]}>
      <RefundCalculatorPage />
    </MemoryRouter>,
  );
}

describe("RefundCalculatorPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /GST Refund Calculator/i })).toBeInTheDocument();
    expect(screen.getByText(/eligible GST refund/)).toBeInTheDocument();
  });

  it("calculates export with tax payment refund", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/IGST paid on exports/i), "50000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("50,000");
    expect(result.textContent).toContain("Export with Tax Payment");
  });

  it("calculates export under LUT refund", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByRole("combobox"), "export_lut");
    await userEvent.type(screen.getByPlaceholderText(/zero-rated exports/i), "1000000");
    await userEvent.type(screen.getByPlaceholderText(/Total turnover/i), "2000000");
    await userEvent.type(screen.getByPlaceholderText(/ITC availed/i), "100000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("50,000");
  });

  it("shows zero refund when input rate is not higher than output rate for inverted duty", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByRole("combobox"), "inverted");
    await userEvent.type(screen.getByPlaceholderText(/inverted rated/i), "1000000");
    await userEvent.type(screen.getByPlaceholderText(/e.g. 18/i), "5");
    await userEvent.type(screen.getByPlaceholderText(/e.g. 5/i), "18");
    await userEvent.type(screen.getByPlaceholderText(/Total turnover/i), "1000000");
    await userEvent.type(screen.getByPlaceholderText(/ITC availed/i), "50000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("not higher");
  });

  it("shows share buttons on result", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/IGST paid on exports/i), "50000");

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
