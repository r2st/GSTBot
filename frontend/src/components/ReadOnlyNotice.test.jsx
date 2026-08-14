import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthContext } from "../hooks/useAuth";
import { StubAuth } from "../test/auth";
import ReadOnlyNotice from "./ReadOnlyNotice";

/**
 * A session the way `AuthProvider` hands one out before `/auth/me` answers, or
 * after a 401 clears it: `user` is null and `canWrite` is false.
 *
 * `StubAuth` cannot express this — it always builds a user, deliberately, so
 * that a page test cannot assert against a session shape the real provider
 * never produces. The signed-out case is the one thing it is therefore unable
 * to say, so it is spelled out here rather than by loosening the shared stub.
 */
function SignedOut({ children }) {
  const value = {
    user: null,
    loading: false,
    canWrite: false,
    login: () => {},
    register: () => {},
    logout: () => {},
    switchBusiness: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

describe("ReadOnlyNotice", () => {
  describe("when the session may write", () => {
    it("renders nothing at all", () => {
      const { container } = render(
        <StubAuth role="owner">
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(container).toBeEmptyDOMElement();
    });

    // An accountant is the other writing role, and the gate is `!== "viewer"`
    // rather than `=== "owner"`. Pinned so that narrowing it to owners alone
    // has to break a test rather than quietly banner every accountant.
    it("stays away for an accountant too", () => {
      const { container } = render(
        <StubAuth role="accountant">
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("when there is no session", () => {
    // Reachable on every cold load: `AuthProvider` starts with `user` null and
    // `canWrite` false while `/auth/me` is in flight. Without the `!user` arm
    // the notice would flash on the way in, telling someone who is about to be
    // an owner that they are a viewer.
    it("renders nothing rather than calling the reader a viewer", () => {
      const { container } = render(
        <SignedOut>
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </SignedOut>,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("when the session is a viewer", () => {
    it("says so in a status region", () => {
      render(
        <StubAuth role="viewer">
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      // `status`, not `alert`. Nothing has gone wrong and the notice is there
      // on first paint, so announcing it as an alert would interrupt a screen
      // reader mid-navigation over a permission the user has always had.
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent(/read-only/);
    });

    it("names the role held", () => {
      render(
        <StubAuth role="viewer">
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(/viewer/);
    });

    it("names the business the role is held on", () => {
      render(
        <StubAuth role="viewer">
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      // The business matters because a viewer here is usually an owner
      // somewhere else: an accountant linked into a client sees their own
      // full-access business in the switcher and needs to know which one the
      // refusal is about.
      expect(screen.getByRole("status")).toHaveTextContent(
        /Umang Traders Private Limited/,
      );
    });

    it("shows the caller's own advice about what to do next", () => {
      render(
        <StubAuth role="viewer">
          <ReadOnlyNotice>Ask an owner or an accountant to upload invoices.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Ask an owner or an accountant to upload invoices.",
      );
    });
  });

  describe("when the server did not say which business", () => {
    // Both arms below are the `??` fallbacks, and both are reachable through
    // the same door: `/auth/me` answers with the membership, and the embedded
    // business is populated by a serializer that can leave it out — an account
    // whose only membership was just revoked, or a payload from a build of the
    // API that predates the field. Everything else on the notice is still true
    // and still worth saying, so it degrades to naming no business rather than
    // rendering "your role on undefined".

    it("falls back to naming no business rather than printing nothing", () => {
      render(
        <StubAuth role="viewer" user={{ business: null }}>
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent(/this business/);
      expect(notice).toHaveTextContent(/read-only/);
    });

    it("falls back the same way when the business arrives without a name", () => {
      render(
        <StubAuth role="viewer" user={{ business: { id: 1 } }}>
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(/this business/);
    });

    it("never renders the word undefined", () => {
      render(
        <StubAuth role="viewer" user={{ business: undefined }}>
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(/undefined|null/);
    });
  });

  describe("when the caller supplies no advice", () => {
    // No call site in the app leaves the children off today, which is exactly
    // why the default is worth a test: the next screen to add the notice will
    // reach for the bare tag, and a banner that names a refusal without naming
    // anyone who can lift it sends the reader to the bug tracker.
    it("still says who can lift the restriction", () => {
      render(
        <StubAuth role="viewer">
          <ReadOnlyNotice />
        </StubAuth>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Ask an owner or an accountant to make changes.",
      );
    });
  });

  describe("when the role differs from the role on the login's own business", () => {
    // `active_role`, not `role` — an owner linked into a client as a viewer.
    // Gating on `role` would show the full set of buttons for the one business
    // where every one of them is refused, so the notice has to follow the
    // active membership.
    it("follows the active membership rather than the login's own role", () => {
      render(
        <StubAuth
          role="viewer"
          user={{
            role: "owner",
            active_role: "viewer",
            business: { id: 7, legal_name: "Client Exports LLP" },
          }}
        >
          <ReadOnlyNotice>Ask someone else.</ReadOnlyNotice>
        </StubAuth>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(/Client Exports LLP/);
    });
  });
});
