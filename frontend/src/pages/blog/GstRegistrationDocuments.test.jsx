import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstRegistrationDocuments from "./GstRegistrationDocuments";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstRegistrationDocuments />
    </MemoryRouter>,
  );
}

describe("GstRegistrationDocuments", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GST Registration Documents Required 2026")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("Who Needs GST Registration?")).toBeInTheDocument();
    expect(screen.getByText("Common Documents for All Business Types")).toBeInTheDocument();
    expect(screen.getByText("Documents by Business Type")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step Registration Process")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Is Aadhaar mandatory for GST registration?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/lookup");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
