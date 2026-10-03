import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "doaide-theme";
const VALID = ["light", "dark", "system"];

function stored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

function resolved(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const ThemeCtx = createContext({ theme: "system", resolved: "dark", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeRaw] = useState(stored);
  const [active, setActive] = useState(() => resolved(stored()));

  const setTheme = useCallback((next) => {
    const v = VALID.includes(next) ? next : "system";
    setThemeRaw(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* quota */ }
  }, []);

  useEffect(() => {
    setActive(resolved(theme));
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return undefined;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setActive(resolved("system"));
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = active;
    document.documentElement.style.colorScheme = active;
  }, [active]);

  return (
    <ThemeCtx.Provider value={{ theme, resolved: active, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
