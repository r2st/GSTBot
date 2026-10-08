import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CgstSgstIgstDifference from "./CgstSgstIgstDifference";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <CgstSgstIgstDifference />
    </MemoryRouter>,
  );
}

describe("CgstSgstIgstDifference", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("Difference Between CGST, SGST and IGST — Explained with Examples")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What Are CGST, SGST, and IGST?")).toBeInTheDocument();
    expect(screen.getByText("When Does Each Tax Apply?")).toBeInTheDocument();
    expect(screen.getByText("CGST vs SGST vs IGST — Key Differences")).toBeInTheDocument();
    expect(screen.getByText("Input Tax Credit (ITC) Set-Off Rules")).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Can I use CGST credit to pay SGST?")).toBeInTheDocument();
  });

  it("has internal links to GST tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/calculator");
    expect(hrefs).toContain("/invoice-generator");
    expect(hrefs).toContain("/itc-calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
