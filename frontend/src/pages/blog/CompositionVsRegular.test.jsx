import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CompositionVsRegular from "./CompositionVsRegular";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <CompositionVsRegular />
    </MemoryRouter>,
  );
}

describe("CompositionVsRegular", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GST Composition Scheme vs Regular Scheme")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("Quick Comparison Table")).toBeInTheDocument();
    expect(screen.getByText("Composition Scheme — Tax Rates")).toBeInTheDocument();
    expect(screen.getByText("When to Choose Composition Scheme")).toBeInTheDocument();
    expect(screen.getByText("When to Choose Regular Scheme")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Can composition dealers claim ITC?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/composition-scheme");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
