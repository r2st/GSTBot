import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HsnCodeLookup from "./HsnCodeLookup";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <HsnCodeLookup />
    </MemoryRouter>,
  );
}

describe("HsnCodeLookup", () => {
  it("renders the article title", () => {
    renderArticle();

    expect(screen.getByText("HSN Code Lookup: Everything You Need to Know")).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();

    expect(screen.getByText("What Are HSN Codes?")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Structure")).toBeInTheDocument();
    expect(screen.getByText("Who Needs to Report HSN Codes?")).toBeInTheDocument();
    expect(screen.getByText("How to Find the Right HSN Code")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Mistakes That Cost Businesses")).toBeInTheDocument();
    expect(screen.getByText("SAC Codes for Services")).toBeInTheDocument();
  });

  it("renders the common categories table", () => {
    renderArticle();

    expect(screen.getByText("Common HSN Code Categories for Indian Businesses")).toBeInTheDocument();
    expect(screen.getByText("Common GST Rate")).toBeInTheDocument();
  });

  it("has a CTA link back to the home page", () => {
    renderArticle();

    const link = screen.getByText(/Start using DoAide GST free/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
