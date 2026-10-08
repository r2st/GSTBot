import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CalculatorPage from "./CalculatorPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../components/DeadlineBanner", () => ({ default: () => null }));
vi.mock("../components/SavedCalculations", () => ({
  default: () => null,
  getSavedCalcs: () => [],
  SaveCalcButton: () => null,
}));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));

const mockTrack = vi.fn();
vi.mock("../lib/track", () => ({ track: (...args) => mockTrack(...args) }));

function renderCalc(route = "/calculator") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CalculatorPage />
    </MemoryRouter>,
  );
}

describe("CalculatorPage", () => {
  it("renders the calculator title and subtitle", () => {
    renderCalc();

    expect(screen.getByRole("heading", { name: "GST Calculator" })).toBeInTheDocument();
    expect(screen.getByText(/Calculate GST tax breakdown/)).toBeInTheDocument();
  });

  it("shows mode toggle with GST Exclusive active by default", () => {
    renderCalc();

    const exclusive = screen.getByText("GST Exclusive");
    expect(exclusive.className).toContain("active");
  });

  it("shows tax breakdown when amount is entered", async () => {
    renderCalc();

    const input = screen.getByPlaceholderText("Enter amount in ₹");
    await userEvent.type(input, "1000");

    expect(screen.getByText("Taxable Value")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("shows CGST and SGST for intrastate by default", async () => {
    renderCalc();

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("CGST");
    expect(result.textContent).toContain("SGST");
  });

  it("switches to IGST when interstate checkbox is checked", async () => {
    renderCalc();

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");
    await userEvent.click(screen.getByLabelText(/Interstate supply/));

    const result = document.querySelector(".calc-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("IGST");
    expect(result.textContent).not.toContain("CGST");
  });

  it("uses inclusive mode when toggled", async () => {
    renderCalc();

    await userEvent.click(screen.getByText("GST Inclusive"));
    expect(screen.getByText(/Total amount \(including GST\)/)).toBeInTheDocument();
  });

  it("shows no result when input is empty", () => {
    renderCalc();

    expect(screen.queryByText("Taxable Value")).not.toBeInTheDocument();
  });

  it("shows share buttons when result is computed", async () => {
    renderCalc();

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");

    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("reads initial values from URL params", () => {
    renderCalc("/calculator?amount=5000&rate=12&type=igst");

    expect(screen.getByText("Taxable Value")).toBeInTheDocument();
    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("IGST");
  });

  it("renders the GST rate slabs info section", () => {
    renderCalc();

    expect(screen.getByText("How GST Calculation Works")).toBeInTheDocument();
    expect(screen.getByText(/GST 2\.0 Rate Slabs in India/)).toBeInTheDocument();
  });

  it("updates URL when amount changes", async () => {
    renderCalc("/calculator");

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "500");

    expect(screen.getByText("Taxable Value")).toBeInTheDocument();
  });

  it("selects a different rate", async () => {
    renderCalc();

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");
    await userEvent.selectOptions(screen.getByRole("combobox"), "5");

    const result = document.querySelector(".calc-result");
    expect(result.textContent).toContain("5%");
  });

  it("fires gst_calculate tracking event when result is computed", async () => {
    renderCalc();

    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");

    expect(mockTrack).toHaveBeenCalledWith("gst_calculate", expect.objectContaining({ amount: 1000, rate: 18 }));
  });
});
