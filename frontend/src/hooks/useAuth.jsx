import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  api,
  getActiveBusinessId,
  getToken,
  onUnauthorized,
  setActiveBusinessId,
  setToken,
} from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // The token expires after 24 hours and there is no refresh flow, so every
  // user meets this: a request goes out mid-session and comes back 401.
  //
  // The client drops the dead token; without this the session in React outlived
  // it. `Protected` kept rendering because `user` was still set, every request
  // after that went out unauthenticated and failed the same way, and `/login`
  // bounced straight back to `/` — which is gated on `user`, not on the token.
  // The one screen that could fix it was the one screen unreachable. Clearing
  // the user here is what turns an expired token into a redirect to sign in.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  // A stored token proves nothing on its own — it may be expired or belong to
  // a deleted user — so the session is confirmed against /auth/me on boot.
  //
  // The stored *business* proves nothing either, and it is the one that outlives
  // its own validity: `setActiveBusinessId` survives in localStorage across
  // sessions, while the membership behind it can be revoked, or the business
  // deactivated, at any time from the other side. `/auth/me` resolves through
  // `get_current_business`, so a selection that is no longer granted answers 403
  // — and treating that like any other failed session check signs the user out
  // of an account that is perfectly fine, on a browser that then does it again
  // on every reload, because the selection causing it is never cleared. Drop the
  // selection and ask once more as the login's own tenant, which is the tenant
  // they would have been switched back to anyway.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (err?.status === 403 && getActiveBusinessId()) {
          setActiveBusinessId(null);
          try {
            const home = await api.me();
            if (!cancelled) setUser(home);
            return;
          } catch {
            // Fall through: the session itself is what is wrong, not the
            // business it was pointed at.
          }
        }
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    await api.login(email, password);
    setUser(await api.me());
  }, []);

  const register = useCallback(async (payload) => {
    await api.register(payload);
    setUser(await api.me());
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  /**
   * Act for another of the businesses this login holds.
   *
   * The switch is only real once the server has agreed to it. `X-Business-Id`
   * is sent on every subsequent request, so writing it before confirming would
   * point the whole app at a business the backend may refuse — and the refusal
   * arrives per page, as each one fails on its own, rather than here where
   * there is something to say about it. So: select, ask `/auth/me` who that
   * makes us, and put the previous selection back if the answer is no.
   *
   * `user.business.id` is what the rest of the app keys off afterwards, because
   * it is the tenant the server says the request acted for, rather than the
   * tenant this browser last asked for.
   */
  const switchBusiness = useCallback(async (businessId) => {
    const previous = getActiveBusinessId();
    setActiveBusinessId(businessId);
    try {
      setUser(await api.me());
    } catch (err) {
      setActiveBusinessId(previous);
      throw err;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, switchBusiness }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
