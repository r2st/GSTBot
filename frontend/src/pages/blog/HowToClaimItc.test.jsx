import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HowToClaimItc from "./HowToClaimItc";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <HowToClaimItc />
    </MemoryRouter>,
  );
}

describe("HowToClaimItc", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("How to Claim Input Tax Credit Under GST")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What is Input Tax Credit?")).toBeInTheDocument();
    expect(screen.getByText("Conditions for Claiming ITC (Section 16)")).toBeInTheDocument();
    expect(screen.getByText("Blocked Credits — Section 17(5)")).toBeInTheDocument();
    expect(screen.getByText("ITC Set-Off Order")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is the time limit for claiming ITC?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/itc-calculator");
    expect(hrefs).toContain("/calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
