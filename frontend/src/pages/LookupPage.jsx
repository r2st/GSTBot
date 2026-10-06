import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Breadcrumb from "../components/Breadcrumb";
import DeadlineBanner from "../components/DeadlineBanner";
import DoAideFooter from "../components/DoAideFooter";
import RecentLookups from "../components/RecentLookups";
import RelatedTools from "../components/RelatedTools";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { api } from "../lib/api";
import { track } from "../lib/track";
import { normalizeGstin } from "../lib/validate";

export default function LookupPage() {
  usePageTitle("Free GSTIN Lookup — Verify Any GST Number Instantly");
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const initialGstin = params.gstin || new URLSearchParams(location.search).get("q") || "";
  const [input, setInput] = useState(initialGstin);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const lookup = useCallback(
    async (gstin) => {
      const cleaned = normalizeGstin(gstin);
      if (!cleaned || cleaned.length < 2) {
        setResult(null);
        setError("");
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError("");
      try {
        const data = await api.validateGstin(cleaned);
        if (controller.signal.aborted) return;
        setResult(data);
        track("gstin_lookup", { gstin: cleaned });
        if (data.valid) {
          navigate(`/gstin/${cleaned}`, { replace: true });
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError("Could not reach the server. Try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (initialGstin) lookup(initialGstin);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault();
    lookup(input);
  };

  return (
    <div className="tool-page">
      <ToolsNav />
      <DeadlineBanner />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GSTIN Lookup</h1>
          <p className="tool-subtitle">
            Verify any GST number instantly. Check validity, state, and PAN details.
          </p>

          <div className="calc-card">
            <form onSubmit={handleSubmit} className="lookup-form">
              <label className="calc-label">
                Enter GSTIN
                <input
                  type="text"
                  className="calc-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 27AAPFU0939F1ZV"
                  maxLength={20}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="btn btn-primary lookup-btn" disabled={loading}>
                {loading ? "Checking…" : "Verify GSTIN"}
              </button>
            </form>

            {error && <p className="lookup-error" role="alert">{error}</p>}

            {result && (
              <div className="lookup-result" aria-live="polite">
                {result.valid ? (
                  <>
                    <div className="lookup-badge lookup-valid">Valid GSTIN</div>
                    <dl className="lookup-details">
                      <dt>GSTIN</dt>
                      <dd className="lookup-gstin-value">{result.gstin}</dd>
                      <dt>State</dt>
                      <dd>{result.state_name} ({result.state_code})</dd>
                      <dt>PAN</dt>
                      <dd>{result.pan}</dd>
                    </dl>
                    <ShareButtons
                      path={`/gstin/${result.gstin}`}
                      text={`GSTIN ${result.gstin} is valid — registered in ${result.state_name}. Verified on DoAide GST`}
                    />
                  </>
                ) : (
                  <div className="lookup-badge lookup-invalid">Invalid GSTIN</div>
                )}
                {result.error && <p className="lookup-reason">{result.error}</p>}
              </div>
            )}
          </div>

          <RecentLookups />

          <section className="tool-info">
            <h2>What Is a GSTIN?</h2>
            <p>
              A GSTIN (Goods and Services Tax Identification Number) is a unique 15-character
              identifier assigned to every business registered under GST in India. It encodes
              the state, PAN of the entity, and a check digit.
            </p>
            <h3>GSTIN Format</h3>
            <ul>
              <li><strong>Digits 1–2:</strong> State code (e.g. 27 = Maharashtra)</li>
              <li><strong>Digits 3–12:</strong> PAN of the registered entity</li>
              <li><strong>Digit 13:</strong> Entity number for that PAN in that state</li>
              <li><strong>Digit 14:</strong> Always Z (reserved)</li>
              <li><strong>Digit 15:</strong> Check digit</li>
            </ul>
            <h3>Why Verify a GSTIN?</h3>
            <p>
              A wrong GSTIN on a purchase invoice is the most common reason ITC goes unclaimed.
              The invoice shows up as "missing at supplier's end" in GSTR-2B, and the credit
              you paid for never arrives. Verifying at the point of entry catches typos before
              they cost money.
            </p>
          </section>

          <RelatedTools current="/lookup" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
