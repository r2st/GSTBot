import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "./ErrorBanner";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { gstinShapeError, normalizeGstin, registrationErrors } from "../lib/validate";

const EMPTY = {
  email: "",
  password: "",
  gstin: "",
  legal_name: "",
  trade_name: "",
  full_name: "",
};

export default function AuthForm() {
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [gstinCheck, setGstinCheck] = useState(null);
  const asked = useRef("");

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const registering = mode === "register";

  function switchTo(next) {
    setMode(next);
    setError("");
    setFieldErrors({});
    setGstinCheck(null);
    asked.current = "";
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function checkGstin(value) {
    const cleaned = normalizeGstin(value);
    asked.current = cleaned;
    if (cleaned.length !== 15) {
      setGstinCheck(null);
      return;
    }
    const shape = gstinShapeError(cleaned);
    if (shape) {
      setGstinCheck({ valid: false, error: shape });
      return;
    }
    try {
      const verdict = await api.validateGstin(cleaned);
      if (asked.current !== cleaned) return;
      setGstinCheck(verdict);
    } catch {
      if (asked.current !== cleaned) return;
      setGstinCheck(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    if (!registering) {
      const problems = {};
      if (!form.email.trim()) problems.email = "Enter your email.";
      if (!form.password) problems.password = "Enter your password.";
      if (Object.keys(problems).length > 0) {
        setFieldErrors(problems);
        return;
      }
    }

    if (registering) {
      const problems = registrationErrors(form);
      if (!problems.gstin && form.gstin.trim() && gstinCheck && !gstinCheck.valid) {
        problems.gstin = gstinCheck.error || "That GSTIN is not valid.";
      }
      if (Object.keys(problems).length > 0) {
        setFieldErrors(problems);
        return;
      }
    }

    setBusy(true);
    try {
      if (registering) {
        await register({
          email: form.email,
          password: form.password,
          gstin: form.gstin.trim() ? form.gstin.replace(/\s/g, "").toUpperCase() : null,
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
    <div className="auth-card">
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`auth-tab ${!registering ? "is-active" : ""}`}
          aria-selected={!registering}
          onClick={() => switchTo("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          className={`auth-tab ${registering ? "is-active" : ""}`}
          aria-selected={registering}
          onClick={() => switchTo("register")}
        >
          Create account
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {registering && (
          <>
            <label htmlFor="gstin">GSTIN (optional)</label>
            <input
              id="gstin"
              name="gstin"
              autoComplete="off"
              spellCheck="false"
              placeholder="27AAPFU0939F1ZV"
              value={form.gstin}
              aria-invalid={fieldErrors.gstin ? true : undefined}
              aria-describedby={fieldErrors.gstin ? "gstin-error" : undefined}
              onChange={(e) => {
                update("gstin", e.target.value);
                checkGstin(e.target.value);
              }}
            />
            {fieldErrors.gstin ? (
              <p className="field-error" id="gstin-error" role="alert">
                {fieldErrors.gstin}
              </p>
            ) : (
              gstinCheck && (
                <p className={gstinCheck.valid ? "field-hint is-good" : "field-hint is-bad"}>
                  {gstinCheck.valid
                    ? `Valid — ${gstinCheck.state_name} (PAN ${gstinCheck.pan})`
                    : gstinCheck.error}
                </p>
              )
            )}

            <label htmlFor="legal_name">Legal name</label>
            <input
              id="legal_name"
              name="legal_name"
              required
              value={form.legal_name}
              aria-invalid={fieldErrors.legal_name ? true : undefined}
              aria-describedby={fieldErrors.legal_name ? "legal_name-error" : undefined}
              onChange={(e) => update("legal_name", e.target.value)}
            />
            {fieldErrors.legal_name && (
              <p className="field-error" id="legal_name-error" role="alert">
                {fieldErrors.legal_name}
              </p>
            )}

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
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onChange={(e) => update("email", e.target.value)}
        />
        {fieldErrors.email && (
          <p className="field-error" id="email-error" role="alert">
            {fieldErrors.email}
          </p>
        )}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={registering ? 8 : undefined}
          autoComplete={registering ? "new-password" : "current-password"}
          value={form.password}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          onChange={(e) => update("password", e.target.value)}
        />
        {fieldErrors.password ? (
          <p className="field-error" id="password-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : (
          registering && <p className="field-hint">At least 8 characters.</p>
        )}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
