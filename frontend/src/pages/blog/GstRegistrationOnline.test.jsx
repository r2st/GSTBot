import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstRegistrationOnline from "./GstRegistrationOnline";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstRegistrationOnline />
    </MemoryRouter>,
  );
}

describe("GstRegistrationOnline", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GST Registration Online: Complete Step-by-Step Guide 2026")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("Who Needs GST Registration?")).toBeInTheDocument();
    expect(screen.getByText("Documents Required for GST Registration")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step GST Registration Process")).toBeInTheDocument();
    expect(screen.getByText("Common Rejection Reasons and How to Avoid Them")).toBeInTheDocument();
    expect(screen.getByText("Benefits of Voluntary GST Registration")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("How much does GST registration cost?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/gstin-validator");
    expect(hrefs).toContain("/registration-checker");
    expect(hrefs).toContain("/calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
