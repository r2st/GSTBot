import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../hooks/useAuth";
import LoginPage from "./LoginPage";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("signs in and stores the session", async () => {
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-1" }))
      .mockResolvedValueOnce(jsonResponse({ email: "owner@example.com", business: {} }));

    renderPage();
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(localStorage.getItem("gstbot_token")).toBe("tok-1"));
  });

  it("shows the server's message when sign-in fails", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Incorrect email or password" }, { status: 401 }),
    );

    renderPage();
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
  });

  it("asks for a GSTIN only when registering", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByLabelText("GSTIN")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.getByLabelText("GSTIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Legal name")).toBeInTheDocument();
  });

  it("confirms a valid GSTIN against the server", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(
      jsonResponse({ valid: true, state_name: "Maharashtra", pan: "AAPFU0939F" }),
    );

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZV");

    // Validated server-side rather than by a second copy of the check-digit
    // arithmetic in the browser.
    expect(await screen.findByText(/Valid — Maharashtra/)).toBeInTheDocument();
  });

  it("reports a bad check digit before the form is submitted", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(
      jsonResponse({ valid: false, error: "GSTIN check digit does not match" }),
    );

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZW");

    expect(await screen.findByText(/check digit does not match/)).toBeInTheDocument();
  });

  it("registers with the normalized GSTIN", async () => {
    const user = userEvent.setup();
    global.fetch
      // The per-keystroke GSTIN check.
      .mockResolvedValueOnce(jsonResponse({ valid: true, state_name: "Maharashtra" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-2" }))
      .mockResolvedValueOnce(jsonResponse({ email: "new@example.com", business: {} }));

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Create account" }));
    await user.type(screen.getByLabelText("GSTIN"), "27aapfu0939f1zv");
    await user.type(screen.getByLabelText("Legal name"), "Umang Traders Private Limited");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      const registerCall = global.fetch.mock.calls.find(
        ([url]) => url === "/api/v1/auth/register",
      );
      expect(registerCall).toBeDefined();
      expect(JSON.parse(registerCall[1].body).gstin).toBe("27AAPFU0939F1ZV");
    });
  });
});
