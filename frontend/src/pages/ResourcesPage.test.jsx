import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ResourcesPage from "./ResourcesPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderResources() {
  return render(
    <MemoryRouter>
      <ResourcesPage />
    </MemoryRouter>,
  );
}

describe("ResourcesPage", () => {
  it("renders the page title", () => {
    renderResources();

    expect(screen.getByText("Free GST Tools & Resources")).toBeInTheDocument();
  });

  it("renders the subtitle with SEO keywords", () => {
    renderResources();

    expect(screen.getByText(/Everything you need for GST compliance/)).toBeInTheDocument();
  });

  it("links to all five free tools", () => {
    renderResources();

    const toolsSection = screen.getByText("Free GST Tools").closest("section");
    expect(toolsSection.textContent).toContain("GST Calculator");
    expect(toolsSection.textContent).toContain("GSTIN Verification");
    expect(toolsSection.textContent).toContain("HSN Code Search");
    expect(toolsSection.textContent).toContain("GST Filing Due Dates");
    expect(toolsSection.textContent).toContain("Embed GST Widgets");
  });

  it("links to guides including new step-by-step guides", () => {
    renderResources();

    expect(screen.getByText("How to Register for GST in India")).toBeInTheDocument();
    expect(screen.getByText("How to File GSTR-1")).toBeInTheDocument();
    expect(screen.getByText("How to File GSTR-3B")).toBeInTheDocument();
    expect(screen.getByText("GST Filing Guide for India 2026")).toBeInTheDocument();
    expect(screen.getByText("HSN Code Lookup Guide")).toBeInTheDocument();
    expect(screen.getByText("GST Compliance Checklist")).toBeInTheDocument();
  });

  it("has a sign-up CTA section", () => {
    renderResources();

    expect(screen.getByText("Automate Your GST Filing")).toBeInTheDocument();
    expect(screen.getByText("Sign Up Free")).toBeInTheDocument();
  });

  it("links to pricing", () => {
    renderResources();

    expect(screen.getByText("Pricing Plans")).toBeInTheDocument();
  });

  it("has section headings for tools, guides, comparisons, and platform", () => {
    renderResources();

    expect(screen.getByText("Free GST Tools")).toBeInTheDocument();
    expect(screen.getByText("GST Guides & Articles")).toBeInTheDocument();
    expect(screen.getByText("Compare GST Software")).toBeInTheDocument();
    expect(screen.getByText("GST Compliance Platform")).toBeInTheDocument();
  });

  it("renders the ToolsNav", () => {
    renderResources();

    expect(screen.getByRole("navigation", { name: "GST tools" })).toBeInTheDocument();
  });
});
