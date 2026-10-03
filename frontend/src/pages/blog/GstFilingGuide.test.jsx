import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstFilingGuide from "./GstFilingGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstFilingGuide />
    </MemoryRouter>,
  );
}

describe("GstFilingGuide", () => {
  it("renders the article title", () => {
    renderArticle();

    expect(screen.getByText("Complete Guide to GST Filing in India 2026")).toBeInTheDocument();
  });

  it("renders section headings for SEO content", () => {
    renderArticle();

    expect(screen.getByText("What Is GST Filing?")).toBeInTheDocument();
    expect(screen.getByText("Who Needs to File GST Returns?")).toBeInTheDocument();
    expect(screen.getByText("Key GST Returns and Their Due Dates")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step: How to File GST Returns")).toBeInTheDocument();
    expect(screen.getByText("Common GST Filing Mistakes to Avoid")).toBeInTheDocument();
    expect(screen.getByText("How DoAide GST Simplifies Filing")).toBeInTheDocument();
  });

  it("includes GSTR-1, GSTR-3B, and GSTR-2B subsections", () => {
    renderArticle();

    expect(screen.getByText(/GSTR-1 — Outward Supplies/)).toBeInTheDocument();
    expect(screen.getByText(/GSTR-3B — Summary Return/)).toBeInTheDocument();
    expect(screen.getByText(/GSTR-2B — Auto-Generated ITC Statement/)).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();

    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });

  it("renders the FAQ section", () => {
    renderArticle();

    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText(/What happens if I miss the GST filing deadline/)).toBeInTheDocument();
  });
});
