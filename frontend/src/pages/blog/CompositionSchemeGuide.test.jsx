import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CompositionSchemeGuide from "./CompositionSchemeGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <CompositionSchemeGuide />
    </MemoryRouter>,
  );
}

describe("CompositionSchemeGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByRole("heading", { level: 1, name: /Composition Scheme/ })).toBeInTheDocument();
  });

  it("renders all major sections", () => {
    renderArticle();
    expect(screen.getByText("What is the Composition Scheme Under GST?")).toBeInTheDocument();
    expect(screen.getByText("Eligibility Criteria")).toBeInTheDocument();
    expect(screen.getByText("Tax Rates Under the Composition Scheme")).toBeInTheDocument();
    expect(screen.getByText("Benefits of the Composition Scheme")).toBeInTheDocument();
    expect(screen.getByText("Restrictions and Limitations")).toBeInTheDocument();
    expect(screen.getByText("Filing Requirements")).toBeInTheDocument();
  });

  it("renders the tax rates table", () => {
    renderArticle();
    expect(screen.getByText("CGST Rate")).toBeInTheDocument();
    expect(screen.getByText("Total Rate")).toBeInTheDocument();
  });

  it("renders the comparison table", () => {
    renderArticle();
    expect(screen.getByText("Composition Scheme vs Regular GST: Comparison")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();
    const link = screen.getByText(/Get started with DoAide GST/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });

  it("links to the composition scheme tool", () => {
    renderArticle();
    const link = screen.getByText(/Composition Scheme comparison tool/);
    expect(link.closest("a")).toHaveAttribute("href", "/composition-scheme");
  });
});
