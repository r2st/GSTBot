import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PaymentChallanPage from "./PaymentChallanPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../components/DeadlineBanner", () => ({ default: () => null }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/payment-challan"]}>
      <PaymentChallanPage />
    </MemoryRouter>,
  );
}

describe("PaymentChallanPage", () => {
  it("renders the title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "GST Payment Challan Helper" })).toBeInTheDocument();
  });

  it("shows no result when tax amount is empty", () => {
    renderPage();
    expect(screen.queryByText("Challan Breakdown")).not.toBeInTheDocument();
  });

  it("shows CGST and SGST split for intrastate", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Enter tax amount"), "10000");
    expect(screen.getByText(/CGST \(0005\)/)).toBeInTheDocument();
    expect(screen.getByText(/SGST \(0006\)/)).toBeInTheDocument();
  });

  it("shows IGST for interstate", async () => {
    renderPage();
    await userEvent.selectOptions(screen.getByDisplayValue("Intrastate (CGST + SGST)"), "interstate");
    await userEvent.type(screen.getByPlaceholderText("Enter tax amount"), "10000");
    const cells = screen.getAllByText(/₹10,000/);
    expect(cells.length).toBeGreaterThan(0);
    expect(screen.getByText(/IGST \(0008\)/)).toBeInTheDocument();
  });

  it("includes cess as separate head", async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("Enter tax amount"), "10000");
    expect(screen.getByText(/Cess \(0009\)/)).toBeInTheDocument();
  });

  it("shows PMT-06 guide section", () => {
    renderPage();
    expect(screen.getByText("PMT-06 Payment Process — Step by Step")).toBeInTheDocument();
  });

  it("shows the how-it-works section", () => {
    renderPage();
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    expect(screen.getByText("Select Supply Type")).toBeInTheDocument();
  });
});
