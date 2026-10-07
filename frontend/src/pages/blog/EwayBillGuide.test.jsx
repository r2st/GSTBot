import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EwayBillGuide from "./EwayBillGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <EwayBillGuide />
    </MemoryRouter>,
  );
}

describe("EwayBillGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText(/E-Way Bill Under GST/)).toBeInTheDocument();
  });

  it("renders all major sections", () => {
    renderArticle();
    expect(screen.getByText("What is an E-Way Bill?")).toBeInTheDocument();
    expect(screen.getByText("When is an E-Way Bill Required?")).toBeInTheDocument();
    expect(screen.getByText("Who Should Generate an E-Way Bill?")).toBeInTheDocument();
    expect(screen.getByText("How to Generate an E-Way Bill")).toBeInTheDocument();
    expect(screen.getByText("Validity of E-Way Bills")).toBeInTheDocument();
    expect(screen.getByText("Penalties for Non-Compliance")).toBeInTheDocument();
  });

  it("renders the validity table", () => {
    renderArticle();
    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("Validity (Regular)")).toBeInTheDocument();
  });

  it("renders the penalties table", () => {
    renderArticle();
    expect(screen.getByText("Violation")).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();
    const link = screen.getByText(/Get started with DoAide GST/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });

  it("links to the e-way bill tools", () => {
    renderArticle();
    const link = screen.getByText(/E-Way Bill tools/);
    expect(link.closest("a")).toHaveAttribute("href", "/eway-bill");
  });
});
