import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr3bFilingGuide from "./Gstr3bFilingGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <Gstr3bFilingGuide />
    </MemoryRouter>,
  );
}

describe("Gstr3bFilingGuide", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/How to File GSTR-3B/);
  });

  it("renders all major sections", () => {
    renderPage();
    expect(screen.getByText("What Is GSTR-3B?")).toBeInTheDocument();
    expect(screen.getByText("Who Must File GSTR-3B?")).toBeInTheDocument();
    expect(screen.getByText("GSTR-3B Due Dates")).toBeInTheDocument();
    expect(screen.getByText("What You Need Before Filing GSTR-3B")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step GSTR-3B Filing Process")).toBeInTheDocument();
    expect(screen.getByText("Understanding GSTR-3B Tables")).toBeInTheDocument();
    expect(screen.getByText("Late Filing Penalties")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes to Avoid")).toBeInTheDocument();
    expect(screen.getByText("How DoAide GST Helps with GSTR-3B")).toBeInTheDocument();
  });

  it("renders state category table", () => {
    renderPage();
    expect(screen.getByText("Category A")).toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("Can GSTR-3B be revised after filing?");
    await userEvent.click(faqButton);
    expect(screen.getByText(/GSTR-3B cannot be revised once filed/)).toBeInTheDocument();
  });

  it("links to related guides", () => {
    renderPage();
    expect(screen.getByText("How to File GSTR-1")).toBeInTheDocument();
    expect(screen.getByText("GST Registration Guide")).toBeInTheDocument();
  });

  it("links to tools", () => {
    renderPage();
    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
    expect(screen.getByText("GSTIN Lookup")).toBeInTheDocument();
  });
});
