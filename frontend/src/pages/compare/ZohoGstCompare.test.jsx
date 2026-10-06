import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ZohoGstCompare from "./ZohoGstCompare";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <ZohoGstCompare />
    </MemoryRouter>,
  );
}

describe("ZohoGstCompare", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/DoAide GST vs Zoho GST/);
  });

  it("renders feature comparison table with Zoho-specific features", () => {
    renderPage();
    expect(screen.getByText("Feature Comparison")).toBeInTheDocument();
    expect(screen.getByText("Standalone GST Tool (No Ecosystem)")).toBeInTheDocument();
  });

  it("renders pricing section showing Zoho Books pricing", () => {
    renderPage();
    expect(screen.getByText("Pricing Comparison")).toBeInTheDocument();
    expect(screen.getByText("Zoho GST (Zoho Books)")).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("Do I need Zoho Books to use Zoho GST?");
    await userEvent.click(faqButton);
    expect(screen.getByText(/Zoho GST features are built into Zoho Books/)).toBeInTheDocument();
  });

  it("renders internal links to other comparisons", () => {
    renderPage();
    expect(screen.getByText("DoAide GST vs ClearTax")).toBeInTheDocument();
  });
});
