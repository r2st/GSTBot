import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GuidesIndex from "./GuidesIndex";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <GuidesIndex />
    </MemoryRouter>,
  );
}

describe("GuidesIndex", () => {
  it("renders the page title", () => {
    renderPage();
    expect(screen.getByText("GST Guides & Tutorials")).toBeInTheDocument();
  });

  it("links to all three step-by-step guides", () => {
    renderPage();
    expect(screen.getByText("How to Register for GST in India")).toBeInTheDocument();
    expect(screen.getByText("How to File GSTR-1")).toBeInTheDocument();
    expect(screen.getByText("How to File GSTR-3B")).toBeInTheDocument();
  });

  it("links to existing blog articles", () => {
    renderPage();
    expect(screen.getByText("Complete Guide to GST Filing in India 2026")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Lookup Guide")).toBeInTheDocument();
  });

  it("links to free tools", () => {
    renderPage();
    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
    expect(screen.getByText("GSTIN Lookup")).toBeInTheDocument();
  });

  it("links to best GST software page", () => {
    renderPage();
    expect(screen.getByText("Best GST Software in India 2026")).toBeInTheDocument();
  });

  it("has CTA section", () => {
    renderPage();
    expect(screen.getByText("Start Using DoAide GST Free")).toBeInTheDocument();
  });
});
