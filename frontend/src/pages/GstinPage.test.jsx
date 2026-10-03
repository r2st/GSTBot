import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import GstinPage from "./GstinPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const mockValidateGstin = vi.fn();
vi.mock("../lib/api", () => ({
  api: { validateGstin: (...args) => mockValidateGstin(...args) },
}));

function renderGstin(gstin = "27AAPFU0939F1ZV") {
  return render(
    <MemoryRouter initialEntries={[`/gstin/${gstin}`]}>
      <Routes>
        <Route path="/gstin/:gstin" element={<GstinPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GstinPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the GSTIN in the page title", () => {
    mockValidateGstin.mockResolvedValue({ valid: true, gstin: "27AAPFU0939F1ZV", state_code: "27", state_name: "Maharashtra", pan: "AAPFU0939F" });
    renderGstin();

    expect(screen.getByText("GSTIN 27AAPFU0939F1ZV")).toBeInTheDocument();
  });

  it("shows valid result after API call", async () => {
    mockValidateGstin.mockResolvedValue({
      valid: true,
      gstin: "27AAPFU0939F1ZV",
      state_code: "27",
      state_name: "Maharashtra",
      pan: "AAPFU0939F",
    });
    renderGstin();

    expect(await screen.findByText("Valid GSTIN")).toBeInTheDocument();
    expect(screen.getByText(/Maharashtra/)).toBeInTheDocument();
    expect(screen.getByText("AAPFU0939F")).toBeInTheDocument();
  });

  it("shows invalid result for bad GSTIN", async () => {
    mockValidateGstin.mockResolvedValue({
      valid: false,
      gstin: "INVALID",
      error: "Invalid format",
    });
    renderGstin("INVALID");

    expect(await screen.findByText("Invalid GSTIN")).toBeInTheDocument();
    expect(screen.getByText("Invalid format")).toBeInTheDocument();
  });

  it("shows error on network failure", async () => {
    mockValidateGstin.mockRejectedValue(new Error("Network error"));
    renderGstin();

    expect(await screen.findByText("Invalid GSTIN")).toBeInTheDocument();
    expect(screen.getByText("Could not verify this GSTIN.")).toBeInTheDocument();
  });

  it("shows the lookup-another link", () => {
    mockValidateGstin.mockResolvedValue({ valid: true, gstin: "27AAPFU0939F1ZV", state_code: "27", state_name: "Maharashtra", pan: "AAPFU0939F" });
    renderGstin();

    expect(screen.getByText(/Look up another GSTIN/)).toBeInTheDocument();
  });

  it("shows share buttons for valid GSTIN", async () => {
    mockValidateGstin.mockResolvedValue({
      valid: true,
      gstin: "27AAPFU0939F1ZV",
      state_code: "27",
      state_name: "Maharashtra",
      pan: "AAPFU0939F",
    });
    renderGstin();

    expect(await screen.findByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });
});
