import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstPenaltyGuide from "./GstPenaltyGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <GstPenaltyGuide />
    </MemoryRouter>,
  );
}

describe("GstPenaltyGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText(/GST Penalties and Interest/)).toBeInTheDocument();
  });

  it("renders all major sections", () => {
    renderArticle();
    expect(screen.getByText("Overview of the GST Penalty Framework")).toBeInTheDocument();
    expect(screen.getByText("Late Filing Penalties by Return Type")).toBeInTheDocument();
    expect(screen.getByText("Interest on Late GST Payment (Section 50)")).toBeInTheDocument();
    expect(screen.getByText("Penalties for Wrong Invoicing")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes That Lead to Penalties")).toBeInTheDocument();
    expect(screen.getByText("How to Avoid GST Penalties")).toBeInTheDocument();
  });

  it("renders the late filing penalties table", () => {
    renderArticle();
    expect(screen.getByText("Nil Return (per day)")).toBeInTheDocument();
    expect(screen.getByText("Maximum Cap")).toBeInTheDocument();
  });

  it("renders the invoicing penalties table", () => {
    renderArticle();
    expect(screen.getByText("Offence")).toBeInTheDocument();
    expect(screen.getByText("Penalty")).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();
    const link = screen.getByText(/Get started with DoAide GST/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });

  it("links to the interest calculator", () => {
    renderArticle();
    const link = screen.getByText(/GST Interest Calculator/);
    expect(link.closest("a")).toHaveAttribute("href", "/interest-calculator");
  });
});
