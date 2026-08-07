import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, onUnauthorized, setToken } from "../lib/api";

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
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
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

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
