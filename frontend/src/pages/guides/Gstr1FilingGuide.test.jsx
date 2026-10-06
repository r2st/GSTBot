import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr1FilingGuide from "./Gstr1FilingGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter>
      <Gstr1FilingGuide />
    </MemoryRouter>,
  );
}

describe("Gstr1FilingGuide", () => {
  it("renders the heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/How to File GSTR-1/);
  });

  it("renders step-by-step sections", () => {
    renderPage();
    expect(screen.getByText("What Is GSTR-1?")).toBeInTheDocument();
    expect(screen.getByText("Who Must File GSTR-1?")).toBeInTheDocument();
    expect(screen.getByText("GSTR-1 Due Dates")).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step GSTR-1 Filing Process")).toBeInTheDocument();
    expect(screen.getByText("Understanding GSTR-1 Tables")).toBeInTheDocument();
    expect(screen.getByText("Late Filing Penalties")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes to Avoid")).toBeInTheDocument();
  });

  it("renders due dates table", () => {
    renderPage();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText(/11th of the following month/)).toBeInTheDocument();
  });

  it("renders FAQ with toggle", async () => {
    renderPage();
    const faqButton = screen.getByText("What is GSTR-1?");
    await userEvent.click(faqButton);
    expect(screen.getByText(/monthly or quarterly return/)).toBeInTheDocument();
  });

  it("links to related guides and tools", () => {
    renderPage();
    expect(screen.getByText("How to File GSTR-3B")).toBeInTheDocument();
    expect(screen.getByText("GST Registration Guide")).toBeInTheDocument();
  });
});
