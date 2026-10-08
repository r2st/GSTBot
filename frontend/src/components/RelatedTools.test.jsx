import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RelatedTools, { ALL_TOOLS, RECOMMENDED } from "./RelatedTools";

function renderRelated(current) {
  return render(
    <MemoryRouter>
      <RelatedTools current={current} />
    </MemoryRouter>,
  );
}

describe("RelatedTools", () => {
  it("renders the heading", () => {
    renderRelated("/calculator");

    expect(screen.getByText("More Free GST Tools")).toBeInTheDocument();
  });

  it("excludes the current page from the list", () => {
    renderRelated("/calculator");

    expect(screen.queryByText("GST Calculator")).not.toBeInTheDocument();
    expect(screen.getByText("GSTIN Verification")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Search")).toBeInTheDocument();
    expect(screen.getByText("Due Dates Calendar")).toBeInTheDocument();
    expect(screen.getByText("All GST Tools")).toBeInTheDocument();
  });

  it("excludes the lookup page when current is /lookup", () => {
    renderRelated("/lookup");

    expect(screen.queryByText("GSTIN Verification")).not.toBeInTheDocument();
    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
  });

  it("shows all tools when current does not match any", () => {
    renderRelated("/gst-rate/laptop");

    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
    expect(screen.getByText("GSTIN Verification")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Search")).toBeInTheDocument();
    expect(screen.getByText("Due Dates Calendar")).toBeInTheDocument();
    expect(screen.getByText("All GST Tools")).toBeInTheDocument();
  });

  it("has the correct aria label for navigation", () => {
    renderRelated("/calculator");

    expect(screen.getByRole("navigation", { name: "Related GST tools" })).toBeInTheDocument();
  });

  it("shows People Also Use section for pages with recommendations", () => {
    renderRelated("/calculator");

    expect(screen.getByText("People Also Use")).toBeInTheDocument();
  });

  it("shows recommended tools for calculator page", () => {
    renderRelated("/calculator");

    expect(screen.getByText("Invoice Generator")).toBeInTheDocument();
  });

  it("does not show People Also Use when no recommendations exist", () => {
    renderRelated("/gst-rate/laptop");

    expect(screen.queryByText("People Also Use")).not.toBeInTheDocument();
  });

  it("recommended tools appear only once on the page", () => {
    renderRelated("/calculator");

    const links = screen.getAllByText("HSN Code Search");
    expect(links).toHaveLength(1);
  });

  it("every recommended path maps to a real tool", () => {
    const toolPaths = new Set(ALL_TOOLS.map((t) => t.path));
    for (const [, recs] of Object.entries(RECOMMENDED)) {
      for (const path of recs) {
        expect(toolPaths.has(path)).toBe(true);
      }
    }
  });
});
