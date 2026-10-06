import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BusyCompare from "./BusyCompare";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <BusyCompare />
    </MemoryRouter>,
  );
}

describe("BusyCompare", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/DoAide GST vs Busy Accounting/);
  });

  it("renders feature comparison table", () => {
    renderPage();
    expect(screen.getByText("Feature Comparison")).toBeInTheDocument();
    expect(screen.getByText("Inventory Management")).toBeInTheDocument();
  });

  it("renders pricing showing Busy costs", () => {
    renderPage();
    expect(screen.getByText(/7,200\/yr/)).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText(/Is DoAide GST free compared to Busy/);
    await userEvent.click(faqButton);
    expect(screen.getByText(/DoAide GST is free for up to 50 invoices/)).toBeInTheDocument();
  });

  it("links to other comparison pages", () => {
    renderPage();
    expect(screen.getByText("DoAide GST vs ClearTax")).toBeInTheDocument();
    expect(screen.getByText("DoAide GST vs Tally Prime")).toBeInTheDocument();
  });
});
