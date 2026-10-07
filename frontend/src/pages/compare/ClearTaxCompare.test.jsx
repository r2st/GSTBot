import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ClearTaxCompare from "./ClearTaxCompare";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <ClearTaxCompare />
    </MemoryRouter>,
  );
}

describe("ClearTaxCompare", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/DoAide GST vs ClearTax/);
  });

  it("renders the feature comparison table", () => {
    renderPage();
    expect(screen.getByText("Feature Comparison")).toBeInTheDocument();
    expect(screen.getAllByText("GST Calculator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("AI Invoice Parsing")).toBeInTheDocument();
  });

  it("renders pricing comparison section", () => {
    renderPage();
    expect(screen.getByText("Pricing Comparison")).toBeInTheDocument();
    expect(screen.getAllByText(/Free/).length).toBeGreaterThan(0);
  });

  it("renders pros and cons for both platforms", () => {
    renderPage();
    expect(screen.getByText("Pros and Cons")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 });
    const h3Texts = headings.map((h) => h.textContent);
    expect(h3Texts).toContain("DoAide GST");
    expect(h3Texts).toContain("ClearTax");
  });

  it("renders the CTA section with links", () => {
    renderPage();
    expect(screen.getByText("Try DoAide GST Free")).toBeInTheDocument();
    expect(screen.getByText("Create Free Account")).toBeInTheDocument();
  });

  it("renders FAQ section with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("Is DoAide GST really free?");
    expect(faqButton).toBeInTheDocument();
    await userEvent.click(faqButton);
    expect(screen.getByText(/DoAide GST offers all core tools/)).toBeInTheDocument();
  });

  it("renders internal links to other comparison pages", () => {
    renderPage();
    expect(screen.getByText("DoAide GST vs Zoho GST")).toBeInTheDocument();
    expect(screen.getByText("DoAide GST vs Tally Prime")).toBeInTheDocument();
    expect(screen.getByText("DoAide GST vs Busy Accounting")).toBeInTheDocument();
  });

  it("renders the ToolsNav", () => {
    renderPage();
    expect(screen.getByRole("navigation", { name: "GST tools" })).toBeInTheDocument();
  });
});
