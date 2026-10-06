import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstRegistrationGuide from "./GstRegistrationGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <GstRegistrationGuide />
    </MemoryRouter>,
  );
}

describe("GstRegistrationGuide", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/How to Register for GST/);
  });

  it("renders all major sections", () => {
    renderPage();
    expect(screen.getByText("What Is GST Registration?")).toBeInTheDocument();
    expect(screen.getByText("Who Needs to Register for GST?")).toBeInTheDocument();
    expect(screen.getByText("Documents Required for GST Registration")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step GST Registration Process")).toBeInTheDocument();
    expect(screen.getByText("Types of GST Registration")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes to Avoid")).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("Is GST registration free?");
    await userEvent.click(faqButton);
    expect(screen.getByText(/GST registration on the GST portal/)).toBeInTheDocument();
  });

  it("has internal links to tools", () => {
    renderPage();
    const hsnLinks = screen.getAllByText("HSN Code Finder");
    expect(hsnLinks.length).toBeGreaterThan(0);
  });

  it("links to related guides", () => {
    renderPage();
    expect(screen.getByText("How to File GSTR-1")).toBeInTheDocument();
    expect(screen.getByText("How to File GSTR-3B")).toBeInTheDocument();
  });
});
