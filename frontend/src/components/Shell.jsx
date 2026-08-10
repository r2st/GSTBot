import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import BusinessSwitcher from "./BusinessSwitcher";

const LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/invoices", label: "Invoices" },
  { to: "/upload", label: "Upload" },
  { to: "/reconcile", label: "Reconcile" },
  { to: "/itc", label: "ITC" },
  { to: "/filing", label: "Filing" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/alerts", label: "Alerts" },
  { to: "/status", label: "Status" },
];

export default function Shell({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef(null);

  // Nine links do not fit on a phone, so below 860px they collapse behind a
  // button. The menu stays in the DOM either way — CSS decides whether it is a
  // row or a drawer — so there is one nav for assistive tech rather than two
  // that can drift apart.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setNavOpen(false);
        // Focus goes back to the control that opened the drawer; leaving it on
        // a now-hidden link strands keyboard users at the top of the document.
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="shell-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ₹
          </span>
          <span className="brand-name">GSTBot</span>
        </div>

        <button
          type="button"
          ref={toggleRef}
          className="nav-toggle"
          aria-expanded={navOpen}
          aria-controls="main-nav"
          onClick={() => setNavOpen((open) => !open)}
        >
          <span className="nav-toggle-bars" aria-hidden="true" />
          <span className="visually-hidden">{navOpen ? "Close menu" : "Open menu"}</span>
        </button>

        <nav
          id="main-nav"
          className={navOpen ? "shell-nav is-open" : "shell-nav"}
          aria-label="Main"
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell-user">
          {/* Was a static caption of the one business a login could ever act
              for. It is the natural home for the switcher, because "which GSTIN
              am I looking at" and "take me to the other one" are the same
              question asked half a second apart. */}
          <BusinessSwitcher />
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {/* Tapping outside the drawer closes it. Hidden from assistive tech: the
          Escape handler above is the accessible equivalent. */}
      {navOpen && (
        <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      <main className="shell-main" id="main">
        {children}
      </main>
    </div>
  );
}
