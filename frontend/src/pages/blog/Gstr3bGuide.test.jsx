import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr3bGuide from "./Gstr3bGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <Gstr3bGuide />
    </MemoryRouter>,
  );
}

describe("Gstr3bGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GSTR-3B Filing: Due Dates, Format, and Common Mistakes")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What Is GSTR-3B?")).toBeInTheDocument();
    expect(screen.getByText("Who Must File GSTR-3B?")).toBeInTheDocument();
    expect(screen.getByText("GSTR-3B Due Dates 2026")).toBeInTheDocument();
    expect(screen.getByText("8 Common GSTR-3B Mistakes to Avoid")).toBeInTheDocument();
    expect(screen.getByText("Penalties for Late GSTR-3B Filing")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Can I revise GSTR-3B after filing?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/calculator");
    expect(hrefs).toContain("/return-calendar");
    expect(hrefs).toContain("/interest-calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
