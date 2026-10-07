import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ItcEligibilityPage from "./ItcEligibilityPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/input-tax-credit"]}>
      <ItcEligibilityPage />
    </MemoryRouter>,
  );
}

describe("ItcEligibilityPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/ITC Eligibility/i);
  });

  it("shows the ToolsNav component", () => {
    renderPage();
    expect(screen.getByRole("navigation", { name: "GST tools" })).toBeInTheDocument();
  });

  it("shows purchase type selector", () => {
    renderPage();
    const select = screen.getByLabelText(/Type of Purchase/i);
    expect(select).toBeInTheDocument();
  });

  it("shows eligible result when GST amount is entered for business goods", async () => {
    renderPage();
    const input = screen.getByPlaceholderText("Enter GST amount paid");
    await userEvent.type(input, "5000");
    expect(screen.getByText("Eligible")).toBeInTheDocument();
  });

  it("shows blocked for motor vehicles with Section 17(5) reason", async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByLabelText(/Type of Purchase/i);
    await user.selectOptions(select, "motor_vehicle");
    const input = screen.getByPlaceholderText("Enter GST amount paid");
    await user.type(input, "50000");

    expect(screen.getByText("Not Eligible")).toBeInTheDocument();
    expect(screen.getByText(/ITC blocked under Section 17\(5\)\(a\)/)).toBeInTheDocument();
  });

  it("shows blocked for personal use", async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByLabelText(/Type of Purchase/i);
    await user.selectOptions(select, "personal_use");
    const input = screen.getByPlaceholderText("Enter GST amount paid");
    await user.type(input, "5000");

    expect(screen.getByText("Not Eligible")).toBeInTheDocument();
    expect(screen.getAllByText(/personal consumption/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows blocked for construction of immovable property", async () => {
    const user = userEvent.setup();
    renderPage();
    const select = screen.getByLabelText(/Type of Purchase/i);
    await user.selectOptions(select, "construction");
    const input = screen.getByPlaceholderText("Enter GST amount paid");
    await user.type(input, "100000");

    expect(screen.getByText("Not Eligible")).toBeInTheDocument();
    expect(screen.getAllByText(/immovable property/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
  });
});
