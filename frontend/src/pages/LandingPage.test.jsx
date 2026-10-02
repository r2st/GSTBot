import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

const navigated = vi.hoisted(() => ({ to: null, opts: null }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => (to, opts) => { navigated.to = to; navigated.opts = opts; },
  };
});

function renderLanding() {
  navigated.to = null;
  navigated.opts = null;
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  it("shows the gradient title", () => {
    renderLanding();

    expect(screen.getByText("GST compliance, on autopilot.")).toBeInTheDocument();
  });

  it("renders four feature cards", () => {
    renderLanding();

    expect(screen.getByText("Auto Filing")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
    expect(screen.getByText("ITC Tracking")).toBeInTheDocument();
    expect(screen.getByText("Deadline Alerts")).toBeInTheDocument();
  });

  it("navigates to login with register mode on the primary CTA", async () => {
    renderLanding();

    await userEvent.click(screen.getAllByText("Get started free")[0]);

    expect(navigated.to).toBe("/login");
    expect(navigated.opts).toEqual({ state: { mode: "register" } });
  });

  it("navigates to /login on the sign-in button", async () => {
    renderLanding();

    const signIns = screen.getAllByText("Sign in");
    await userEvent.click(signIns[0]);

    expect(navigated.to).toBe("/login");
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

  it("renders the header Get started button", async () => {
    renderLanding();

    await userEvent.click(screen.getByText("Get started"));

    expect(navigated.to).toBe("/login");
    expect(navigated.opts).toEqual({ state: { mode: "register" } });
  });

  it("renders the hero Sign in button", async () => {
    renderLanding();

    const heroSignIn = screen.getAllByText("Sign in")[1];
    await userEvent.click(heroSignIn);

    expect(navigated.to).toBe("/login");
  });
});
