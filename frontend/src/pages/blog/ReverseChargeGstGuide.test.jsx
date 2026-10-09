import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ReverseChargeGstGuide from "./ReverseChargeGstGuide";

vi.mock("../../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

function renderArticle() {
  return render(
    <MemoryRouter>
      <ReverseChargeGstGuide />
    </MemoryRouter>,
  );
}

describe("ReverseChargeGstGuide", () => {
  it("renders the article title", () => {
    renderArticle();
    expect(screen.getByText(/Reverse Charge Mechanism Under GST/)).toBeInTheDocument();
  });

  it("renders key sections", () => {
    renderArticle();
    expect(screen.getByText("What Is the Reverse Charge Mechanism?")).toBeInTheDocument();
    expect(screen.getByText("Services That Attract Reverse Charge")).toBeInTheDocument();
    expect(screen.getByText("How to Calculate GST Under RCM")).toBeInTheDocument();
    expect(screen.getByText(/ITC on RCM/)).toBeInTheDocument();
    expect(screen.getByText("Self-Invoice and Payment Voucher")).toBeInTheDocument();
    expect(screen.getByText("How to Report RCM in GST Returns")).toBeInTheDocument();
    expect(screen.getByText("Common Mistakes to Avoid")).toBeInTheDocument();
  });

  it("renders the RCM services table", () => {
    renderArticle();
    expect(screen.getByText("Legal services by advocates")).toBeInTheDocument();
    expect(screen.getByText("Director fees / Sitting fees")).toBeInTheDocument();
  });

  it("renders the FAQ section", () => {
    renderArticle();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("What is Reverse Charge Mechanism under GST?")).toBeInTheDocument();
    expect(screen.getByText("What is a self-invoice under RCM?")).toBeInTheDocument();
  });

  it("links to the RCM calculator", () => {
    renderArticle();
    const links = screen.getAllByRole("link", { name: /RCM [Cc]alculator/ });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/rcm-calculator");
  });

  it("has a CTA link back to all tools", () => {
    renderArticle();
    const link = screen.getByText(/Explore all DoAide GST tools/);
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
