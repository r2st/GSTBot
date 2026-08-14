import { AuthContext } from "../hooks/useAuth";

/**
 * A session with a chosen role, for tests that mount one page on its own.
 *
 * `canWrite` is derived here exactly as `AuthProvider` derives it — from
 * `active_role`, not `role` — rather than passed in beside it. A test that
 * could set the two independently would be able to assert a combination the
 * real provider can never produce, which is how a gating test passes over a
 * page that is still wrong in the browser.
 *
 * Defaults to an owner, so the several hundred existing tests that only ever
 * wanted "a signed-in user" keep describing the case they were written for and
 * a viewer is something a test has to ask for.
 */
export function StubAuth({ role = "owner", user: overrides, children }) {
  const user = {
    id: 1,
    email: "owner@example.com",
    role,
    active_role: role,
    business_id: 1,
    business: { id: 1, legal_name: "Umang Traders Private Limited" },
    ...overrides,
  };
  const value = {
    user,
    loading: false,
    canWrite: user.active_role !== "viewer",
    login: () => {},
    register: () => {},
    logout: () => {},
    switchBusiness: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
