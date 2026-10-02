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
vi.mock("./pages/LandingPage", () => ({ default: () => <div>Landing page</div> }));
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

    it("holds /login behind the loading check too, via the redirect to /", () => {
      renderAt("/login", LOADING);

      expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
      expect(screen.queryByText("Landing page")).not.toBeInTheDocument();
    });
  });

  describe("when signed out", () => {
    it("sends a protected route to the landing page", () => {
      renderAt("/invoices", { user: null, loading: false });

      expect(screen.getByText("Landing page")).toBeInTheDocument();
      expect(screen.queryByText("Invoices page")).not.toBeInTheDocument();
    });

    it("keeps alerts behind the landing page, since they name a tenant's returns", () => {
      renderAt("/alerts", { user: null, loading: false });

      expect(screen.getByText("Landing page")).toBeInTheDocument();
      expect(screen.queryByText("Alerts page")).not.toBeInTheDocument();
    });

    it("redirects /login to the landing page", () => {
      renderAt("/login", { user: null, loading: false });

      expect(screen.getByText("Landing page")).toBeInTheDocument();
    });

    it("shows the landing page to an anonymous visitor, not the shell", () => {
      renderAt("/", { user: null, loading: false });

      expect(screen.getByText("Landing page")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    });

    it("lands an unknown path on the landing page, via the catch-all redirect", () => {
      renderAt("/nope/not/a/page", { user: null, loading: false });

      expect(screen.getByText("Landing page")).toBeInTheDocument();
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

describe("switching to another GSTIN", () => {
  // Every page loads on mount and holds what it loaded in state, and none of
  // them watch the business — until the switcher shipped, it could not change
  // while they were mounted. So the page is thrown away and rebuilt rather than
  // re-rendered, which is also what re-runs each page's own fetch.
  function renderFor(businessId) {
    auth.current = {
      user: { ...USER, business: { id: businessId, legal_name: "Acme Traders" } },
      loading: false,
    };
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("rebuilds the page so its data cannot outlive the tenant it was fetched for", () => {
    const { rerender } = renderFor(1);
    const before = screen.getByText("Dashboard page");

    auth.current = {
      user: { ...USER, business: { id: 2, legal_name: "Acme Exports" } },
      loading: false,
    };
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    // A new DOM node is the observable half of "unmounted and mounted again".
    // Left keyed on nothing, React reuses this node and the previous tenant's
    // figures stay on screen under the new company's name in the header.
    expect(screen.getByText("Dashboard page")).not.toBe(before);
  });

  it("keeps the page alive across a re-render that does not change tenant", () => {
    // The key must not be something that merely changes often: remounting on
    // every render would refetch each page continuously.
    const { rerender } = renderFor(1);
    const before = screen.getByText("Dashboard page");

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Dashboard page")).toBe(before);
  });
});
