import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ItcMismatchPage from "./ItcMismatchPage";

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
    <MemoryRouter initialEntries={["/itc-mismatch"]}>
      <ItcMismatchPage />
    </MemoryRouter>,
  );
}

describe("ItcMismatchPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "ITC Mismatch Calculator" })).toBeInTheDocument();
    expect(screen.getByText(/Compare GSTR-2A\/2B with your books/)).toBeInTheDocument();
  });

  it("starts with three empty entry rows", () => {
    renderPage();
    const gstr2aInputs = screen.getAllByPlaceholderText("0.00");
    expect(gstr2aInputs.length).toBeGreaterThanOrEqual(6);
  });

  it("shows add entry button", () => {
    renderPage();
    expect(screen.getByText("+ Add Entry")).toBeInTheDocument();
  });

  it("shows reconciliation summary when values are entered", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0.00");
    await userEvent.type(inputs[0], "1000");
    await userEvent.type(inputs[1], "1000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Reconciliation Summary");
    expect(result.textContent).toContain("Matched");
  });

  it("identifies mismatched entries when amounts differ", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0.00");
    await userEvent.type(inputs[0], "1000");
    await userEvent.type(inputs[1], "1200");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Mismatched");
  });

  it("identifies entries not in GSTR-2A when only books amount is provided", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0.00");
    await userEvent.type(inputs[1], "500");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("Not in GSTR-2A/2B");
  });

  it("shows at-risk amount for excess claims", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0.00");
    await userEvent.type(inputs[1], "5000");

    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("At Risk");
  });

  it("shows share buttons on result", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0.00");
    await userEvent.type(inputs[0], "1000");
    await userEvent.type(inputs[1], "1000");
    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText(/What is ITC mismatch in GST/)).toBeInTheDocument();
  });

  it("renders related tools", () => {
    renderPage();
    expect(screen.getByText("More Free GST Tools")).toBeInTheDocument();
  });
});
