import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../hooks/useAuth";
import { getActiveBusinessId, getToken, setToken } from "../lib/api";
import BusinessSwitcher from "./BusinessSwitcher";

const HOME = { id: 1, gstin: "27AAPFU0939F1ZV", legal_name: "Umang Traders", plan: "free" };
const LINKED = { id: 2, gstin: "29AAPFU0939F1ZW", legal_name: "Umang Exports", plan: "free" };

/** The header control, which is also the menu toggle. */
function currentControl() {
  return screen.getByRole("button", { name: /switch business/i });
}

/**
 * A row in the open menu. Scoped to the list because the control above carries
 * the current business's name too, so an unscoped query matches both.
 */
function option(name) {
  return within(screen.getByRole("list")).getByRole("button", { name });
}

function reply(body, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

/**
 * Route by path, and answer /auth/me according to the `X-Business-Id` actually
 * sent — the switcher's whole contract is that the header decides who the
 * server says we are, so a mock that ignored it could not tell a switch that
 * worked from one that was never sent.
 */
function mockApi({ mine, mineStatus = 200, allow = [String(LINKED.id)] } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url, options = {}) => {
    const path = String(url);
    const method = options.method ?? "GET";
    const header = options.headers?.["X-Business-Id"];
    calls.push({ path, method, header });

    if (path.endsWith("/auth/me")) {
      if (header === undefined) return reply({ id: 1, email: "a@b.in", business: HOME });
      if (!allow.includes(String(header))) {
        return reply({ detail: "You do not have access to that business" }, 403);
      }
      return reply({ id: 1, email: "a@b.in", business: LINKED });
    }
    if (path.endsWith("/businesses/mine") && method === "GET") {
      if (mineStatus >= 400) return reply({ detail: "Server error" }, mineStatus);
      return reply(
        mine ?? {
          items: [
            { ...HOME, role: "owner", is_home: true },
            { ...LINKED, role: "member", is_home: false },
          ],
        },
      );
    }
    if (path.endsWith("/businesses/mine/link")) {
      return reply({ ...LINKED, role: "member", is_home: false });
    }
    if (path.includes("/businesses/mine/") && method === "DELETE") {
      return { ok: true, status: 204, statusText: "", text: async () => "" };
    }
    return reply({});
  });
  return calls;
}

async function renderSwitcher(options) {
  const calls = mockApi(options);
  setToken("a-token");
  render(
    <AuthProvider>
      <BusinessSwitcher />
    </AuthProvider>,
  );
  // The control only exists once /auth/me has said which business is current.
  await screen.findByText(HOME.legal_name);
  return calls;
}

