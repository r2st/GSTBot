import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../hooks/usePageTitle";
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

export default function LoginPage() {
  usePageTitle("Sign in");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Per-field registration messages, cleared on every submit attempt.
  const [fieldErrors, setFieldErrors] = useState({});
  // What the server said about the typed GSTIN: {valid, state_name} or null.
  const [gstinCheck, setGstinCheck] = useState(null);
  // The GSTIN the newest check was asked about. A verdict is only shown while
  // it still describes what is in the field; see `checkGstin`.
  const asked = useRef("");

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const registering = mode === "register";

  /**
   * Switch tabs, taking the previous tab's complaints with it.
   *
   * The two forms do not ask the same questions, so a message left behind is
   * usually a message about a field that is no longer on screen — and once,
   * memorably, about one that is. A rejected registration password puts "Use
   * at least 8 characters." under the password box; that box is still there
   * after the switch to sign-in, so the sentence stayed, now attached to a
   * field where it is not true and where an existing account with a shorter
   * password reads it as the reason it cannot get in.
   *
   * The GSTIN verdict goes too, along with the address it was asked about, so
   * returning to the tab re-asks rather than showing an answer about whatever
   * was in the box some minutes ago.
   */
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

  // The check digit is checked against the server rather than by a regex in
  // the browser: that arithmetic is the part which catches a typo, and
  // duplicating it in two languages is how the two come to disagree. The shape
  // is checked locally first, so an obviously wrong string gets an answer
  // without a round trip — and so a 15-character string of the wrong shape is
  // not sent at all.
  // A verdict is only applied while it still describes what is in the field.
  // Correcting a mistyped check digit is the ordinary way this box is used, and
  // it is exactly the sequence that goes wrong: fifteen characters fire a
  // check, a backspace and a retype fire another, and if the first answer lands
  // second the field reads "Valid — Karnataka" about a GSTIN nobody typed.
  // Deleting a character had the same effect from the other direction — the
  // field cleared the hint on its way down to fourteen characters, then the
  // outstanding request arrived and put a verdict back under an incomplete
  // GSTIN. Both are wrong in the direction that matters, because this hint is
  // what tells someone their registration will be accepted.
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
      // A failed check is not a verdict — the server decides again on submit.
      if (asked.current !== cleaned) return;
      setGstinCheck(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    setFieldErrors({});

    if (!registering) {
      // `noValidate` turned off the browser's own required-field check, so the
      // empty case is handled here rather than being sent as a doomed 401.
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
      // A GSTIN the server has already rejected blocks the submit too. Letting
      // it through costs a round trip to be told the same thing, and the reply
      // to a failed registration is a generic 400 rather than this sentence.
      if (!problems.gstin && gstinCheck && !gstinCheck.valid) {
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
      <div className="auth-container">
        <svg viewBox="0 0 48 48" className="auth-robot" aria-hidden="true">
          <g fill="none">
            <line x1="24" y1="8" x2="24" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="24" cy="2" r="1.8" fill="currentColor" opacity="0.9" />
            <circle cx="24" cy="2" r="2.8" fill="currentColor" opacity="0.25" />
            <rect x="14" y="8" width="20" height="14" rx="4" fill="currentColor" />
            <circle cx="19.5" cy="14" r="2.2" fill="#0A0A0B" />
            <circle cx="28.5" cy="14" r="2.2" fill="#0A0A0B" />
            <path d="M20 18.5 Q24 21.5 28 18.5" stroke="#0A0A0B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <rect x="16" y="23" width="16" height="12" rx="3" fill="currentColor" />
            <rect x="8" y="24" width="7" height="3.5" rx="1.8" fill="currentColor" />
            <rect x="33" y="24" width="7" height="3.5" rx="1.8" fill="currentColor" />
            <rect x="19" y="36" width="3.5" height="5" rx="1.5" fill="currentColor" />
            <rect x="25.5" y="36" width="3.5" height="5" rx="1.5" fill="currentColor" />
            <g transform="translate(36, 28)">
              <rect x="-2.5" y="0" width="7" height="5.5" rx="1" fill="#0A0A0B" stroke="currentColor" strokeWidth="0.8" />
              <path d="M-0.5 0 v-1.2 a1.2 1.2 0 0 1 1.2-1.2 h0.6 a1.2 1.2 0 0 1 1.2 1.2 v1.2" stroke="currentColor" strokeWidth="0.7" fill="none" />
              <rect x="0" y="2" width="2" height="1" rx="0.3" fill="currentColor" />
            </g>
          </g>
        </svg>

        <h1 className="auth-title">
          DoAide <span className="auth-title-accent">GST</span>
        </h1>
        <p className="auth-subtitle">AI-powered GST compliance for Indian businesses</p>

        <div className="auth-card">
          <ErrorBanner message={error} onDismiss={() => setError("")} />

          {/* noValidate: the browser's own bubbles say "Please fill in this
              field" with no reference to what the field is for, and they cannot
              be styled or read by the tests. The rules are enforced above. */}
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
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

        <p className="auth-switch">
          {registering ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                role="tab"
                aria-selected={!registering}
                onClick={() => switchTo("login")}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              {"Don’t have an account? "}
              <button
                type="button"
                role="tab"
                aria-selected={registering}
                onClick={() => switchTo("register")}
              >
                Create account
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
