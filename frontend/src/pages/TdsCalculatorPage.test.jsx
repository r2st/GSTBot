import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TdsCalculatorPage from "./TdsCalculatorPage";

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
    <MemoryRouter initialEntries={["/tds-calculator"]}>
      <TdsCalculatorPage />
    </MemoryRouter>,
  );
}

describe("TdsCalculatorPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /GST TDS Calculator/i })).toBeInTheDocument();
    expect(screen.getByText(/Tax Deducted at Source under GST/)).toBeInTheDocument();
  });

  it("shows TDS not applicable when contract is below threshold", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/total contract value/i), "200000");
    await userEvent.type(screen.getByPlaceholderText(/current payment amount/i), "200000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("No");
    expect(result.textContent).toContain("2,50,000");
  });

  it("calculates intra-state TDS at 2% with CGST and SGST split", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/total contract value/i), "500000");
    await userEvent.type(screen.getByPlaceholderText(/current payment amount/i), "300000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Yes");
    expect(result.textContent).toContain("CGST TDS (1%)");
    expect(result.textContent).toContain("SGST TDS (1%)");
  });

  it("calculates inter-state TDS as IGST", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/total contract value/i), "500000");
    await userEvent.type(screen.getByPlaceholderText(/current payment amount/i), "300000");
    await userEvent.click(screen.getByLabelText(/Inter-state supply/));

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("IGST");
  });

  it("shows share buttons on result", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/total contract value/i), "500000");
    await userEvent.type(screen.getByPlaceholderText(/current payment amount/i), "300000");

    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText(/TDS rate under GST/)).toBeInTheDocument();
  });

  it("renders related tools", () => {
    renderPage();
    expect(screen.getByText("More Free GST Tools")).toBeInTheDocument();
  });
});
