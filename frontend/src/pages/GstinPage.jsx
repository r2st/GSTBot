import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { api } from "../lib/api";

export default function GstinPage() {
  const { gstin } = useParams();
  usePageTitle(`GSTIN ${gstin || ""} — Verification & Details`);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gstin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.validateGstin(gstin);
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setResult({ valid: false, gstin, error: "Could not verify this GSTIN." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gstin]);

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <h1 className="tool-title">GSTIN {gstin}</h1>

          <div className="calc-card">
            {loading && <p>Verifying…</p>}

            {!loading && result && (
              <div className="lookup-result">
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
                  <>
                    <div className="lookup-badge lookup-invalid">Invalid GSTIN</div>
                    {result.error && <p className="lookup-reason">{result.error}</p>}
                  </>
                )}
              </div>
            )}

            <p className="rate-calc-link">
              <Link to="/lookup">Look up another GSTIN →</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
