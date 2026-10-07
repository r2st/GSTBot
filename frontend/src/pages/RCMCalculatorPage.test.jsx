import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RCMCalculatorPage from "./RCMCalculatorPage";

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
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/rcm-calculator"]}>
      <RCMCalculatorPage />
    </MemoryRouter>,
  );
}

describe("RCMCalculatorPage", () => {
  it("renders the title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "RCM Calculator" })).toBeInTheDocument();
  });

  it("calculates RCM for legal services", async () => {
    renderPage();
    const input = screen.getByPlaceholderText("Enter taxable value");
    await userEvent.type(input, "100000");
    expect(screen.getAllByText("₹18,000.00").length).toBeGreaterThanOrEqual(1);
  });

  it("adds and removes entries", async () => {
    renderPage();
    const addButton = screen.getByText("+ Add Another Service");
    await userEvent.click(addButton);
    expect(screen.getAllByText("Entry #1")).toHaveLength(1);
    expect(screen.getAllByText("Entry #2")).toHaveLength(1);
    const removeButtons = screen.getAllByText("Remove");
    await userEvent.click(removeButtons[1]);
    expect(screen.queryByText("Entry #2")).not.toBeInTheDocument();
  });

  it("shows summary when entries have values", async () => {
    renderPage();
    const input = screen.getByPlaceholderText("Enter taxable value");
    await userEvent.type(input, "100000");
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText(/Total RCM Liability/)).toBeInTheDocument();
    expect(screen.getByText(/Total ITC Claimable/)).toBeInTheDocument();
  });

  it("shows no RCM for GTA forward charge", async () => {
    renderPage();
    const select = screen.getByDisplayValue(/Legal services/);
    await userEvent.selectOptions(select, "gta_12");
    const input = screen.getByPlaceholderText("Enter taxable value");
    await userEvent.type(input, "50000");
    expect(screen.getByText("No RCM")).toBeInTheDocument();
  });
});
