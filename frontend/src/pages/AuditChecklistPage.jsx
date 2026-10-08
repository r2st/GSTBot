import { useCallback, useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import PrintButton from "../components/PrintButton";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";

const CHECKLIST = [
  {
    category: "Registration & Basic Records",
    items: [
      { id: "reg1", text: "GST registration certificate (Form REG-06) verified and up to date" },
      { id: "reg2", text: "All amendments to registration reflected correctly" },
      { id: "reg3", text: "Additional places of business added/updated in registration" },
      { id: "reg4", text: "GSTIN displayed at all places of business" },
    ],
  },
  {
    category: "Outward Supply — GSTR-1 Reconciliation",
    items: [
      { id: "out1", text: "GSTR-1 reconciled with books of accounts for all tax periods" },
      { id: "out2", text: "B2B invoices verified — correct GSTIN, HSN/SAC, tax amount" },
      { id: "out3", text: "B2C supplies correctly reported (state-wise for inter-state > ₹2.5L)" },
      { id: "out4", text: "Credit/debit notes properly linked and reported" },
      { id: "out5", text: "Export invoices with correct LUT/bond details" },
      { id: "out6", text: "Advances received properly reported and adjusted" },
      { id: "out7", text: "E-invoicing compliance (mandatory for turnover > ₹5 crore)" },
    ],
  },
  {
    category: "Inward Supply — GSTR-2B Reconciliation",
    items: [
      { id: "in1", text: "GSTR-2B auto-populated data reconciled with purchase register" },
      { id: "in2", text: "Mismatch report generated and discrepancies resolved" },
      { id: "in3", text: "ITC on invoices not appearing in GSTR-2B identified" },
      { id: "in4", text: "Supplier compliance verified for major ITC claims" },
    ],
  },
  {
    category: "Input Tax Credit (ITC) Verification",
    items: [
      { id: "itc1", text: "ITC claimed only on invoices appearing in GSTR-2B" },
      { id: "itc2", text: "ITC reversal under Rule 42/43 (common credit) calculated correctly" },
      { id: "itc3", text: "Blocked credits under Section 17(5) not claimed (motor vehicles, food, personal use)" },
      { id: "itc4", text: "ITC reversed for non-payment within 180 days (proviso to Section 16(2))" },
      { id: "itc5", text: "Capital goods ITC properly tracked and proportioned" },
      { id: "itc6", text: "ITC on construction of immovable property not claimed" },
      { id: "itc7", text: "Time limit for ITC claim verified — Section 16(4) deadline met" },
    ],
  },
  {
    category: "Tax Payment & Returns",
    items: [
      { id: "pay1", text: "GSTR-3B filed for all months/quarters — no pending returns" },
      { id: "pay2", text: "GSTR-1 and GSTR-3B reconciled — no discrepancies" },
      { id: "pay3", text: "Interest on delayed payment calculated and paid (Section 50)" },
      { id: "pay4", text: "Late fees on delayed returns paid" },
      { id: "pay5", text: "Annual return GSTR-9 filed correctly" },
      { id: "pay6", text: "Reconciliation statement GSTR-9C prepared (if turnover > ₹5 crore)" },
    ],
  },
  {
    category: "Reverse Charge Mechanism (RCM)",
    items: [
      { id: "rcm1", text: "All RCM-applicable services identified and tax paid" },
      { id: "rcm2", text: "Self-invoices issued for unregistered supplier purchases" },
      { id: "rcm3", text: "RCM liability correctly reported in GSTR-3B Table 3.1(d)" },
      { id: "rcm4", text: "ITC on RCM claimed correctly in Table 4(A)(3)" },
    ],
  },
  {
    category: "HSN/SAC & Valuation",
    items: [
      { id: "hsn1", text: "Correct HSN/SAC codes used on all invoices" },
      { id: "hsn2", text: "HSN-wise summary in GSTR-1 matches books" },
      { id: "hsn3", text: "Valuation rules applied correctly (related party transactions, discounts)" },
      { id: "hsn4", text: "Tax rates verified against current HSN/SAC rate schedule" },
    ],
  },
  {
    category: "E-Way Bill Compliance",
    items: [
      { id: "eway1", text: "E-way bills generated for all movements > ₹50,000" },
      { id: "eway2", text: "Part-B updated before movement of goods" },
      { id: "eway3", text: "E-way bills not expired during transit" },
      { id: "eway4", text: "E-way bill details match with invoice and delivery challan" },
    ],
  },
  {
    category: "Specific Verifications",
    items: [
      { id: "spec1", text: "TDS/TCS under GST correctly applied and reported (Sections 51/52)" },
      { id: "spec2", text: "Place of supply determined correctly for service supplies" },
      { id: "spec3", text: "Zero-rated supplies with proper LUT/refund claims" },
      { id: "spec4", text: "Job work — Section 143 compliance and tracking" },
      { id: "spec5", text: "No duplicate ITC claims across GSTR-2B periods" },
    ],
  },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Audit Checklist",
  url: "https://gst.doaide.com/audit-checklist",
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
      name: "Who needs a GST audit?",
      acceptedAnswer: { "@type": "Answer", text: "Taxpayers with aggregate annual turnover exceeding ₹5 crore must get accounts audited by a CA or Cost Accountant and file GSTR-9C with GSTR-9. Deadline is December 31 of the following year." },
    },
    {
      "@type": "Question",
      name: "What is GSTR-9C?",
      acceptedAnswer: { "@type": "Answer", text: "GSTR-9C reconciles annual return (GSTR-9) values with audited financial statements. Since FY 2020-21, it must be self-certified by the taxpayer and filed with GSTR-9." },
    },
    {
      "@type": "Question",
      name: "What is the penalty for not getting GST audit done?",
      acceptedAnswer: { "@type": "Answer", text: "Failure to file GSTR-9C on time attracts a late fee of ₹200 per day (₹100 CGST + ₹100 SGST) subject to a maximum of 0.5% of turnover. Additionally, a general penalty under Section 125 of up to ₹25,000 may apply." },
    },
    {
      "@type": "Question",
      name: "What documents are needed for GST audit?",
      acceptedAnswer: { "@type": "Answer", text: "Key documents: GST returns (GSTR-1, 3B, 9), books of accounts, purchase/sales registers, ITC register, e-way bills, credit/debit notes, bank statements, and stock register." },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "GST Audit Checklist" },
];

