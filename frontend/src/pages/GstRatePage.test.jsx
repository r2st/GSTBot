import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GstRatePage from "./GstRatePage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

function renderRate(product = "laptop") {
  return render(
    <MemoryRouter initialEntries={[`/gst-rate/${product}`]}>
      <Routes>
        <Route path="/gst-rate/:product" element={<GstRatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GstRatePage", () => {
  it("renders the product name in the title", () => {
    renderRate("laptop");

    expect(screen.getByText("GST Rate on Laptop")).toBeInTheDocument();
  });

  it("shows the GST rate for a known product", () => {
    renderRate("laptop");

    expect(screen.getByText("18%", { selector: ".rate-big" })).toBeInTheDocument();
  });

  it("shows the HSN code", () => {
    renderRate("laptop");

    expect(screen.getByText("8471")).toBeInTheDocument();
  });

  it("shows CGST and SGST breakdown", () => {
    renderRate("laptop");

    expect(screen.getByText("CGST")).toBeInTheDocument();
    expect(screen.getByText("SGST")).toBeInTheDocument();
    expect(screen.getAllByText("9%")).toHaveLength(2);
  });

  it("shows calculator link", () => {
    renderRate("laptop");

    expect(screen.getByText(/Calculate tax on Laptop/)).toBeInTheDocument();
  });

  it("shows share buttons for known product", () => {
    renderRate("laptop");

    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("shows fallback for unknown product", () => {
    renderRate("xyznonexistent");

    expect(screen.getByText(/don't have a specific rate/)).toBeInTheDocument();
    expect(screen.getByText(/Search the HSN code directory/)).toBeInTheDocument();
  });

  it("shows related HSN codes when matches exist", () => {
    renderRate("cement");

    expect(screen.getByText("Related HSN Codes")).toBeInTheDocument();
  });

  it("handles hyphenated product names", () => {
    renderRate("mobile-phone");

    expect(screen.getByText("GST Rate on Mobile Phone")).toBeInTheDocument();
    expect(screen.getByText("8517")).toBeInTheDocument();
  });
});
