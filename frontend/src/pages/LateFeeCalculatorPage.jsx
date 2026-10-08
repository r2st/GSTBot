import { useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import { InlineCTA, StickyMobileCTA } from "../components/ConversionCTA";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import PrintButton from "../components/PrintButton";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatINR } from "../lib/gstCalc";

const RETURN_TYPES = [
  { key: "gstr3b", label: "GSTR-3B", perDay: 50, max: 10000, nilPerDay: 20, nilMax: 500 },
  { key: "gstr1", label: "GSTR-1", perDay: 50, max: 10000, nilPerDay: 20, nilMax: 500 },
  { key: "gstr9", label: "GSTR-9 (Annual Return)", perDay: 200, max: null, nilPerDay: 200, nilMax: null },
  { key: "gstr4", label: "GSTR-4 (Composition)", perDay: 50, max: 2000, nilPerDay: 20, nilMax: 500 },
  { key: "cmp08", label: "CMP-08", perDay: 50, max: 5000, nilPerDay: 20, nilMax: 500 },
];

function daysBetween(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Late Fee Calculator",
  url: "https://gst.doaide.com/late-fee-calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the late fee for filing GSTR-3B after the due date?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "₹50/day (₹25 CGST + ₹25 SGST), max ₹10,000. For nil returns it is ₹20/day, max ₹500.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a cap on GST late fees?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GSTR-1/3B: ₹10,000 per return. Nil returns: ₹500. GSTR-9: ₹200/day, capped at 0.5% of state turnover.",
      },
    },
    {
      "@type": "Question",
      name: "What is the late fee for GSTR-9?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "₹200/day (₹100 CGST + ₹100 SGST), no fixed upper cap. Subject to 0.5% of annual state turnover.",
      },
    },
    {
      "@type": "Question",
      name: "Can late fees be waived by the government?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The government has issued amnesty schemes waiving or reducing late fees for delayed returns.",
      },
    },
  ],
};

export default function LateFeeCalculatorPage() {
  usePageTitle("GST Late Fee Calculator — Free Online | DoAide GST");

  const [returnType, setReturnType] = useState("gstr3b");
  const [isNil, setIsNil] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [filingDate, setFilingDate] = useState("");
  const [turnover, setTurnover] = useState("");

  const result = useMemo(() => {
    if (!dueDate || !filingDate) return null;
    const due = new Date(dueDate);
    const filed = new Date(filingDate);
    if (filed <= due) return { days: 0, lateFee: 0, cgst: 0, sgst: 0 };

    const days = daysBetween(due, filed);
    const rt = RETURN_TYPES.find((r) => r.key === returnType);
    const perDay = isNil ? rt.nilPerDay : rt.perDay;
    let rawFee = days * perDay;

    let cap = isNil ? rt.nilMax : rt.max;
    if (returnType === "gstr9" && turnover) {
      const turnoverCap = Math.round(parseFloat(turnover) * 0.005);
      cap = cap === null ? turnoverCap : Math.min(cap, turnoverCap);
    }
    if (cap !== null) rawFee = Math.min(rawFee, cap);

    const cgst = Math.round(rawFee / 2);
    const sgst = rawFee - cgst;
    return { days, lateFee: rawFee, cgst, sgst, perDay };
  }, [returnType, isNil, dueDate, filingDate, turnover]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Late Fee Calculator — Free Online | DoAide GST"
        description="Calculate GST late filing fees for GSTR-1, GSTR-3B, GSTR-9 and GSTR-4. Get CGST & SGST breakup with daily penalty, caps, and nil return rates."
        path="/late-fee-calculator"
        schemas={[TOOL_SCHEMA, FAQ_SCHEMA]}
      />
      <ToolsNav />
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Free Tools", to: "/resources" },
          { label: "Late Fee Calculator" },
        ]}
      />

      <main className="tool-main">
        <div className="tool-container">
          <h1 className="tool-title">GST Late Fee Calculator</h1>
          <p className="tool-subtitle">
            Calculate late filing fees for GSTR-3B, GSTR-1, GSTR-9, GSTR-4 &amp; CMP-08 returns
          </p>

          <div className="calc-card">
            <div className="calc-grid">
              <div className="field">
                <label>Return Type</label>
                <select value={returnType} onChange={(e) => setReturnType(e.target.value)}>
                  {RETURN_TYPES.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={isNil} onChange={(e) => setIsNil(e.target.checked)} />
                  Nil return (no tax liability)
                </label>
              </div>

              <div className="field">
                <label>Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div className="field">
                <label>Filing Date</label>
                <input type="date" value={filingDate} onChange={(e) => setFilingDate(e.target.value)} />
              </div>

              {returnType === "gstr9" && (
                <div className="field">
                  <label>Annual State Turnover (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 5000000"
                    value={turnover}
                    onChange={(e) => setTurnover(e.target.value)}
                  />
                  <small style={{ color: "var(--ink-soft)", fontSize: "0.75rem" }}>Used to calculate the 0.5% cap on GSTR-9 late fee</small>
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className="calc-card" style={{ marginTop: "1rem" }}>
              <h2 style={{ margin: "0 0 1rem" }}>Late Fee Calculation</h2>
              {result.days === 0 ? (
                <p style={{ color: "#34d399", fontWeight: 500, margin: 0 }}>Filed on time — no late fee applicable.</p>
              ) : (
                <>
                  <div className="calc-result-grid">
                    <div className="calc-result-row">
                      <span>Days Late</span>
                      <strong>{result.days} days</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>Rate per Day</span>
                      <strong>{formatINR(result.perDay)}</strong>
                    </div>
                    <div className="calc-result-row calc-result-highlight">
                      <span>Total Late Fee</span>
                      <strong>{formatINR(result.lateFee)}</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>CGST Late Fee</span>
                      <strong>{formatINR(result.cgst)}</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>SGST Late Fee</span>
                      <strong>{formatINR(result.sgst)}</strong>
                    </div>
                  </div>
                  <div className="calc-result-actions">
                    <PrintButton />
                    <ShareButtons title="GST Late Fee Calculator" url="https://gst.doaide.com/late-fee-calculator" />
                  </div>
                </>
              )}
            </div>
          )}

          <section className="tool-info">
            <h2>GST Late Fee Rates — Quick Reference</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Return</th>
                    <th>Regular (/day)</th>
                    <th>Max Cap</th>
                    <th>Nil (/day)</th>
                    <th>Nil Max</th>
                  </tr>
                </thead>
                <tbody>
                  {RETURN_TYPES.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{formatINR(r.perDay)}</td>
                      <td>{r.max ? formatINR(r.max) : "0.5% turnover"}</td>
                      <td>{formatINR(r.nilPerDay)}</td>
                      <td>{r.nilMax ? formatINR(r.nilMax) : "0.5% turnover"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <EmailCapture context="late-fee-calculator" />
          <InlineCTA variant="remind" />
          <RelatedTools
            current="/late-fee-calculator"
            tools={[
              { to: "/penalty-calculator", label: "Penalty Calculator" },
              { to: "/interest-calculator", label: "Interest Calculator" },
              { to: "/return-calendar", label: "Return Calendar" },
              { to: "/due-dates", label: "Due Dates" },
            ]}
          />
          <CrossProductLinks />
          <DoAideFooter />
          <StickyMobileCTA />
        </div>
      </main>
    </div>
  );
}
