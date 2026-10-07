import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstReturnCalendar from "./GstReturnCalendar";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstReturnCalendar />
    </MemoryRouter>,
  );
}

describe("GstReturnCalendar", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GST Return Filing Calendar 2026-27: All Due Dates")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("Overview of GST Return Due Dates")).toBeInTheDocument();
    expect(screen.getByText("Types of GST Returns and Filing Frequency")).toBeInTheDocument();
    expect(screen.getByText("GSTR-3B Staggered Due Dates by State")).toBeInTheDocument();
    expect(screen.getByText("Key Annual Deadlines for FY 2026-27")).toBeInTheDocument();
    expect(screen.getByText("Late Fee Structure for GST Returns")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is the due date for GSTR-1 filing?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/return-calendar");
    expect(hrefs).toContain("/interest-calculator");
    expect(hrefs).toContain("/calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
