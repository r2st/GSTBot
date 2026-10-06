import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TallyCompare from "./TallyCompare";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <TallyCompare />
    </MemoryRouter>,
  );
}

describe("TallyCompare", () => {
  it("renders the heading about web vs desktop", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Web-Based vs Desktop/);
  });

  it("renders platform comparison row", () => {
    renderPage();
    expect(screen.getByText("Web-based (any browser)")).toBeInTheDocument();
    expect(screen.getByText("Desktop software (Windows)")).toBeInTheDocument();
  });

  it("renders pricing showing Tally costs", () => {
    renderPage();
    expect(screen.getByText(/18,000\/yr/)).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText(/Is Tally Prime available on Mac/);
    await userEvent.click(faqButton);
    expect(screen.getByText(/Tally Prime is Windows-only/)).toBeInTheDocument();
  });

  it("links to other comparison pages", () => {
    renderPage();
    expect(screen.getByText("DoAide GST vs Busy Accounting")).toBeInTheDocument();
  });
});
