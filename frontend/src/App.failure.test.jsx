/**
 * What every screen shows when the answer never comes.
 *
 * The other two sweeps in this directory cover the states a page passes
 * through when things work: `App.loading` asserts every route says what it is
 * waiting for, `App.rbac` asserts every route stays usable for a viewer. The
 * third state is a request that fails, and it was the one left to per-page
 * habit — which is how it drifted. Three pages grew a `loadFailed` flag
 * because someone noticed the specific screen claiming an empty book after a
 * 500; the rest were never asked.
 *
 * Two things are required of a failed load here, and the second is the one
 * that matters. Saying so is table stakes: a screen that renders nothing after
 * a failure reads as a frozen app. Not saying anything *else* is the finding —
 * "No invoices yet", under a button offering to upload your first, is a claim
 * about the business's books made on the strength of a request that never
 * arrived. It is worse than silence, because it is actionable and wrong: the
 * user's next move is to go looking for invoices they think they lost.
 *
 * So every route is mounted against a server that refuses everything except
 * the session, and each is required to raise an alert and to be showing
 * neither its data nor a sentence about what the absence of that data means.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./hooks/useAuth";
import { PageTitleProvider } from "./hooks/usePageTitle";
import { StateCodesProvider } from "./hooks/useStateCodes";
import { PURCHASE, SALE, installBackend } from "./test/backend";

const TODAY = new Date(2026, 4, 14);

/**
 * The books, behind a server that has stopped answering for them.
 *
 * The session endpoints are let through for the same reason the loading sweep
 * lets them through: `Protected` renders its own placeholder until `/auth/me`
 * lands, and a page that never mounts cannot be asked what it shows. The
 * failure under test is the page's own data, not being signed out.
 *
 * A 500 with a written sentence rather than a dropped connection, because that
 * is the failure with a plausible-looking body — `lib/api.js` has a message to
 * pull out of it, so a page that renders one is not doing so by accident.
 */
function failingBackend() {
  const backend = installBackend({ invoices: [PURCHASE, SALE], imported: true });
  const answer = backend.fetch;
  const attempted = [];

  global.fetch = vi.fn((input, init) => {
    const href = String(input);
    if (href.includes("/auth/me") || href.includes("/businesses/mine")) {
      return answer(input, init);
    }
    attempted.push(href);
    return Promise.resolve({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          detail: "Something went wrong on our side.",
          error: {
            code: "internal_error",
            status: 500,
            message: "Something went wrong on our side.",
          },
          correlation_id: "failtest00000000",
        }),
    });
  });

  return { attempted };
}

function renderApp(route) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PageTitleProvider>
        <ErrorBoundary>
          <StateCodesProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </StateCodesProvider>
        </ErrorBoundary>
      </PageTitleProvider>
    </MemoryRouter>,
  );
}

/**
 * Every screen that loads something, and what it must not be caught saying.
 *
 * `data` is what the screen shows when the request succeeds — taken from the
 * loading sweep, where it is the proof a page left its skeleton. Here it is
 * the opposite assertion: rows fetched under a request that failed are rows
 * from nowhere, and a heading counting them is worse still.
 *
 * `claim` is the sentence that would be a lie. Only the screens that have an
 * empty state carry one; the rest render nothing at all without their data,
 * which is honest and is asserted as `data` being absent.
 */
const SCREENS = [
  { route: "/", data: /Tax breakdown/, claim: null },
  { route: "/invoices", data: /INV-2026-0042/, claim: /No invoices yet/ },
  { route: "/invoices/1", data: /INV-2026-0042/, claim: null },
  {
    route: "/reconcile",
    data: /Your purchase register/,
    claim: /No purchase invoices booked for/,
  },
  { route: "/itc", data: /Credit available/, claim: null },
  { route: "/filing", data: /Ready to file/, claim: null },
  { route: "/suppliers", data: /Northwind/, claim: /No suppliers yet/ },
  { route: "/alerts", data: /GSTR-3B for 2026-04/, claim: /No alerts yet/ },
  { route: "/status", data: /Everything is running/, claim: null },
];

describe("what a screen shows when its data never arrives", () => {
  beforeEach(() => {
    vi.setSystemTime(TODAY);
    localStorage.setItem("gstbot_token", "flow-token");
    failingBackend();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each(SCREENS)("$route says the load failed", async ({ route }) => {
    renderApp(route);

    // By role, not by the sentence: what is asserted is that the failure was
    // *announced*, and an alert is what a screen reader is interrupted for.
    // A page that renders the words into a silent div has not told everyone.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    // An empty banner is a box with nothing in it: visibly there, saying the
    // page broke without saying what broke, which reads as a frozen app.
    expect(alerts.some((alert) => alert.textContent.trim().length > 0)).toBe(true);
  });

  it.each(SCREENS)("$route stops showing data it never received", async ({ route, data }) => {
    renderApp(route);
    await screen.findAllByRole("alert");

    expect(screen.queryByText(data)).not.toBeInTheDocument();
  });

  it.each(SCREENS.filter((screenSpec) => screenSpec.claim))(
    "$route does not conclude anything about a book it could not read",
    async ({ route, claim }) => {
      renderApp(route);
      await screen.findAllByRole("alert");

      // The empty state is a finding — there are none of these yet — and a
      // request that failed establishes no such thing.
      expect(screen.queryByText(claim)).not.toBeInTheDocument();
    },
  );

  it("leaves the shell standing so the failure is one screen and not the app", async () => {
    // The alternative is the error boundary, and the difference matters: a
    // page that throws takes the navigation with it, so a failed dashboard
    // becomes a session with no way out except the browser's back button.
    // Every page here handles its own refusal, and this is what says so.
    renderApp("/");
    await screen.findAllByRole("alert");

    expect(screen.getByRole("link", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong on this page/)).not.toBeInTheDocument();
  });
});
