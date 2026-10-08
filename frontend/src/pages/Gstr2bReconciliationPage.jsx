import { useCallback, useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import { InlineCTA, StickyMobileCTA } from "../components/ConversionCTA";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import ExitIntentPopup from "../components/ExitIntentPopup";
import RelatedTools from "../components/RelatedTools";
import SaveResultsCTA from "../components/SaveResultsCTA";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatINR } from "../lib/gstCalc";

const SAMPLE_PURCHASE = [
  { gstin: "29AABCU9603R1ZM", invoiceNo: "INV-2026-001", date: "2026-09-05", taxable: 50000, igst: 0, cgst: 4500, sgst: 4500 },
  { gstin: "27AADCB2230M1ZT", invoiceNo: "INV-2026-045", date: "2026-09-12", taxable: 120000, igst: 21600, cgst: 0, sgst: 0 },
  { gstin: "07AAACP1936Q1ZS", invoiceNo: "INV-2026-078", date: "2026-09-18", taxable: 35000, igst: 0, cgst: 2100, sgst: 2100 },
  { gstin: "33AABCS1429B1ZT", invoiceNo: "INV-2026-112", date: "2026-09-25", taxable: 80000, igst: 14400, cgst: 0, sgst: 0 },
  { gstin: "29AABCU9603R1ZM", invoiceNo: "INV-2026-002", date: "2026-09-28", taxable: 25000, igst: 0, cgst: 2250, sgst: 2250 },
];

const SAMPLE_GSTR2B = [
  { gstin: "29AABCU9603R1ZM", invoiceNo: "INV-2026-001", date: "2026-09-05", taxable: 50000, igst: 0, cgst: 4500, sgst: 4500 },
  { gstin: "27AADCB2230M1ZT", invoiceNo: "INV-2026-045", date: "2026-09-12", taxable: 120000, igst: 21600, cgst: 0, sgst: 0 },
  { gstin: "07AAACP1936Q1ZS", invoiceNo: "INV-2026-078", date: "2026-09-18", taxable: 35000, igst: 0, cgst: 3150, sgst: 3150 },
  { gstin: "06AABCT1332L1ZI", invoiceNo: "INV-2026-200", date: "2026-09-20", taxable: 45000, igst: 0, cgst: 4050, sgst: 4050 },
];

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return {
      gstin: row.gstin || row.supplier_gstin || "",
      invoiceNo: row.invoice_no || row.invoiceno || row.invoice || "",
      date: row.date || row.invoice_date || "",
      taxable: parseFloat(row.taxable || row.taxable_value || "0") || 0,
      igst: parseFloat(row.igst || "0") || 0,
      cgst: parseFloat(row.cgst || "0") || 0,
      sgst: parseFloat(row.sgst || "0") || 0,
    };
  });
}

function invoiceTax(inv) {
  return Math.round((inv.igst + inv.cgst + inv.sgst) * 100) / 100;
}

function matchKey(inv) {
  return `${inv.gstin.toUpperCase().replace(/\s/g, "")}|${inv.invoiceNo.toUpperCase().replace(/\s/g, "")}`;
}

