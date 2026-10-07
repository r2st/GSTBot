import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr1FilingStepByStep from "./Gstr1FilingStepByStep";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <Gstr1FilingStepByStep />
    </MemoryRouter>,
  );
}

describe("Gstr1FilingStepByStep", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("How to File GSTR-1 Online Step by Step 2026")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getAllByText("What is GSTR-1?").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Step 1: Login to the GST Portal")).toBeInTheDocument();
    expect(screen.getByText("Step 7: Preview, Submit & File")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes to Avoid")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is the due date for GSTR-1?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/hsn-sac-finder");
    expect(hrefs).toContain("/calculator");
    expect(hrefs).toContain("/late-fee-calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
