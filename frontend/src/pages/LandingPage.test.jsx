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
  it("shows the branding and hero copy", () => {
    renderLanding();

    expect(screen.getByText("GST compliance,")).toBeInTheDocument();
    expect(screen.getByText("on autopilot.")).toBeInTheDocument();
  });

  it("renders all six feature cards", () => {
    renderLanding();

    expect(screen.getByText("Invoice ingestion")).toBeInTheDocument();
    expect(screen.getByText("GSTR-2B reconciliation")).toBeInTheDocument();
    expect(screen.getByText("ITC tracking")).toBeInTheDocument();
    expect(screen.getByText("Deadline alerts")).toBeInTheDocument();
    expect(screen.getByText("Filing preparation")).toBeInTheDocument();
    expect(screen.getByText("Multi-business")).toBeInTheDocument();
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

  it("has a footer crediting the company", () => {
    renderLanding();

    expect(screen.getByText(/Apprend Technologies/)).toBeInTheDocument();
  });

  it("includes the bottom call-to-action section", async () => {
    renderLanding();

    expect(screen.getByText("Stop chasing spreadsheets.")).toBeInTheDocument();

    await userEvent.click(screen.getAllByText("Get started free")[1]);

    expect(navigated.to).toBe("/login");
  });

  it("renders the sign-in outline button in the hero", async () => {
    renderLanding();

    const outlineBtn = screen.getAllByText("Sign in")[1];
    await userEvent.click(outlineBtn);

    expect(navigated.to).toBe("/login");
  });
});
