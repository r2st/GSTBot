import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RegistrationTypeAdvisorPage from "./RegistrationTypeAdvisorPage";

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
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/registration-type-advisor"]}>
      <RegistrationTypeAdvisorPage />
    </MemoryRouter>,
  );
}

describe("RegistrationTypeAdvisorPage", () => {
  it("renders the title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "GST Registration Type Advisor" })).toBeInTheDocument();
  });

  it("shows no recommendation before turnover is entered", () => {
    renderPage();
    expect(screen.queryByText(/Recommended Registration/)).not.toBeInTheDocument();
  });

  it("shows Regular and Composition for small goods trader", async () => {
    renderPage();
    const input = screen.getByPlaceholderText("Enter expected annual turnover");
    await userEvent.type(input, "5000000");
    expect(screen.getByText("Recommended Registration Types")).toBeInTheDocument();
    expect(screen.getByText("Composition Scheme")).toBeInTheDocument();
    expect(screen.getByText("Regular Registration")).toBeInTheDocument();
  });

  it("shows NRI registration for non-resident", async () => {
    renderPage();
    const nriCheckbox = screen.getByLabelText(/non-resident/);
    await userEvent.click(nriCheckbox);
    expect(screen.getAllByText(/Non-Resident Taxable Person/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows Casual Taxable Person for occasional supplier", async () => {
    renderPage();
    const occasionalCheckbox = screen.getByLabelText(/occasionally supply/);
    await userEvent.click(occasionalCheckbox);
    expect(screen.getAllByText(/Casual Taxable Person/).length).toBeGreaterThanOrEqual(1);
  });

  it("disqualifies composition for interstate supplier", async () => {
    renderPage();
    const interstateCheckbox = screen.getByLabelText(/interstate outward/);
    await userEvent.click(interstateCheckbox);
    const input = screen.getByPlaceholderText("Enter expected annual turnover");
    await userEvent.type(input, "5000000");
    expect(screen.getByText(/Interstate outward supply disqualifies/)).toBeInTheDocument();
  });
});
