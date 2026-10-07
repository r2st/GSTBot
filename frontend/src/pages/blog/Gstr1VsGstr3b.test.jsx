import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr1VsGstr3b from "./Gstr1VsGstr3b";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <Gstr1VsGstr3b />
    </MemoryRouter>,
  );
}

describe("Gstr1VsGstr3b", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("Difference Between GSTR-1 and GSTR-3B Explained")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("Key Differences at a Glance")).toBeInTheDocument();
    expect(screen.getByText("GSTR-1: What It Contains")).toBeInTheDocument();
    expect(screen.getByText("GSTR-3B: What It Contains")).toBeInTheDocument();
    expect(screen.getByText("Why Filing Order Matters")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Which return should be filed first?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/calculator");
    expect(hrefs).toContain("/late-fee-calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
