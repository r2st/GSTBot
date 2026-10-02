import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  it("shows the headline in serif font", () => {
    renderLanding();

    expect(screen.getByText("GST compliance, automated.")).toBeInTheDocument();
  });

  it("shows the monospace subtitle", () => {
    renderLanding();

    expect(
      screen.getByText(/AI-powered GST filing, invoice matching/),
    ).toBeInTheDocument();
  });

  it("renders the four pipeline stages", () => {
    renderLanding();

    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    expect(screen.getByText("Reconcile")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("renders the auth form with sign-in tab active by default", () => {
    renderLanding();

    const signIn = screen.getByRole("tab", { name: "Sign in" });
    const create = screen.getByRole("tab", { name: "Create account" });
    expect(signIn).toHaveAttribute("aria-selected", "true");
    expect(create).toHaveAttribute("aria-selected", "false");
  });

  it("switches to the registration form on the Create account tab", async () => {
    renderLanding();

    await userEvent.click(screen.getByRole("tab", { name: "Create account" }));

    expect(screen.getByLabelText(/GSTIN/)).toBeInTheDocument();
    expect(screen.getByLabelText("Legal name")).toBeInTheDocument();
  });

  it("renders the footer with all DoAide product links", () => {
    renderLanding();

    expect(screen.getByText("Desk")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Pulse")).toBeInTheDocument();
    expect(screen.getByText("Med")).toBeInTheDocument();
    expect(screen.getByText("Realty")).toBeInTheDocument();
    expect(screen.getByText("Reach")).toBeInTheDocument();
    expect(screen.getByText("Trade")).toBeInTheDocument();
    expect(screen.getByText("409A")).toBeInTheDocument();
    expect(screen.getByText("doaide.com")).toBeInTheDocument();
  });

  it("links to doaide.com from the header brand", () => {
    renderLanding();

    const brand = screen.getByText("doaide.com").closest("a");
    expect(brand).toHaveAttribute("href", "https://doaide.com");
  });
});
