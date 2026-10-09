import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import InterestCalculatorPage from "./InterestCalculatorPage";

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
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/interest-calculator"]}>
      <InterestCalculatorPage />
    </MemoryRouter>,
  );
}

describe("InterestCalculatorPage", () => {
  it("renders the title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "GST Interest Calculator" })).toBeInTheDocument();
    expect(screen.getByText(/interest on late GST payment/)).toBeInTheDocument();
  });

  it("renders scenario dropdown with options", () => {
    renderPage();
    expect(screen.getByText(/Late payment of tax/)).toBeInTheDocument();
  });

  it("shows result when tax amount and dates are filled", async () => {
    renderPage();

    const taxInput = screen.getByPlaceholderText("Enter outstanding tax amount");
    await userEvent.type(taxInput, "100000");

    const dateInputs = screen.getAllByDisplayValue("");
    fireEvent.change(dateInputs[0], { target: { value: "2026-01-20" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-04-20" } });

    expect(screen.getByText("Interest Payable")).toBeInTheDocument();
    expect(screen.getByText("90 days")).toBeInTheDocument();
  });

  it("shows no result when payment date is before due date", async () => {
    renderPage();

    const taxInput = screen.getByPlaceholderText("Enter outstanding tax amount");
    await userEvent.type(taxInput, "100000");

    const dateInputs = screen.getAllByDisplayValue("");
    fireEvent.change(dateInputs[0], { target: { value: "2026-04-20" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-01-20" } });

    expect(screen.queryByText("Interest Payable")).not.toBeInTheDocument();
  });

  it("renders info section about Section 50", () => {
    renderPage();
    expect(screen.getByText("GST Interest Under Section 50")).toBeInTheDocument();
  });
});