function reconcile(purchaseData, gstr2bData) {
  const purchaseMap = new Map();
  purchaseData.forEach((inv) => {
    const key = matchKey(inv);
    purchaseMap.set(key, inv);
  });

  const gstr2bMap = new Map();
  gstr2bData.forEach((inv) => {
    const key = matchKey(inv);
    gstr2bMap.set(key, inv);
  });

  const matched = [];
  const mismatched = [];
  const onlyInPurchase = [];
  const onlyInGstr2b = [];

  for (const [key, pInv] of purchaseMap) {
    const gInv = gstr2bMap.get(key);
    if (!gInv) {
      onlyInPurchase.push(pInv);
    } else {
      const pTax = invoiceTax(pInv);
      const gTax = invoiceTax(gInv);
      if (Math.abs(pTax - gTax) < 0.01) {
        matched.push({ purchase: pInv, gstr2b: gInv });
      } else {
        mismatched.push({ purchase: pInv, gstr2b: gInv, diff: Math.round((pTax - gTax) * 100) / 100 });
      }
    }
  }

  for (const [key, gInv] of gstr2bMap) {
    if (!purchaseMap.has(key)) {
      onlyInGstr2b.push(gInv);
    }
  }

  const itcAtRisk = onlyInPurchase.reduce((s, inv) => s + invoiceTax(inv), 0)
    + mismatched.filter((m) => m.diff > 0).reduce((s, m) => s + m.diff, 0);

  return {
    matched,
    mismatched,
    onlyInPurchase,
    onlyInGstr2b,
    itcAtRisk: Math.round(itcAtRisk * 100) / 100,
    totalPurchaseItc: Math.round(purchaseData.reduce((s, inv) => s + invoiceTax(inv), 0) * 100) / 100,
    totalGstr2bItc: Math.round(gstr2bData.reduce((s, inv) => s + invoiceTax(inv), 0) * 100) / 100,
  };
}

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GSTR-2B Reconciliation Helper",
  url: "https://gst.doaide.com/gstr2b-reconciliation",
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
      name: "What is GSTR-2B reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GSTR-2B reconciliation is matching your purchase register invoices with GSTR-2B data to find matched, mismatched, and missing invoices. This ensures ITC claimed matches what's available in GSTR-2B.",
      },
    },
    {
      "@type": "Question",
      name: "Why is GSTR-2B reconciliation important?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Under Section 16(2)(aa), ITC can only be claimed on invoices appearing in GSTR-2B. Claiming ITC on invoices not in GSTR-2B can lead to interest at 18% and penalties. Regular reconciliation prevents such issues.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between GSTR-2A and GSTR-2B?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GSTR-2A is dynamic and updates in real time as suppliers file returns. GSTR-2B is a static monthly statement generated on the 14th, and is the authoritative document for ITC eligibility.",
      },
    },
    {
      "@type": "Question",
      name: "What is ITC at risk in reconciliation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ITC at risk is the credit amount you have claimed in your books but which does not appear or has a different amount in GSTR-2B. This ITC may be disallowed during assessment.",
      },
    },
    {
      "@type": "Question",
      name: "How often should I reconcile GSTR-2B?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Reconcile monthly before filing GSTR-3B. This allows time to follow up with suppliers for missing invoices and correct any discrepancies before claiming ITC.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Free Tools", url: "https://gst.doaide.com/resources" },
  { name: "GSTR-2B Reconciliation" },
];

