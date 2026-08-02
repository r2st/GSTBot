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

  describe("validation", () => {
    /** Switch to the registration tab. */
    async function goToRegister(user) {
      await user.click(screen.getByRole("tab", { name: "Create account" }));
    }

    /**
     * True when a registration was attempted.
     *
     * Not `fetch` was never called: typing a well-shaped GSTIN legitimately
     * fires the lookup, so the assertion has to be about the registration.
     */
    function registered() {
      return global.fetch.mock.calls.some(([url]) => String(url).includes("/auth/register"));
    }

    it("asks for the email rather than sending a doomed request", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole("button", { name: "Sign in" }));

      // `noValidate` turned off the browser's own bubble, which said "Please
      // fill in this field" with no reference to what the field was for.
      expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("asks for the password too", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText("Email"), "owner@example.com");
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByText("Enter your password.")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("requires a GSTIN to register", async () => {
      const user = userEvent.setup();
      renderPage();
      await goToRegister(user);

      await user.type(screen.getByLabelText("Legal name"), "Acme Supplies");
      await user.type(screen.getByLabelText("Email"), "owner@example.com");
      await user.type(screen.getByLabelText("Password"), "supersecret123");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByText(/GSTIN is required/)).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("refuses a short password before the server does", async () => {
      const user = userEvent.setup();
      renderPage();
      await goToRegister(user);

      await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZV");
      await user.type(screen.getByLabelText("Legal name"), "Acme Supplies");
      await user.type(screen.getByLabelText("Email"), "owner@example.com");
      await user.type(screen.getByLabelText("Password"), "short");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
      expect(registered()).toBe(false);
    });

    it("requires a legal name, since it is what appears on the returns", async () => {
      const user = userEvent.setup();
      renderPage();
      await goToRegister(user);

      await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZV");
      await user.type(screen.getByLabelText("Email"), "owner@example.com");
      await user.type(screen.getByLabelText("Password"), "supersecret123");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByText(/Legal name is required/)).toBeInTheDocument();
      expect(registered()).toBe(false);
    });

    it("rejects a misshapen GSTIN without asking the server", async () => {
      const user = userEvent.setup();
      renderPage();
      await goToRegister(user);

      // Fifteen characters, but a digit where the PAN letters belong. The
      // shape check answers this without a round trip.
      await user.type(screen.getByLabelText("GSTIN"), "27AAPF00939F1ZV");

      expect(await screen.findByText(/does not look like a GSTIN/)).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("marks the invalid field for assistive tech", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole("button", { name: "Sign in" }));

      const email = screen.getByLabelText("Email");
      await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
      const describedBy = email.getAttribute("aria-describedby");
      expect(document.getElementById(describedBy)).toHaveTextContent("Enter your email.");
    });

    it("still asks the server about a well-shaped GSTIN", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ valid: true, state_name: "Maharashtra", pan: "AAPFU0939F" }),
      );

      renderPage();
      await goToRegister(user);
      await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZV");

      // The check digit deliberately is not duplicated in the browser, so a
      // correctly-shaped GSTIN must still be verified over the wire.
      expect(await screen.findByText(/Maharashtra/)).toBeInTheDocument();
    });

    it("blocks registration when the server said the GSTIN is invalid", async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ valid: false, error: "Checksum does not match" }),
      );

      renderPage();
      await goToRegister(user);
      await user.type(screen.getByLabelText("GSTIN"), "27AAPFU0939F1ZZ");
      await screen.findByText("Checksum does not match");

      await user.type(screen.getByLabelText("Legal name"), "Acme Supplies");
      await user.type(screen.getByLabelText("Email"), "owner@example.com");
      await user.type(screen.getByLabelText("Password"), "supersecret123");
      await user.click(screen.getByRole("button", { name: "Create account" }));

      // Only the GSTIN check went out — the registration did not.
      expect(registered()).toBe(false);
      expect(await screen.findByText("Checksum does not match")).toBeInTheDocument();
    });
  });
});
