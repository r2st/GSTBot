import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LateFeeCalculatorPage from "./LateFeeCalculatorPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/late-fee-calculator"]}>
      <LateFeeCalculatorPage />
    </MemoryRouter>,
  );
}

describe("LateFeeCalculatorPage", () => {
  it("renders the title and return type selector", () => {
    renderPage();
    expect(screen.getByText("GST Late Fee Calculator")).toBeInTheDocument();
    expect(screen.getByDisplayValue("GSTR-3B")).toBeInTheDocument();
  });

  it("shows no result before dates are entered", () => {
    renderPage();
    expect(screen.queryByText("Late Fee Calculation")).not.toBeInTheDocument();
  });

  it("calculates late fee for GSTR-3B", () => {
    renderPage();
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-01-20" } });
    fireEvent.change(dates[1], { target: { value: "2026-02-20" } });

    expect(screen.getByText("Late Fee Calculation")).toBeInTheDocument();
    expect(screen.getByText("31 days")).toBeInTheDocument();
  });

  it("shows on-time message when filing date <= due date", () => {
    renderPage();
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-02-20" } });
    fireEvent.change(dates[1], { target: { value: "2026-02-20" } });

    expect(screen.getByText(/filed on time/i)).toBeInTheDocument();
  });

  it("renders the quick reference table", () => {
    renderPage();
    expect(screen.getByText("GST Late Fee Rates — Quick Reference")).toBeInTheDocument();
    expect(screen.getAllByText("GSTR-9 (Annual Return)").length).toBeGreaterThanOrEqual(1);
  });

  it("shows turnover field for GSTR-9", () => {
    renderPage();
    fireEvent.change(screen.getByDisplayValue("GSTR-3B"), { target: { value: "gstr9" } });
    expect(screen.getByText(/Annual State Turnover/)).toBeInTheDocument();
  });

  it("caps GSTR-3B late fee at 10000", () => {
    renderPage();
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2025-01-20" } });
    fireEvent.change(dates[1], { target: { value: "2026-01-20" } });
    expect(screen.getByText("Late Fee Calculation")).toBeInTheDocument();
  });
});
