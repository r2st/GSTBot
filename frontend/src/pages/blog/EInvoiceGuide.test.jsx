import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EInvoiceGuide from "./EInvoiceGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <EInvoiceGuide />
    </MemoryRouter>,
  );
}

describe("EInvoiceGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("E-Invoice Under GST: Applicability, Format, and Process")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What Is E-Invoicing Under GST?")).toBeInTheDocument();
    expect(screen.getByText("E-Invoice Applicability: Who Needs to Generate?")).toBeInTheDocument();
    expect(screen.getByText("E-Invoice Schema and Format")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step E-Invoice Generation Process")).toBeInTheDocument();
    expect(screen.getByText("Penalties for Non-Compliance")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is the turnover threshold for e-invoicing in 2026?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/gstin-validator");
    expect(hrefs).toContain("/hsn-sac-finder");
    expect(hrefs).toContain("/calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
