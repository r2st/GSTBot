import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstLatePenaltyCalculator from "./GstLatePenaltyCalculator";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstLatePenaltyCalculator />
    </MemoryRouter>,
  );
}

describe("GstLatePenaltyCalculator", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText("GST Late Filing Penalty Calculator 2026")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("How GST Late Filing Penalties Work")).toBeInTheDocument();
    expect(screen.getByText("Late Fee Rates by Return Type (2026)")).toBeInTheDocument();
    expect(screen.getByText("Interest on Late GST Payment")).toBeInTheDocument();
  });

  it("renders the inline mini calculator", () => {
    renderArticle();
    expect(screen.getByText("Quick Penalty Estimate")).toBeInTheDocument();
    expect(screen.getByLabelText(/Days Late/)).toBeInTheDocument();
  });

  it("calculates penalty when days are entered", async () => {
    renderArticle();
    const user = userEvent.setup();
    const daysInput = screen.getByLabelText(/Days Late/);
    await user.type(daysInput, "30");
    const results = document.querySelectorAll(".calc-result");
    expect(results.length).toBeGreaterThan(0);
  });

  it("renders FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Can GST late fees be waived?")).toBeInTheDocument();
  });

  it("has internal links to penalty tools", () => {
    renderArticle();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/penalty-calculator");
    expect(hrefs).toContain("/late-fee-calculator");
  });

  it("has a CTA link to home", () => {
    renderArticle();
    const link = screen.getByText(/Try DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
