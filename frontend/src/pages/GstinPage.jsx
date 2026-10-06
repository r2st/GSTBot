import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import SeoHead, { BASE_URL } from "../components/SeoHead";
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

  const path = `/gstin/${gstin || ""}`;
  const seoTitle = result && result.valid
    ? `GSTIN ${result.gstin} — ${result.state_name} | DoAide`
    : `GSTIN ${gstin || ""} — Verification & Details | DoAide`;
  const seoDesc = result && result.valid
    ? `GSTIN ${result.gstin} is valid. Registered in ${result.state_name} (${result.state_code}). PAN: ${result.pan}. Verify any GSTIN on DoAide GST.`
    : `Verify GSTIN ${gstin || ""}. Check registration status, state, PAN details. Free GSTIN lookup on DoAide GST.`;

  const jsonLd = result && result.valid ? {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: `GSTIN ${result.gstin}`,
    description: `GST registration in ${result.state_name}`,
    areaServed: { "@type": "State", name: result.state_name },
    provider: {
      "@type": "GovernmentOrganization",
      name: "Goods and Services Tax Network",
      url: "https://www.gst.gov.in",
    },
  } : null;

  const breadcrumbs = [
    { name: "Home", url: BASE_URL },
    { name: "GSTIN Lookup", url: `${BASE_URL}/lookup` },
    { name: `GSTIN ${gstin || ""}` },
  ];

  return (
    <div className="tool-page">
      <SeoHead
        title={seoTitle}
        description={seoDesc}
        path={path}
        jsonLd={jsonLd}
        breadcrumbs={breadcrumbs}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb items={[
            { label: "Home", to: "/" },
            { label: "GSTIN Lookup", to: "/lookup" },
            { label: `GSTIN ${gstin || ""}` },
          ]} />
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
              <Link to="/lookup">Verify another GSTIN →</Link>
            </p>
            <CrossProductLinks page="gstin" />
          </div>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