export default function Gstr2bReconciliationPage() {
  usePageTitle("GSTR-2B Reconciliation Helper — Free Online Tool | DoAide GST");

  const [purchaseText, setPurchaseText] = useState("");
  const [gstr2bText, setGstr2bText] = useState("");
  const [purchaseData, setPurchaseData] = useState([]);
  const [gstr2bData, setGstr2bData] = useState([]);
  const [tab, setTab] = useState("all");

  const loadSample = useCallback(() => {
    setPurchaseData(SAMPLE_PURCHASE);
    setGstr2bData(SAMPLE_GSTR2B);
    setPurchaseText("");
    setGstr2bText("");
  }, []);

  const parsePurchase = useCallback(() => {
    if (purchaseText.trim()) setPurchaseData(parseCSV(purchaseText));
  }, [purchaseText]);

  const parseGstr2b = useCallback(() => {
    if (gstr2bText.trim()) setGstr2bData(parseCSV(gstr2bText));
  }, [gstr2bText]);

  const result = useMemo(() => {
    if (purchaseData.length === 0 && gstr2bData.length === 0) return null;
    return reconcile(purchaseData, gstr2bData);
  }, [purchaseData, gstr2bData]);

  const resultSummary = result
    ? `GSTR-2B Reconciliation: ${result.matched.length} matched, ${result.mismatched.length} mismatched, ${result.onlyInPurchase.length} missing in 2B, ITC at risk ${formatINR(result.itcAtRisk)}`
    : null;

  return (
    <div className="tool-page">
      <SeoHead
        title="GSTR-2B Reconciliation Helper — Free Online Tool | DoAide GST"
        description="Reconcile your purchase register with GSTR-2B data instantly. Find matched, mismatched, and missing invoices. Calculate ITC at risk. Free, no login required."
        path="/gstr2b-reconciliation"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GSTR-2B Reconciliation Helper</h1>
          <p className="tool-subtitle">
            Match your purchase register with GSTR-2B to find mismatches, missing invoices, and ITC at risk. No sign-up required.
          </p>

          <div className="calc-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)", margin: 0 }}>
                Paste CSV data or load sample data to see how reconciliation works.
              </p>
              <button onClick={loadSample} className="btn btn-ghost btn-sm">
                Load Sample Data
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="calc-label">
                  Purchase Register (CSV)
                  <textarea
                    className="calc-input"
                    rows="6"
                    value={purchaseText}
                    onChange={(e) => setPurchaseText(e.target.value)}
                    onBlur={parsePurchase}
                    placeholder={"gstin,invoice_no,date,taxable,igst,cgst,sgst\n29AABCU9603R1ZM,INV-001,2026-09-05,50000,0,4500,4500"}
                    style={{ fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }}
                  />
                </label>
                {purchaseData.length > 0 && (
                  <p style={{ fontSize: "0.8rem", color: "#34d399", margin: "0.25rem 0 0" }}>
                    {purchaseData.length} invoice{purchaseData.length !== 1 ? "s" : ""} loaded
                  </p>
                )}
              </div>
              <div>
                <label className="calc-label">
                  GSTR-2B Data (CSV)
                  <textarea
                    className="calc-input"
                    rows="6"
                    value={gstr2bText}
                    onChange={(e) => setGstr2bText(e.target.value)}
                    onBlur={parseGstr2b}
                    placeholder={"gstin,invoice_no,date,taxable,igst,cgst,sgst\n29AABCU9603R1ZM,INV-001,2026-09-05,50000,0,4500,4500"}
                    style={{ fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }}
                  />
                </label>
                {gstr2bData.length > 0 && (
                  <p style={{ fontSize: "0.8rem", color: "#34d399", margin: "0.25rem 0 0" }}>
                    {gstr2bData.length} invoice{gstr2bData.length !== 1 ? "s" : ""} loaded
                  </p>
                )}
              </div>
            </div>
          </div>

          {result && (
            <div className="calc-card" style={{ marginTop: "1rem" }}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Reconciliation Results</h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--bg-card)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#34d399" }}>{result.matched.length}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Matched</div>
                </div>
                <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--bg-card)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f59e42" }}>{result.mismatched.length}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Mismatched</div>
                </div>
                <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--bg-card)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f87171" }}>{result.onlyInPurchase.length}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Missing in 2B</div>
                </div>
                <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--bg-card)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#60a5fa" }}>{result.onlyInGstr2b.length}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Only in 2B</div>
                </div>
              </div>

              <div className="calc-result-row">
                <span>Total ITC in Purchase Register</span>
                <strong>{formatINR(result.totalPurchaseItc)}</strong>
              </div>
              <div className="calc-result-row">
                <span>Total ITC in GSTR-2B</span>
                <strong>{formatINR(result.totalGstr2bItc)}</strong>
              </div>
              <div className="calc-result-row calc-result-highlight" style={{ color: result.itcAtRisk > 0 ? "#f87171" : "#34d399" }}>
                <span>ITC at Risk</span>
                <strong>{formatINR(result.itcAtRisk)}</strong>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0", flexWrap: "wrap" }}>
                {["all", "matched", "mismatched", "missing", "extra"].map((t) => (
                  <button
                    key={t}
                    className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "all" ? "All" : t === "matched" ? `Matched (${result.matched.length})` : t === "mismatched" ? `Mismatched (${result.mismatched.length})` : t === "missing" ? `Missing in 2B (${result.onlyInPurchase.length})` : `Only in 2B (${result.onlyInGstr2b.length})`}
                  </button>
                ))}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>GSTIN</th>
                      <th>Invoice No.</th>
                      <th>Purchase ITC</th>
                      <th>GSTR-2B ITC</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "all" || tab === "matched") && result.matched.map((m, i) => (
                      <tr key={`m-${i}`}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{m.purchase.gstin}</td>
                        <td>{m.purchase.invoiceNo}</td>
                        <td>{formatINR(invoiceTax(m.purchase))}</td>
                        <td>{formatINR(invoiceTax(m.gstr2b))}</td>
                        <td style={{ color: "#34d399", fontWeight: 600 }}>Matched</td>
                      </tr>
                    ))}
                    {(tab === "all" || tab === "mismatched") && result.mismatched.map((m, i) => (
                      <tr key={`mm-${i}`}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{m.purchase.gstin}</td>
                        <td>{m.purchase.invoiceNo}</td>
                        <td>{formatINR(invoiceTax(m.purchase))}</td>
                        <td>{formatINR(invoiceTax(m.gstr2b))}</td>
                        <td style={{ color: "#f59e42", fontWeight: 600 }}>Mismatch ({m.diff > 0 ? "+" : ""}{formatINR(m.diff)})</td>
                      </tr>
                    ))}
                    {(tab === "all" || tab === "missing") && result.onlyInPurchase.map((inv, i) => (
                      <tr key={`op-${i}`}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{inv.gstin}</td>
                        <td>{inv.invoiceNo}</td>
                        <td>{formatINR(invoiceTax(inv))}</td>
                        <td>—</td>
                        <td style={{ color: "#f87171", fontWeight: 600 }}>Missing in 2B</td>
                      </tr>
                    ))}
                    {(tab === "all" || tab === "extra") && result.onlyInGstr2b.map((inv, i) => (
                      <tr key={`og-${i}`}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{inv.gstin}</td>
                        <td>{inv.invoiceNo}</td>
                        <td>—</td>
                        <td>{formatINR(invoiceTax(inv))}</td>
                        <td style={{ color: "#60a5fa", fontWeight: 600 }}>Only in 2B</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.itcAtRisk > 0 && (
                <div style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid rgba(248, 113, 113, 0.3)", borderRadius: "8px", padding: "1rem", margin: "1rem 0" }}>
                  <strong style={{ color: "#f87171" }}>Action Required</strong>
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
                    <li>Follow up with suppliers for {result.onlyInPurchase.length} invoice{result.onlyInPurchase.length !== 1 ? "s" : ""} missing from GSTR-2B</li>
                    {result.mismatched.length > 0 && <li>Verify amounts with suppliers for {result.mismatched.length} mismatched invoice{result.mismatched.length !== 1 ? "s" : ""}</li>}
                    <li>Do not claim {formatINR(result.itcAtRisk)} until invoices appear in GSTR-2B</li>
                  </ul>
                </div>
              )}

              {result.onlyInGstr2b.length > 0 && (
                <div style={{ background: "rgba(96, 165, 250, 0.1)", border: "1px solid rgba(96, 165, 250, 0.3)", borderRadius: "8px", padding: "1rem", margin: "1rem 0" }}>
                  <strong style={{ color: "#60a5fa" }}>Unclaimed ITC Available</strong>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
                    {result.onlyInGstr2b.length} invoice{result.onlyInGstr2b.length !== 1 ? "s" : ""} ({formatINR(result.onlyInGstr2b.reduce((s, inv) => s + invoiceTax(inv), 0))}) appear in GSTR-2B but are not in your purchase register. Book these purchases to claim the ITC.
                  </p>
                </div>
              )}

              <div className="calc-result-actions">
                <ShareButtons
                  path="/gstr2b-reconciliation"
                  text={resultSummary}
                />
              </div>
            </div>
          )}

          <SaveResultsCTA resultSummary={resultSummary} />
          <EmailCapture
            source="gstr2b-reconciliation"
            heading="Automate GSTR-2B reconciliation"
            subtext="Upload your GSTR-2B and get automatic mismatch reports every month — free for 50 invoices."
            buttonLabel="Get Started Free"
            compact
          />
          <InlineCTA variant="invoice" />

          <section className="tool-info">
            <h2>How GSTR-2B Reconciliation Works</h2>
            <p>
              GSTR-2B reconciliation compares your purchase register (books of accounts) with the
              auto-generated GSTR-2B statement from the GST portal. The tool matches invoices
              by supplier GSTIN and invoice number, then classifies each as matched, mismatched,
              or missing.
            </p>
            <h3>Step-by-Step Process</h3>
            <ol>
              <li><strong>Prepare your data:</strong> Export your purchase register and download GSTR-2B from the GST portal</li>
              <li><strong>Paste CSV data:</strong> Enter both datasets in the tool (or load sample data to try it)</li>
              <li><strong>Review results:</strong> The tool matches invoices by GSTIN + invoice number</li>
              <li><strong>Take action:</strong> Follow up on missing and mismatched invoices before filing GSTR-3B</li>
            </ol>
            <h3>Types of Results</h3>
            <ul>
              <li><strong>Matched:</strong> Invoice found in both registers with same ITC amount — safe to claim</li>
              <li><strong>Mismatched:</strong> Invoice found in both but amounts differ — verify with supplier</li>
              <li><strong>Missing in GSTR-2B:</strong> Invoice in your books but not in GSTR-2B — ITC at risk, follow up with supplier</li>
              <li><strong>Only in GSTR-2B:</strong> Invoice in GSTR-2B but not in your books — potential unclaimed ITC</li>
            </ul>
            <h3>CSV Format</h3>
            <p>
              The tool accepts CSV with these columns: <code>gstin, invoice_no, date, taxable, igst, cgst, sgst</code>.
              Headers are case-insensitive. You can also use <code>supplier_gstin</code> and <code>taxable_value</code> as column names.
            </p>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>What is GSTR-2B reconciliation?</h3>
            <p>
              GSTR-2B reconciliation is the process of matching your purchase register invoices
              with the auto-generated GSTR-2B statement. This ensures the ITC you claim in
              GSTR-3B matches what is available per GSTR-2B.
            </p>

            <h3>Why is GSTR-2B reconciliation important?</h3>
            <p>
              Under Section 16(2)(aa), ITC can only be claimed on invoices appearing in GSTR-2B.
              Claiming ITC on missing invoices can attract interest at 18% p.a. and penalties
              under Section 73/74.
            </p>

            <h3>What is the difference between GSTR-2A and GSTR-2B?</h3>
            <p>
              GSTR-2A is dynamic — it changes in real-time as suppliers file returns. GSTR-2B
              is a static monthly statement generated on the 14th of each month and is the
              authoritative document for determining ITC eligibility.
            </p>

            <h3>What is ITC at risk?</h3>
            <p>
              ITC at risk is the credit claimed in your books that does not appear (or has a
              different amount) in GSTR-2B. This amount may be disallowed during assessment
              and could attract interest and penalties.
            </p>

            <h3>How often should I reconcile GSTR-2B?</h3>
            <p>
              Reconcile monthly, before filing GSTR-3B. GSTR-2B is generated on the 14th,
              giving you time to review mismatches and follow up with suppliers before the
              GSTR-3B due date (usually the 20th).
            </p>

            <h3>What should I do about missing invoices?</h3>
            <p>
              Contact the supplier immediately and request them to file/amend their GSTR-1
              for the relevant period. Until the invoice appears in GSTR-2B, do not claim
              the ITC in your GSTR-3B.
            </p>

            <h3>Is this tool safe for my data?</h3>
            <p>
              Yes. All reconciliation happens in your browser. No data is sent to any server.
              Your purchase register and GSTR-2B data never leave your device.
            </p>
          </section>

          <RelatedTools current="/gstr2b-reconciliation" />
          <CrossProductLinks page="gstr2b-reconciliation" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
      <ExitIntentPopup />
    </div>
  );
}

export { reconcile, parseCSV, invoiceTax, matchKey };
