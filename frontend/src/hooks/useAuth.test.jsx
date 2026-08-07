import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getToken, setToken } from "../lib/api";
import { AuthProvider, useAuth } from "./useAuth";

const USER = {
  id: 1,
  email: "owner@example.com",
  full_name: "Umang Shah",
  business: { id: 1, gstin: "27AAPFU0939F1ZV", legal_name: "Umang Traders Private Limited" },
};

/**
 * Route by path and method, because a login is two requests — the token call
 * and the /auth/me that confirms who it belongs to — and the tests care about
 * both happening in that order.
 */
function mockApi({ me = USER, meStatus = 200, loginStatus = 200 } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method ?? "GET" });

    const reply = (body, status) => ({
      ok: status < 400,
      status,
      statusText: status < 400 ? "OK" : "Error",
      text: async () => JSON.stringify(body),
    });

    if (path.endsWith("/auth/me")) {
      return meStatus >= 400
        ? reply({ detail: "Token has expired" }, meStatus)
        : reply(me, 200);
    }
    if (path.endsWith("/auth/login") || path.endsWith("/auth/register")) {
      return loginStatus >= 400
        ? reply({ detail: "Incorrect email or password" }, loginStatus)
        : reply({ access_token: "fresh-token", token_type: "bearer" }, 200);
    }
    return reply({}, 200);
  });
  return calls;
}

/**
 * A probe that renders the context so the tests can assert on the DOM.
 *
 * It catches and displays failures the way a real page does — the hook
 * rejects, and the caller is responsible for the message. Letting the
 * rejection escape an onClick handler would only produce an unhandled
 * promise, which no assertion can see.
 */
function Probe() {
  const { user, loading, login, register, logout } = useAuth();
  const [error, setError] = useState("");

  const attempt = (run) => async () => {
    setError("");
    try {
      await run();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "anonymous"}</span>
      <span data-testid="error">{error}</span>
      <button type="button" onClick={attempt(() => login("owner@example.com", "supersecret123"))}>
        Sign in
      </button>
      <button type="button" onClick={attempt(() => register({ email: "new@example.com" }))}>
        Register
      </button>
      <button type="button" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthProvider", () => {
  describe("on boot", () => {
    it("does not call the API when there is no stored token", async () => {
      const calls = mockApi();
      renderWithProvider();

      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
      expect(calls).toHaveLength(0);
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    });

    it("confirms a stored token against the server rather than trusting it", async () => {
      // A token in localStorage proves nothing: it may be expired or belong to
      // a user who has since been deleted.
      setToken("stored-token");
      const calls = mockApi();
      renderWithProvider();

      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));
      expect(calls).toEqual([{ path: "/api/v1/auth/me", method: "GET" }]);
    });

    it("discards a token the server rejects", async () => {
      setToken("expired-token");
      mockApi({ meStatus: 401 });
      renderWithProvider();

      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
      expect(getToken()).toBeNull();
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    });

    it("stops loading even when the confirmation fails", async () => {
      // Otherwise a dead backend leaves the app on its boot spinner forever
      // with no way to reach the login form.
      setToken("stored-token");
      mockApi({ meStatus: 500 });
      renderWithProvider();

      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    });
  });

  describe("signing in", () => {
    it("stores the token and loads the user behind it", async () => {
      const calls = mockApi();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));
      expect(getToken()).toBe("fresh-token");
      expect(calls.map((c) => c.path)).toEqual(["/api/v1/auth/login", "/api/v1/auth/me"]);
    });

    it("leaves the session anonymous when the credentials are wrong", async () => {
      mockApi({ loginStatus: 401 });
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

      // The page component is what renders the message; the hook's job is to
      // let the rejection through rather than half-signing anyone in.
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() =>
        expect(screen.getByTestId("error")).toHaveTextContent("Incorrect email or password"),
      );
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
      expect(getToken()).toBeNull();
    });
  });

  describe("registering", () => {
    it("signs the new user straight in without a second round trip", async () => {
      const calls = mockApi();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

      await userEvent.click(screen.getByRole("button", { name: "Register" }));

      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));
      expect(calls.map((c) => c.path)).toEqual(["/api/v1/auth/register", "/api/v1/auth/me"]);
    });
  });

  describe("signing out", () => {
    it("drops both the token and the user", async () => {
      setToken("stored-token");
      mockApi();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));

      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

      expect(getToken()).toBeNull();
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous");
    });

    it("does not need the server to agree", async () => {
      // Signing out must work with the backend down; the token is local.
      setToken("stored-token");
      mockApi();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));

      global.fetch = vi.fn(async () => {
        throw new Error("network down");
      });
      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

      expect(getToken()).toBeNull();
    });
  });
});

describe("a token that expires mid-session", () => {
  // The access token lasts 24 hours and there is no refresh flow, so this is
  // not an edge case — it is what happens to every user who leaves a tab open
  // overnight.

  it("ends the session when a request comes back 401", async () => {
    setToken("stored-token");
    mockApi();
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));

    // A later request finds the token expired. Dropping it is not enough on
    // its own: `user` stayed set, so `Protected` kept rendering, every request
    // after this went out with no Authorization header, and `/login` — which
    // is gated on `user`, not on the token — redirected straight back. The one
    // screen that could fix it was the one screen unreachable.
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ detail: "Token has expired" }),
    }));
    await expect(api.dashboard()).rejects.toThrow();

    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("anonymous"),
    );
    expect(getToken()).toBeNull();
  });

  it("leaves a signed-in session alone when a request merely fails", async () => {
    // Only a refused credential ends the session. A 500 or a dropped
    // connection is a request to retry, not a reason to sign someone out
    // mid-upload.
    setToken("stored-token");
    mockApi();
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent(USER.email));

    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => JSON.stringify({ detail: "The database is temporarily unavailable." }),
    }));
    await expect(api.dashboard()).rejects.toThrow();

    expect(screen.getByTestId("user")).toHaveTextContent(USER.email);
    expect(getToken()).toBe("stored-token");
  });
});

describe("useAuth", () => {
  it("fails loudly when used outside the provider", () => {
    // A silent null context turns into "cannot read property user of null"
    // several components away from the mistake.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within AuthProvider/);
    quiet.mockRestore();
  });
});
