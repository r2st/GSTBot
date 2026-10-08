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

const RCM_SERVICES = [
  { key: "legal", label: "Legal services — Advocate / Arbitral tribunal", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "gta_5", label: "GTA — Goods Transport Agency (5% RCM)", rate: 5, section: "Notification 13/2017", itcEligible: true },
  { key: "gta_12", label: "GTA — Forward charge (18%, no RCM)", rate: 0, section: "Forward charge opted", itcEligible: false, forward: true },
  { key: "sponsor", label: "Sponsorship services", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "director", label: "Director fees / Sitting fees", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "insurance_agent", label: "Insurance agent commission", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "recovery_agent", label: "Recovery agent services", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "author", label: "Author / Music composer / Photographer royalties", rate: 18, section: "Notification 13/2017", itcEligible: true },
  { key: "import_service", label: "Import of services", rate: 18, section: "Section 5(3) IGST Act", itcEligible: true },
  { key: "renting", label: "Renting residential property (by registered person)", rate: 18, section: "Notification 05/2022", itcEligible: false },
  { key: "security", label: "Security services (individual / HUF / firm)", rate: 18, section: "Notification 29/2018", itcEligible: true },
  { key: "unregistered", label: "Supply from unregistered person (specified categories)", rate: 18, section: "Section 9(4)", itcEligible: true },
  { key: "cement", label: "Cement received from unregistered manufacturer", rate: 18, section: "Notification 04/2019", itcEligible: true },
  { key: "raw_cotton", label: "Raw cotton from agriculturist", rate: 5, section: "Notification 43/2017", itcEligible: true },
  { key: "silk_yarn", label: "Silk yarn from agriculturist", rate: 5, section: "Notification 43/2017", itcEligible: true },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST RCM Calculator — Reverse Charge Mechanism",
  url: "https://gst.doaide.com/rcm-calculator",
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
      name: "How to calculate GST under Reverse Charge Mechanism?",
      acceptedAnswer: { "@type": "Answer", text: "GST under RCM is calculated on the taxable value at the applicable rate. Intra-state: CGST + SGST (half each). Interstate: full IGST. Must be paid in cash; the paid amount can be claimed as ITC later." },
    },
    {
      "@type": "Question",
      name: "Can ITC be claimed on RCM payments?",
      acceptedAnswer: { "@type": "Answer", text: "Yes, in most cases. RCM-paid GST can be claimed as ITC in the same month if you are GST-registered, use goods/services for business, and hold a valid invoice. One exclusion: residential rent — no ITC." },
    },
    {
      "@type": "Question",
      name: "How is RCM reported in GST returns?",
      acceptedAnswer: { "@type": "Answer", text: "GSTR-3B: report RCM liability in Table 3.1(d), claim ITC in 4(A)(2) for imports and 4(A)(3) for domestic RCM. GSTR-1: no reporting needed. Issue a self-invoice for Section 9(4) supplies." },
    },
    {
      "@type": "Question",
      name: "Is RCM applicable on all unregistered dealer purchases?",
      acceptedAnswer: { "@type": "Answer", text: "No. Section 9(4) RCM applies only to specified categories notified by the government, not all unregistered-dealer purchases. Main categories: certain agricultural products, cement, and specified professional services." },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "RCM Calculator" },
];

