import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BestGstSoftwarePage from "./BestGstSoftwarePage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <BestGstSoftwarePage />
    </MemoryRouter>,
  );
}

describe("BestGstSoftwarePage", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Best GST Software in India/);
  });

  it("renders ranking table with all 10 software entries", () => {
    renderPage();
    expect(screen.getByText("DoAide GST")).toBeInTheDocument();
    expect(screen.getByText("ClearTax")).toBeInTheDocument();
    expect(screen.getByText("Tally Prime")).toBeInTheDocument();
    expect(screen.getByText("Busy Accounting")).toBeInTheDocument();
    expect(screen.getByText("Vyapar")).toBeInTheDocument();
    expect(screen.getByText("Gen GST")).toBeInTheDocument();
  });

  it("renders detailed reviews section", () => {
    renderPage();
    expect(screen.getByText("Detailed Reviews")).toBeInTheDocument();
  });

  it("renders ranking criteria section", () => {
    renderPage();
    expect(screen.getByText(/How We Ranked/)).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("What is the best free GST software in India?");
    await userEvent.click(faqButton);
    expect(screen.getByText(/DoAide GST is the best free GST software/)).toBeInTheDocument();
  });

  it("renders CTA section", () => {
    renderPage();
    expect(screen.getByText(/The #1 Free GST Software/)).toBeInTheDocument();
  });

  it("links to comparison pages", () => {
    renderPage();
    expect(screen.getByText("DoAide GST vs ClearTax")).toBeInTheDocument();
    expect(screen.getByText("DoAide GST vs Zoho GST")).toBeInTheDocument();
    expect(screen.getByText("DoAide GST vs Tally Prime")).toBeInTheDocument();
  });
});
