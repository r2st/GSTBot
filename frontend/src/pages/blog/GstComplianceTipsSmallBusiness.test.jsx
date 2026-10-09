import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstComplianceTipsSmallBusiness from "./GstComplianceTipsSmallBusiness";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstComplianceTipsSmallBusiness />
    </MemoryRouter>,
  );
}

describe("GstComplianceTipsSmallBusiness", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText(/10 GST Compliance Tips/)).toBeInTheDocument();
  });

  it("renders all 10 tip sections", () => {
    renderArticle();
    expect(screen.getByText("1. Validate Every Supplier GSTIN Before Booking")).toBeInTheDocument();
    expect(screen.getByText("2. Reconcile GSTR-2B Monthly — Before Filing 3B")).toBeInTheDocument();
    expect(screen.getByText("3. Never Miss a Deadline — Set Up Calendar Alerts")).toBeInTheDocument();
    expect(screen.getByText("4. Keep Your HSN Codes Accurate")).toBeInTheDocument();
    expect(screen.getByText("5. Understand Reverse Charge Obligations")).toBeInTheDocument();
    expect(screen.getByText("6. Evaluate the Composition Scheme Annually")).toBeInTheDocument();
    expect(screen.getByText("7. Issue Proper GST Invoices From Day One")).toBeInTheDocument();
    expect(screen.getByText("8. Maintain Records for 72 Months")).toBeInTheDocument();
    expect(screen.getByText("9. File Annual Returns Even If Turnover Is Low")).toBeInTheDocument();
    expect(screen.getByText("10. Separate Business and Personal Expenses")).toBeInTheDocument();
  });

  it("renders the FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What happens if I miss a GST filing deadline?")).toBeInTheDocument();
  });

  it("links to related tools", () => {
    renderArticle();
    const validatorLink = screen.getByRole("link", { name: "free GSTIN validator" });
    expect(validatorLink).toHaveAttribute("href", "/gstin-validator");
    const rcmLink = screen.getByRole("link", { name: "RCM calculator" });
    expect(rcmLink).toHaveAttribute("href", "/rcm-calculator");
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();
    const link = screen.getByText(/Get started with DoAide GST/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