export default function RCMCalculatorPage() {
  usePageTitle("GST RCM Calculator — Reverse Charge Mechanism Tax Calculator");

  const [entries, setEntries] = useState([{ serviceType: "legal", amount: "", interstate: false }]);

  const addEntry = () => setEntries((prev) => [...prev, { serviceType: "legal", amount: "", interstate: false }]);
  const removeEntry = (i) => setEntries((prev) => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev);
  const updateEntry = (i, field, value) => setEntries((prev) => prev.map((e, j) => j === i ? { ...e, [field]: value } : e));

  const results = useMemo(() => {
    return entries.map((entry) => {
      const service = RCM_SERVICES.find((s) => s.key === entry.serviceType);
      if (!service) return null;
      const value = parseFloat(entry.amount);
      if (!Number.isFinite(value) || value <= 0) return null;
      if (service.forward) return { service, applicable: false, value };

      const gst = Math.round(value * service.rate) / 100;
      const cgst = entry.interstate ? 0 : Math.round((gst / 2) * 100) / 100;
      const sgst = entry.interstate ? 0 : Math.round((gst - cgst) * 100) / 100;
      const igst = entry.interstate ? gst : 0;

      return { service, applicable: true, value, gst, cgst, sgst, igst, rate: service.rate, itcEligible: service.itcEligible };
    });
  }, [entries]);

  const summary = useMemo(() => {
    let totalValue = 0, totalGST = 0, totalITC = 0;
    results.forEach((r) => {
      if (!r || !r.applicable) return;
      totalValue += r.value;
      totalGST += r.gst;
      if (r.itcEligible) totalITC += r.gst;
    });
    return { totalValue, totalGST, totalITC, netCost: Math.round((totalGST - totalITC) * 100) / 100 };
  }, [results]);

  const hasResults = results.some((r) => r && r.applicable);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST RCM Calculator — Reverse Charge Mechanism Tax Calculator"
        description="Calculate GST liability under Reverse Charge Mechanism for multiple services. Track ITC eligibility, CGST/SGST/IGST split, and net cost impact. Free, no login required."
        path="/rcm-calculator"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">RCM Calculator</h1>
          <p className="tool-subtitle">
            Calculate GST under Reverse Charge for multiple services. Track ITC eligibility and net cost. No sign-up required.
          </p>

          {entries.map((entry, i) => {
            const service = RCM_SERVICES.find((s) => s.key === entry.serviceType);
            const r = results[i];
            return (
              <div key={i} className="calc-card" style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink-soft)" }}>Entry #{i + 1}</span>
                  {entries.length > 1 && (
                    <button onClick={() => removeEntry(i)} style={{ background: "none", border: "none", color: "#f87171", fontSize: "0.85rem", cursor: "pointer" }}>Remove</button>
                  )}
                </div>

                <label className="calc-label">
                  Service / Supply Type
                  <select className="calc-select" value={entry.serviceType} onChange={(e) => updateEntry(i, "serviceType", e.target.value)}>
                    {RCM_SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>

                <label className="calc-label">
                  Taxable Value (₹)
                  <input
                    type="number"
                    className="calc-input"
                    value={entry.amount}
                    onChange={(e) => updateEntry(i, "amount", e.target.value)}
                    placeholder="Enter taxable value"
                    min="0"
                    inputMode="decimal"
                  />
                </label>

                <label className="calc-checkbox-label">
                  <input type="checkbox" checked={entry.interstate} onChange={(e) => updateEntry(i, "interstate", e.target.checked)} />
                  Interstate supply (IGST)
                </label>

                {r && !r.applicable && (
                  <div style={{ padding: "0.75rem", background: "rgba(52,211,153,0.08)", borderRadius: "0.5rem", fontSize: "0.9rem" }}>
                    <strong style={{ color: "#34d399" }}>No RCM</strong> — {service?.section}
                  </div>
                )}

                {r && r.applicable && (
                  <div style={{ padding: "0.75rem", background: "var(--surface-2, #1a1a2e)", borderRadius: "0.5rem", marginTop: "0.5rem" }}>
                    <div className="calc-result-row"><span>GST @ {r.rate}%</span><strong>{formatINR(r.gst)}</strong></div>
                    {r.igst > 0 ? (
                      <div className="calc-result-row"><span>IGST</span><strong>{formatINR(r.igst)}</strong></div>
                    ) : (
                      <>
                        <div className="calc-result-row"><span>CGST @ {r.rate / 2}%</span><strong>{formatINR(r.cgst)}</strong></div>
                        <div className="calc-result-row"><span>SGST @ {r.rate / 2}%</span><strong>{formatINR(r.sgst)}</strong></div>
                      </>
                    )}
                    <div className="calc-result-row" style={{ color: r.itcEligible ? "#34d399" : "#f87171" }}>
                      <span>ITC</span>
                      <strong>{r.itcEligible ? `Claimable: ${formatINR(r.gst)}` : "Not eligible"}</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={addEntry} style={{ background: "none", border: "1px dashed var(--ink-soft)", borderRadius: "0.5rem", padding: "0.75rem", width: "100%", color: "var(--ink-soft)", cursor: "pointer", marginBottom: "1.5rem" }}>
            + Add Another Service
          </button>

          {hasResults && (
            <div className="calc-card" style={{ background: "var(--surface-2, #1a1a2e)" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Summary</h3>
              <div className="calc-result-row"><span>Total Taxable Value</span><strong>{formatINR(summary.totalValue)}</strong></div>
              <div className="calc-result-row calc-total"><span>Total RCM Liability</span><strong style={{ color: "#f59e42" }}>{formatINR(summary.totalGST)}</strong></div>
              <div className="calc-result-row"><span>Total ITC Claimable</span><strong style={{ color: "#34d399" }}>{formatINR(summary.totalITC)}</strong></div>
              <div className="calc-result-row calc-total"><span>Net Cash Cost</span><strong>{formatINR(summary.netCost)}</strong></div>

              <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(59,130,246,0.08)", borderRadius: "0.5rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
                <strong>GSTR-3B Reporting:</strong>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                  <li>Table 3.1(d): Report RCM liability of {formatINR(summary.totalGST)}</li>
                  <li>Table 4(A)(3): Claim ITC of {formatINR(summary.totalITC)}</li>
                  <li>RCM must be paid in cash — cannot offset with existing ITC</li>
                </ul>
              </div>

              <div className="calc-result-actions">
                <PrintButton />
                <ShareButtons
                  path="/rcm-calculator"
                  text={`RCM Liability: ${formatINR(summary.totalGST)}, ITC: ${formatINR(summary.totalITC)} — calculated free on DoAide GST`}
                />
              </div>
            </div>
          )}

          <EmailCapture
            source="rcm-calculator"
            heading="Stay updated on RCM changes"
            subtext="Get notified when reverse charge rules are updated — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>GST Reverse Charge Mechanism — Complete Guide</h2>
            <p>
              Under the Reverse Charge Mechanism (RCM), the recipient of goods or services pays GST
              instead of the supplier. This applies to specified categories under Section 9(3) and
              Section 9(4) of the CGST Act, 2017.
            </p>
            <h3>Key RCM Concepts</h3>
            <ul>
              <li><strong>Section 9(3):</strong> Government-notified services where the recipient always pays — legal, GTA, directors, sponsors, etc.</li>
              <li><strong>Section 9(4):</strong> Purchases from unregistered persons in specified categories</li>
              <li><strong>Cash payment only:</strong> RCM liability must be paid in cash; existing ITC balance cannot be used</li>
              <li><strong>ITC claimable:</strong> In most cases, the RCM payment qualifies for ITC in the same month</li>
              <li><strong>Self-invoice:</strong> Required for Section 9(4) supplies from unregistered persons</li>
            </ul>
            <h3>Filing Requirements</h3>
            <ul>
              <li><strong>GSTR-3B Table 3.1(d):</strong> Report RCM output liability</li>
              <li><strong>GSTR-3B Table 4(A)(2):</strong> ITC on import of services</li>
              <li><strong>GSTR-3B Table 4(A)(3):</strong> ITC on domestic RCM</li>
              <li><strong>GSTR-1:</strong> No reporting needed (you are the recipient)</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>How to calculate GST under Reverse Charge Mechanism?</h3>
            <p>Calculate RCM by applying the applicable GST rate to the taxable value. For intra-state: split equally into CGST + SGST. For inter-state: charge full IGST. The recipient pays in cash and can claim ITC in most cases.</p>

            <h3>Can ITC be claimed on RCM payments?</h3>
            <p>Yes, in most cases. Exception: renting residential property for personal use — no ITC available. For all other notified services, ITC can be claimed in the same return period with a valid invoice.</p>

            <h3>How is RCM reported in GST returns?</h3>
            <p>GSTR-3B: Table 3.1(d) for liability, Table 4(A)(2) for import ITC, Table 4(A)(3) for domestic RCM ITC. A self-invoice is needed for Section 9(4) supplies.</p>

            <h3>Do composition dealers need to pay RCM?</h3>
            <p>Yes, composition dealers must pay RCM on applicable services but cannot claim ITC on such payments since composition dealers are not eligible for ITC.</p>
          </section>

          <InlineCTA variant="save" />
          <RelatedTools current="/rcm-calculator" />
          <CrossProductLinks page="rcm-calculator" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
    </div>
  );
}
