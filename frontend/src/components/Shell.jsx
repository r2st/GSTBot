import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const LINKS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/invoices", label: "Invoices" },
  { to: "/upload", label: "Upload" },
  { to: "/reconcile", label: "Reconcile" },
];

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ₹
          </span>
          <span className="brand-name">GSTBot</span>
        </div>

        <nav className="shell-nav" aria-label="Main">
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
          {user?.business && (
            <div className="shell-business">
              <span className="shell-business-name">
                {user.business.trade_name || user.business.legal_name}
              </span>
              <span className="shell-gstin">{user.business.gstin}</span>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="shell-main">{children}</main>
    </div>
  );
}
