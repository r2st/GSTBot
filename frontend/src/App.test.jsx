import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Auth is mocked rather than driven through AuthProvider because the states
// that matter here are the three the provider passes through — loading, signed
// out, signed in — and reaching "loading" through the real provider means
// holding a fetch open, which makes the interesting assertions racy.
const auth = vi.hoisted(() => ({ current: { user: null, loading: false } }));
vi.mock("./hooks/useAuth", () => ({ useAuth: () => auth.current }));

// Every page is stubbed. This file is about which route renders what, not
// about what any page does with the API; stubbing keeps one routing test from
// needing a fetch mock for nine different endpoints. Shell and ErrorBoundary
// are deliberately left real — where the boundary sits *relative to* the shell
// is one of the things being asserted.
const crash = vi.hoisted(() => ({ current: false }));
vi.mock("./pages/DashboardPage", () => ({
  default: () => {
    if (crash.current) throw new Error("total is not a number");
    return <div>Dashboard page</div>;
  },
}));
vi.mock("./pages/LoginPage", () => ({ default: () => <div>Login page</div> }));
vi.mock("./pages/InvoicesPage", () => ({ default: () => <div>Invoices page</div> }));
vi.mock("./pages/InvoiceDetailPage", () => ({ default: () => <div>Invoice detail page</div> }));
vi.mock("./pages/UploadPage", () => ({ default: () => <div>Upload page</div> }));
vi.mock("./pages/ReconcilePage", () => ({ default: () => <div>Reconcile page</div> }));
vi.mock("./pages/ITCPage", () => ({ default: () => <div>ITC page</div> }));
vi.mock("./pages/FilingPage", () => ({ default: () => <div>Filing page</div> }));
vi.mock("./pages/SuppliersPage", () => ({ default: () => <div>Suppliers page</div> }));
vi.mock("./pages/AlertsPage", () => ({ default: () => <div>Alerts page</div> }));

const USER = { id: 1, email: "owner@acme.in", business: { legal_name: "Acme Traders" } };

function renderAt(route, state = { user: USER, loading: false }) {
  auth.current = state;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  crash.current = false;
  auth.current = { user: null, loading: false };
});

afterEach(() => vi.restoreAllMocks());

describe("App routing", () => {
  describe("while the session is still being confirmed", () => {
    const LOADING = { user: null, loading: true };

    it("holds a protected route instead of redirecting to login", () => {
      // The regression this guards: /auth/me has not answered yet, so `user`
      // is null but the visitor may well be signed in. Redirecting on that
      // null bounces a signed-in user to the login page on every refresh.
      renderAt("/", LOADING);

      expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
      expect(screen.queryByText("Login page")).not.toBeInTheDocument();
      expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
    });

    it("renders nothing at /login rather than flashing the form", () => {
      // The mirror case: showing the form to someone who turns out to be
      // signed in means the form is yanked away mid-keystroke.
      const { container } = renderAt("/login", LOADING);

      expect(screen.queryByText("Login page")).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("when signed out", () => {
    it("sends a protected route to the login page", () => {
      renderAt("/invoices", { user: null, loading: false });

      expect(screen.getByText("Login page")).toBeInTheDocument();
      expect(screen.queryByText("Invoices page")).not.toBeInTheDocument();
    });

    it("keeps alerts behind the login, since they name a tenant's returns", () => {
      renderAt("/alerts", { user: null, loading: false });

      expect(screen.getByText("Login page")).toBeInTheDocument();
      expect(screen.queryByText("Alerts page")).not.toBeInTheDocument();
    });

    it("shows the login page at /login", () => {
      renderAt("/login", { user: null, loading: false });

      expect(screen.getByText("Login page")).toBeInTheDocument();
    });

    it("does not leak the shell navigation to an anonymous visitor", () => {
      renderAt("/", { user: null, loading: false });

      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    });

    it("lands an unknown path on login, via the dashboard redirect", () => {
      // "*" redirects to "/", which is itself protected — the two redirects
      // have to compose rather than leaving a signed-out visitor at a blank
      // dashboard.
      renderAt("/nope/not/a/page", { user: null, loading: false });

      expect(screen.getByText("Login page")).toBeInTheDocument();
    });
  });

  describe("when signed in", () => {
    it.each([
      ["/", "Dashboard page"],
      ["/invoices", "Invoices page"],
      ["/invoices/42", "Invoice detail page"],
      ["/upload", "Upload page"],
      ["/reconcile", "Reconcile page"],
      ["/itc", "ITC page"],
      ["/filing", "Filing page"],
      ["/suppliers", "Suppliers page"],
      ["/alerts", "Alerts page"],
    ])("renders %s", (route, expected) => {
      renderAt(route);

      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("wraps protected pages in the shell", () => {
      renderAt("/invoices");

      expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
    });

    it("keeps /invoices/:id distinct from the list", () => {
      // Both live under /invoices; an over-eager route would match the list
      // for a detail URL.
      renderAt("/invoices/42");

      expect(screen.queryByText("Invoices page")).not.toBeInTheDocument();
    });

    it("redirects away from /login", () => {
      renderAt("/login");

      expect(screen.getByText("Dashboard page")).toBeInTheDocument();
      expect(screen.queryByText("Login page")).not.toBeInTheDocument();
    });

    it("sends an unknown path to the dashboard", () => {
      renderAt("/nope/not/a/page");

      expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    });
  });

  describe("when a page crashes", () => {
    it("keeps the navigation usable so the user can leave the broken screen", async () => {
      // This is why the boundary is inside Shell rather than around it. If it
      // wrapped the shell, a crashed page would take the nav down with it and
      // the only way out would be the browser's back button.
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      crash.current = true;
      renderAt("/");

      expect(screen.getByRole("alert")).toHaveTextContent(/this screen hit an error/i);
      expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();

      // And navigating away clears it, rather than leaving every later route
      // showing the fallback.
      crash.current = false;
      await userEvent.click(screen.getByRole("link", { name: "Invoices" }));

      expect(screen.getByText("Invoices page")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      quiet.mockRestore();
    });

    it("reports the underlying message rather than a bare apology", () => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      crash.current = true;
      renderAt("/");

      expect(screen.getByText("total is not a number")).toBeInTheDocument();
      quiet.mockRestore();
    });
  });
});
