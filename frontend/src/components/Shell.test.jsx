import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../hooks/useAuth";
import Shell from "./Shell";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

function renderShell({ route = "/" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path="*" element={<Shell><p>Page body</p></Shell>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Shell", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ id: 1, email: "owner@acme.in", business: { legal_name: "Acme" } }),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the page it wraps", () => {
    renderShell();
    expect(screen.getByText("Page body")).toBeInTheDocument();
  });

  it("puts a skip link first, before the navigation", () => {
    renderShell();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveAttribute("href", "#main");
    // It has to target something, or it silently does nothing.
    expect(document.querySelector("#main")).not.toBeNull();
  });

  it("keeps one navigation in the DOM at both sizes", () => {
    renderShell();
    // The drawer and the desktop row are the same element with different CSS.
    // Two navs would be two things for assistive tech to read, and two lists
    // to keep in step.
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
  });

  it("starts with the mobile menu closed", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens and closes the menu on click", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("points the toggle at the nav it controls", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    const controls = toggle.getAttribute("aria-controls");
    expect(document.getElementById(controls)).toHaveAttribute("aria-label", "Main");
  });

  it("closes the menu on Escape and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.keyboard("{Escape}");

    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Leaving focus on a now-hidden link strands keyboard users at the top of
    // the document with no idea where they are.
    expect(toggle).toHaveFocus();
  });

  it("closes the menu when a link is followed", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Invoices" }));

    // Otherwise the drawer covers the page the user just asked for.
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("closes the menu when the scrim is tapped", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const scrim = container.querySelector(".nav-scrim");
    expect(scrim).not.toBeNull();

    await user.click(scrim);
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("hides the scrim from assistive tech, since Escape is the equivalent", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(container.querySelector(".nav-scrim")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks the current route as current", () => {
    renderShell({ route: "/invoices" });
    // NavLink sets aria-current on the active route; without it the only
    // signal of where you are is a colour.
    expect(screen.getByRole("link", { name: "Invoices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