describe("BusinessSwitcher", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the business the request is currently acting for", async () => {
    await renderSwitcher();
    expect(screen.getByText(HOME.legal_name)).toBeInTheDocument();
    expect(screen.getByText(HOME.gstin)).toBeInTheDocument();
  });

  it("does not ask for the business list until the menu is opened", async () => {
    // Most logins hold one registration and never open this. The header is on
    // every page, so an eager fetch is a request per page load that nobody reads.
    const calls = await renderSwitcher();
    expect(calls.some((c) => c.path.endsWith("/businesses/mine"))).toBe(false);

    await userEvent.click(currentControl());
    await waitFor(() =>
      expect(calls.some((c) => c.path.endsWith("/businesses/mine"))).toBe(true),
    );
  });

  it("sends X-Business-Id on every request once another registration is chosen", async () => {
    const calls = await renderSwitcher();
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: /^Umang Exports/ }));

    await waitFor(() => expect(screen.getByText(LINKED.gstin)).toBeInTheDocument());
    expect(getActiveBusinessId()).toBe(String(LINKED.id));
    // Confirmed against the server before it was believed, not just written.
    expect(
      calls.some((c) => c.path.endsWith("/auth/me") && c.header === String(LINKED.id)),
    ).toBe(true);
  });

  it("keeps acting for the current business when the switch is refused", async () => {
    // Written-then-confirmed: the selection is sent on every later request, so
    // a refused switch that left it in place would point the whole app at a
    // business the backend answers 403 for, one page at a time.
    await renderSwitcher({ allow: [] });
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: /^Umang Exports/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access/i);
    expect(getActiveBusinessId()).toBeNull();
    // Scoped to the control, not the page: the menu is deliberately still open
    // behind it, so the home GSTIN is on screen twice.
    expect(within(currentControl()).getByText(HOME.gstin)).toBeInTheDocument();
  });

  it("says the list could not be loaded rather than showing no registrations", async () => {
    // "You hold one business" and "we never found out" are different answers,
    // and only one of them means the link you just made did not save.
    await renderSwitcher({ mineStatus: 500 });
    await userEvent.click(currentControl());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Umang Exports/ })).not.toBeInTheDocument();
  });

  it("links another registration by its own credentials and reloads the list", async () => {
    const calls = await renderSwitcher();
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: "Link another GSTIN" }));

    await userEvent.type(screen.getByLabelText("Email"), "other@acme.in");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(calls.filter((c) => c.path.endsWith("/businesses/mine")).length).toBe(2),
    );
    expect(calls.some((c) => c.path.endsWith("/businesses/mine/link"))).toBe(true);
  });

  it("offers no unlink for the login's own tenant", async () => {
    // There is no membership row behind it to revoke and the server refuses;
    // a button whose only outcome is an error is worse than no button.
    await renderSwitcher();
    await userEvent.click(currentControl());
    await screen.findByRole("button", { name: /^Umang Exports/ });
    expect(
      screen.queryByRole("button", { name: /Unlink Umang Traders/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unlink Umang Exports/ })).toBeInTheDocument();
  });

  it("steps back to the home tenant when the business being acted for is unlinked", async () => {
    // Otherwise every later request carries a header the server has just
    // stopped honouring, and the app 403s a page at a time with nothing on
    // screen explaining why.
    await renderSwitcher();
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: /^Umang Exports/ }));
    await waitFor(() => expect(getActiveBusinessId()).toBe(String(LINKED.id)));

    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: /Unlink Umang Exports/ }));

    await waitFor(() => expect(getActiveBusinessId()).toBeNull());
    await waitFor(() =>
      expect(within(currentControl()).getByText(HOME.gstin)).toBeInTheDocument(),
    );
  });

  it("closes on Escape and puts focus back on the control that opened it", async () => {
    await renderSwitcher();
    const toggle = currentControl();
    await userEvent.click(toggle);
    await screen.findByText("Your registrations");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Your registrations")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
  it("closes when the click lands outside the menu", async () => {
    await renderSwitcher();
    await userEvent.click(currentControl());
    await screen.findByText("Your registrations");

    await userEvent.click(document.body);
    await waitFor(() =>
      expect(screen.queryByText("Your registrations")).not.toBeInTheDocument(),
    );
  });

  it("just closes when the business already being acted for is chosen again", async () => {
    // No request, and above all no write: re-selecting the home tenant through
    // `switchBusiness` would store an explicit `X-Business-Id` for the business
    // that is the default anyway, which then has to survive being revoked.
    const calls = await renderSwitcher();
    await userEvent.click(currentControl());
    await screen.findByRole("list");
    await userEvent.click(option(/^Umang Traders/));

    await waitFor(() =>
      expect(screen.queryByText("Your registrations")).not.toBeInTheDocument(),
    );
    expect(getActiveBusinessId()).toBeNull();
    expect(calls.filter((c) => c.path.endsWith("/auth/me"))).toHaveLength(1);
  });

  it("says why a link was refused instead of closing the form", async () => {
    // The wrong password for the other account is the common case here, and the
    // form has to still be there to correct it.
    await renderSwitcher();
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: "Link another GSTIN" }));
    await userEvent.type(screen.getByLabelText("Email"), "other@acme.in");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");

    global.fetch.mockResolvedValueOnce(
      reply({ detail: "Incorrect email or password" }, 401),
    );
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect email or password/i);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    // And the caller is still signed in. The 401 was about the password typed
    // into this form, not about the session it was typed from.
    expect(getToken()).toBe("a-token");
  });

  it("says why an unlink was refused rather than dropping the row silently", async () => {
    await renderSwitcher();
    await userEvent.click(currentControl());
    await screen.findByRole("button", { name: /^Umang Exports/ });

    global.fetch.mockResolvedValueOnce(reply({ detail: "Not linked." }, 404));
    await userEvent.click(screen.getByRole("button", { name: /Unlink Umang Exports/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not linked.");
    expect(screen.getByRole("button", { name: /^Umang Exports/ })).toBeInTheDocument();
  });

  it("still offers the link form when the list comes back without a list in it", async () => {
    // A 200 carrying no `items` is not an answer the server should give, but
    // it is the shape a truncated proxy response arrives in. Taken literally
    // it leaves `businesses` holding nothing iterable, and the way *out* of
    // this menu — linking the registration whose absence is the whole reason
    // it was opened — has to survive that, or the fix is unreachable from the
    // screen that shows the problem.
    await renderSwitcher({ mine: {} });
    await userEvent.click(currentControl());

    expect(
      await screen.findByRole("button", { name: "Link another GSTIN" }),
    ).toBeInTheDocument();
    // No rows, and no complaint either: nothing failed.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("forgets the other account's password when the link form is cancelled", async () => {
    // It belongs to another login and this component has no further use for it;
    // leaving it in state means reopening the form re-fills it.
    await renderSwitcher();
    await userEvent.click(currentControl());
    await userEvent.click(await screen.findByRole("button", { name: "Link another GSTIN" }));
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Link another GSTIN" }));
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
