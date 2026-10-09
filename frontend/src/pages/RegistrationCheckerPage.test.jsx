import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RegistrationCheckerPage from "./RegistrationCheckerPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
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
    <MemoryRouter initialEntries={["/registration-checker"]}>
      <RegistrationCheckerPage />
    </MemoryRouter>,
  );
}

describe("RegistrationCheckerPage", () => {
  it("renders the title and first question", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "GST Registration Eligibility Checker" })).toBeInTheDocument();
    expect(screen.getByText(/annual aggregate turnover from sale of goods/)).toBeInTheDocument();
  });

  it("shows progress indicator", () => {
    renderPage();
    expect(screen.getByText("Question 1 of 7")).toBeInTheDocument();
  });

  it("advances to next question on option click", async () => {
    renderPage();
    await userEvent.click(screen.getByText("Below ₹40 lakhs"));
    expect(screen.getByText("Question 2 of 7")).toBeInTheDocument();
  });

  it("shows mandatory result when interstate supply is yes", async () => {
    renderPage();
    await userEvent.click(screen.getByText("Below ₹40 lakhs"));
    await userEvent.click(screen.getByText("Below ₹20 lakhs"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("Yes"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));

    expect(screen.getByText("Mandatory")).toBeInTheDocument();
    expect(screen.getByText(/Interstate supply.*requires mandatory/)).toBeInTheDocument();
  });

  it("shows not required when all answers below threshold", async () => {
    renderPage();
    await userEvent.click(screen.getByText("Below ₹40 lakhs"));
    await userEvent.click(screen.getByText("Below ₹20 lakhs"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));

    expect(screen.getByText("Not Required")).toBeInTheDocument();
  });

  it("has a check again button after result", async () => {
    renderPage();
    await userEvent.click(screen.getByText("Below ₹40 lakhs"));
    await userEvent.click(screen.getByText("Below ₹20 lakhs"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));
    await userEvent.click(screen.getByText("No"));

    await userEvent.click(screen.getByText("Check Again"));
    expect(screen.getByText("Question 1 of 7")).toBeInTheDocument();
  });
});
