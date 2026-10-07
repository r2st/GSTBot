import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ItcReconciliationGuide from "./ItcReconciliationGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <ItcReconciliationGuide />
    </MemoryRouter>,
  );
}

describe("ItcReconciliationGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("ITC Reconciliation Under GST: How to Match GSTR-2A with Purchase Register")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What Is ITC Reconciliation?")).toBeInTheDocument();
    expect(screen.getByText("GSTR-2A vs GSTR-2B: Key Differences")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step ITC Reconciliation Process")).toBeInTheDocument();
    expect(screen.getByText("Types of Mismatches and How to Resolve Them")).toBeInTheDocument();
    expect(screen.getByText("ITC Reversal Rules")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is the difference between GSTR-2A and GSTR-2B?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/gstin-validator");
    expect(hrefs).toContain("/itc-calculator");
    expect(hrefs).toContain("/hsn-sac-finder");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
