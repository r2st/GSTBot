import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./useTheme";

function TestUI() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setTheme("light")}>light</button>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </div>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <TestUI />
    </ThemeProvider>,
  );
}

describe("useTheme", () => {
  let matchMediaListeners;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    matchMediaListeners = [];
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: (_event, handler) => matchMediaListeners.push(handler),
      removeEventListener: (_event, handler) => {
        matchMediaListeners = matchMediaListeners.filter((h) => h !== handler);
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system when localStorage is empty", () => {
    renderTheme();
    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("applies data-theme attribute to document", () => {
    renderTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("switches to dark when button clicked", async () => {
    const user = userEvent.setup();
    renderTheme();
    await user.click(screen.getByText("dark"));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists theme to localStorage", async () => {
    const user = userEvent.setup();
    renderTheme();
    await user.click(screen.getByRole("button", { name: "light" }));
    expect(localStorage.getItem("doaide-theme")).toBe("light");
  });

  it("reads theme from localStorage on mount", () => {
    localStorage.setItem("doaide-theme", "dark");
    renderTheme();
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("responds to system preference change when in system mode", () => {
    renderTheme();
    expect(screen.getByTestId("resolved").textContent).toBe("light");

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    act(() => {
      matchMediaListeners.forEach((fn) => fn());
    });

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("doaide-theme", "invalid");
    renderTheme();
    expect(screen.getByTestId("theme").textContent).toBe("system");
  });
});
