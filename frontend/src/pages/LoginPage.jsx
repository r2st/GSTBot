import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

const EMPTY = {
  email: "",
  password: "",
  gstin: "",
  legal_name: "",
  trade_name: "",
  full_name: "",
};

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // What the server said about the typed GSTIN: {valid, state_name} or null.
  const [gstinCheck, setGstinCheck] = useState(null);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const registering = mode === "register";

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Checked against the server rather than a regex in the browser: the check
  // digit is the part that catches a typo, and duplicating that arithmetic in
  // two languages is how the two come to disagree.
  async function checkGstin(value) {
    const cleaned = value.replace(/\s/g, "").toUpperCase();
    if (cleaned.length !== 15) {
      setGstinCheck(null);
      return;
    }
    try {
      setGstinCheck(await api.validateGstin(cleaned));
    } catch {
      setGstinCheck(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (registering) {
        await register({
          email: form.email,
          password: form.password,
          gstin: form.gstin.replace(/\s/g, "").toUpperCase(),
          legal_name: form.legal_name,
          trade_name: form.trade_name || null,
          full_name: form.full_name || null,
        });
      } else {
        await login(form.email, form.password);
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            ₹
          </span>
          <h1>GSTBot</h1>
          <p className="auth-tagline">GST compliance on autopilot</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!registering}
            className={!registering ? "auth-tab is-active" : "auth-tab"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={registering}
            className={registering ? "auth-tab is-active" : "auth-tab"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Create account
          </button>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError("")} />

        <form onSubmit={handleSubmit} className="auth-form">
          {registering && (
            <>
              <label htmlFor="gstin">GSTIN</label>
              <input
                id="gstin"
                name="gstin"
                required
                autoComplete="off"
                spellCheck="false"
                placeholder="27AAPFU0939F1ZV"
                value={form.gstin}
                onChange={(e) => {
                  update("gstin", e.target.value);
                  checkGstin(e.target.value);
                }}
              />
              {gstinCheck && (
                <p className={gstinCheck.valid ? "field-hint is-good" : "field-hint is-bad"}>
                  {gstinCheck.valid
                    ? `Valid — ${gstinCheck.state_name} (PAN ${gstinCheck.pan})`
                    : gstinCheck.error}
                </p>
              )}

              <label htmlFor="legal_name">Legal name</label>
              <input
                id="legal_name"
                name="legal_name"
                required
                value={form.legal_name}
                onChange={(e) => update("legal_name", e.target.value)}
              />

              <label htmlFor="trade_name">Trade name (optional)</label>
              <input
                id="trade_name"
                name="trade_name"
                value={form.trade_name}
                onChange={(e) => update("trade_name", e.target.value)}
              />

              <label htmlFor="full_name">Your name (optional)</label>
              <input
                id="full_name"
                name="full_name"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
              />
            </>
          )}

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={registering ? 8 : undefined}
            autoComplete={registering ? "new-password" : "current-password"}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
          {registering && <p className="field-hint">At least 8 characters.</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
