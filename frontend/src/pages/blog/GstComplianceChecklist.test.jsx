import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstComplianceChecklist from "./GstComplianceChecklist";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstComplianceChecklist />
    </MemoryRouter>,
  );
}

describe("GstComplianceChecklist", () => {
  it("renders the article title", () => {
    renderArticle();

    expect(screen.getByText("GST Compliance Checklist for Small Businesses")).toBeInTheDocument();
  });

  it("renders all checklist sections", () => {
    renderArticle();

    expect(screen.getByText("Registration and Setup")).toBeInTheDocument();
    expect(screen.getByText("Monthly Compliance")).toBeInTheDocument();
    expect(screen.getByText("Quarterly Compliance (QRMP Scheme)")).toBeInTheDocument();
    expect(screen.getByText("Annual Compliance")).toBeInTheDocument();
    expect(screen.getByText("Input Tax Credit Best Practices")).toBeInTheDocument();
    expect(screen.getByText("Record Keeping")).toBeInTheDocument();
  });

  it("renders the penalties table", () => {
    renderArticle();

    expect(screen.getByText("Penalties for Non-Compliance")).toBeInTheDocument();
    expect(screen.getByText("Offence")).toBeInTheDocument();
    expect(screen.getByText("Penalty")).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();

    const link = screen.getByText(/Get started with DoAide GST/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