export default function AuditChecklistPage() {
  usePageTitle("GST Audit Checklist — Complete Compliance Checklist for Businesses");

  const [checked, setChecked] = useState({});

  const toggle = useCallback((id) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const totalItems = CHECKLIST.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progress = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  const categoryProgress = useMemo(() => {
    return CHECKLIST.map((cat) => {
      const done = cat.items.filter((item) => checked[item.id]).length;
      return { done, total: cat.items.length, pct: Math.round((done / cat.items.length) * 100) };
    });
  }, [checked]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Audit Checklist — Complete Compliance Checklist for Businesses"
        description="Interactive GST audit checklist for businesses with turnover above ₹5 crore. Track GSTR-9C compliance, ITC verification, RCM, HSN codes, and more. Free, no login required."
        path="/audit-checklist"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST Audit Checklist</h1>
          <p className="tool-subtitle">
            Interactive compliance checklist for GST audit (GSTR-9C). Track your audit readiness. No sign-up required.
          </p>

          <div className="calc-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1rem", fontWeight: 600 }}>
                {checkedCount} / {totalItems} items completed
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: progress === 100 ? "#34d399" : progress > 50 ? "#f59e42" : "var(--ink)" }}>
                {progress}%
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "var(--surface-3, #252540)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 5, width: `${progress}%`, background: progress === 100 ? "#34d399" : progress > 50 ? "#f59e42" : "#3b82f6", transition: "width 0.3s ease" }} />
            </div>
            {progress === 100 && (
              <p style={{ marginTop: "0.75rem", color: "#34d399", fontWeight: 500 }}>
                All items checked — your GST audit preparation is complete!
              </p>
            )}
          </div>

          {CHECKLIST.map((cat, ci) => {
            const cp = categoryProgress[ci];
            return (
              <div key={cat.category} className="calc-card" style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{cat.category}</h2>
                  <span style={{ fontSize: "0.8rem", fontWeight: 500, color: cp.pct === 100 ? "#34d399" : "var(--ink-soft)", background: "var(--surface-3, #252540)", padding: "2px 8px", borderRadius: "4px" }}>
                    {cp.done}/{cp.total}
                  </span>
                </div>
                {cat.items.map((item) => (
                  <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.6rem 0", borderBottom: "1px solid var(--surface-3, #252540)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggle(item.id)}
                      style={{ marginTop: 3, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: "0.9rem", lineHeight: 1.5, textDecoration: checked[item.id] ? "line-through" : "none", color: checked[item.id] ? "var(--ink-soft)" : "var(--ink)" }}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            );
          })}

          <div className="calc-card" style={{ marginTop: "1.5rem" }}>
            <div className="calc-result-actions">
              <PrintButton />
              <ShareButtons
                path="/audit-checklist"
                text={`GST Audit Checklist: ${checkedCount}/${totalItems} completed (${progress}%) — track your audit on DoAide GST`}
              />
            </div>
          </div>

          <EmailCapture
            source="audit-checklist"
            heading="Get notified about GST audit deadlines"
            subtext="Receive reminders before GSTR-9 and GSTR-9C due dates — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>GST Audit — Who Needs It?</h2>
            <p>
              Every registered taxpayer with aggregate annual turnover exceeding ₹5 crore is required
              to file a reconciliation statement in Form GSTR-9C along with the annual return GSTR-9.
              From FY 2020-21, GSTR-9C is self-certified by the taxpayer (no CA certification needed).
            </p>
            <h3>Key Deadlines</h3>
            <ul>
              <li><strong>GSTR-9:</strong> Annual return — due by December 31 of the following FY</li>
              <li><strong>GSTR-9C:</strong> Reconciliation statement — filed along with GSTR-9</li>
              <li><strong>Penalty:</strong> ₹200/day late fee (max 0.5% of turnover) + ₹25,000 general penalty</li>
            </ul>
            <h3>Audit Scope</h3>
            <ul>
              <li>Reconciliation of GSTR-1, GSTR-3B with audited financial statements</li>
              <li>ITC verification — proper availing and reversal</li>
              <li>HSN/SAC classification correctness</li>
              <li>RCM compliance and self-invoicing</li>
              <li>E-way bill compliance</li>
              <li>Interest and late fee computation</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>Who needs a GST audit?</h3>
            <p>
              Every registered taxpayer with aggregate annual turnover exceeding ₹5 crore must file
              GSTR-9C (reconciliation statement) along with GSTR-9 (annual return). The deadline
              is December 31 of the following financial year.
            </p>

            <h3>What is GSTR-9C?</h3>
            <p>
              GSTR-9C is a reconciliation statement that reconciles values declared in GSTR-9 with
              audited financial statements. Since FY 2020-21, it is self-certified by the taxpayer.
            </p>

            <h3>What is the penalty for not filing GSTR-9C on time?</h3>
            <p>
              Late fee of ₹200 per day (₹100 CGST + ₹100 SGST) up to a maximum of 0.5% of
              turnover. Additionally, a general penalty under Section 125 of up to ₹25,000 may apply.
            </p>

            <h3>What documents are needed for GST audit?</h3>
            <p>
              All GST returns, books of accounts, purchase and sales registers, ITC register,
              e-way bills, credit/debit notes, bank statements, stock register, and contracts.
            </p>

            <h3>Is GST audit applicable to composition dealers?</h3>
            <p>
              No, composition dealers file GSTR-4 (annual return) instead of GSTR-9. GSTR-9C is
              not required for composition dealers. However, they must still maintain proper books
              of accounts.
            </p>
          </section>

          <RelatedTools current="/audit-checklist" />
          <CrossProductLinks page="audit-checklist" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
