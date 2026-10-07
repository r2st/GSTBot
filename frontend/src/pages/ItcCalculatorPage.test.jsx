import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ItcCalculatorPage from "./ItcCalculatorPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../components/DeadlineBanner", () => ({ default: () => null }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/itc-calculator"]}>
      <ItcCalculatorPage />
    </MemoryRouter>,
  );
}

describe("ItcCalculatorPage", () => {
  it("renders the title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "ITC Calculator" })).toBeInTheDocument();
  });

  it("shows no result when all inputs are empty", () => {
    renderPage();
    expect(screen.queryByText("Net Claimable ITC")).not.toBeInTheDocument();
  });

  it("calculates eligible ITC from business purchases", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0");
    await userEvent.type(inputs[0], "50000");
    expect(screen.getByText("Net Claimable ITC")).toBeInTheDocument();
    expect(screen.getAllByText(/₹50,000/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows blocked credits separately", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0");
    await userEvent.type(inputs[0], "50000");
    await userEvent.type(inputs[2], "10000");
    expect(screen.getAllByText(/Blocked Credits/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/₹10,000/).length).toBeGreaterThanOrEqual(1);
  });

  it("calculates proportional reversal when exempt turnover entered", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0");
    await userEvent.type(inputs[0], "100000");
    const exemptInput = inputs[inputs.length - 2];
    const totalInput = inputs[inputs.length - 1];
    await userEvent.type(exemptInput, "200000");
    await userEvent.type(totalInput, "1000000");
    expect(screen.getAllByText(/Proportional Reversal/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows ITC utilisation percentage", async () => {
    renderPage();
    const inputs = screen.getAllByPlaceholderText("0");
    await userEvent.type(inputs[0], "50000");
    expect(screen.getByText("ITC Utilisation")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows the how-it-works section", () => {
    renderPage();
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    expect(screen.getByText("Enter GST Paid")).toBeInTheDocument();
  });
});
