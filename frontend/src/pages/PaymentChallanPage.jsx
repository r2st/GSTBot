import { useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import PrintButton from "../components/PrintButton";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatINR } from "../lib/gstCalc";
import WhatsAppFloat from "../components/WhatsAppFloat";
import { track } from "../lib/track";

const HEADS = {
  igst: { code: "0008", label: "IGST" },
  cgst: { code: "0005", label: "CGST" },
  sgst: { code: "0006", label: "SGST" },
  cess: { code: "0009", label: "Cess" },
};

function half(val) {
  const h = Math.round((val / 2) * 100) / 100;
  return [h, Math.round((val - h) * 100) / 100];
}

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Payment Challan Helper",
  url: "https://gst.doaide.com/payment-challan",
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
      name: "What is PMT-06 in GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "PMT-06 is the challan form used for making GST payments online through the GST portal. It allows you to pay tax, interest, penalty, late fees, and cess under the appropriate heads (IGST, CGST, SGST, Cess).",
      },
    },
    {
      "@type": "Question",
      name: "How to pay GST online using challan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "On the GST portal, go to Services, Payments, Create Challan. Enter amounts under each head and minor head, choose a payment mode, generate the challan, and pay.",
      },
    },
    {
      "@type": "Question",
      name: "What are the payment modes for GST challan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GST can be paid via Net Banking, NEFT/RTGS, Over the Counter (up to ₹10,000 per challan), or Credit/Debit card through authorized banks.",
      },
    },
    {
      "@type": "Question",
      name: "What is CIN in GST payment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CIN is a unique 17-digit number generated after a successful GST payment. It serves as proof of payment and is needed for filing returns. Always save it.",
      },
    },
    {
      "@type": "Question",
      name: "Can I pay GST through NEFT/RTGS?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Generate a challan on the GST portal and select NEFT/RTGS. The portal provides a mandate form. Payment reflects in your cash ledger within 2 hours.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Payment Challan Helper" },
];

export default function PaymentChallanPage() {
  usePageTitle("GST Payment Challan Helper — PMT-06 Guide");

  const [supplyType, setSupplyType] = useState("intrastate");
  const [taxAmount, setTaxAmount] = useState("");
  const [interest, setInterest] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [penalty, setPenalty] = useState("");
  const [cess, setCess] = useState("");

  const result = useMemo(() => {
    const tax = parseFloat(taxAmount) || 0;
    const int = parseFloat(interest) || 0;
    const lf = parseFloat(lateFee) || 0;
    const pen = parseFloat(penalty) || 0;
    const cs = parseFloat(cess) || 0;

    if (tax <= 0 && int <= 0 && lf <= 0 && pen <= 0 && cs <= 0) return null;

    track("payment_challan", { supplyType });

    const rows = [];

    if (supplyType === "interstate") {
      rows.push({
        head: `${HEADS.igst.label} (${HEADS.igst.code})`,
        tax, interest: int, lateFee: lf, penalty: pen,
        total: Math.round((tax + int + lf + pen) * 100) / 100,
      });
      rows.push({
        head: `${HEADS.cgst.label} (${HEADS.cgst.code})`,
        tax: 0, interest: 0, lateFee: 0, penalty: 0, total: 0,
      });
      rows.push({
        head: `${HEADS.sgst.label} (${HEADS.sgst.code})`,
        tax: 0, interest: 0, lateFee: 0, penalty: 0, total: 0,
      });
    } else {
      const [taxC, taxS] = half(tax);
      const [intC, intS] = half(int);
      const [lfC, lfS] = half(lf);
      const [penC, penS] = half(pen);
      rows.push({
        head: `${HEADS.igst.label} (${HEADS.igst.code})`,
        tax: 0, interest: 0, lateFee: 0, penalty: 0, total: 0,
      });
      rows.push({
        head: `${HEADS.cgst.label} (${HEADS.cgst.code})`,
        tax: taxC, interest: intC, lateFee: lfC, penalty: penC,
        total: Math.round((taxC + intC + lfC + penC) * 100) / 100,
      });
      rows.push({
        head: `${HEADS.sgst.label} (${HEADS.sgst.code})`,
        tax: taxS, interest: intS, lateFee: lfS, penalty: penS,
        total: Math.round((taxS + intS + lfS + penS) * 100) / 100,
      });
    }

    rows.push({
      head: `${HEADS.cess.label} (${HEADS.cess.code})`,
      tax: cs, interest: 0, lateFee: 0, penalty: 0, total: cs,
    });

    const grand = {
      tax: rows.reduce((s, r) => s + r.tax, 0),
      interest: rows.reduce((s, r) => s + r.interest, 0),
      lateFee: rows.reduce((s, r) => s + r.lateFee, 0),
      penalty: rows.reduce((s, r) => s + r.penalty, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    };

    return { rows, grand };
  }, [supplyType, taxAmount, interest, lateFee, penalty, cess]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Payment Challan Helper — PMT-06 Guide"
        description="Generate your GST payment challan breakdown for PMT-06. See exactly which heads to pay under — IGST, CGST, SGST, Cess with tax, interest, late fee, and penalty. Free."
        path="/payment-challan"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST Payment Challan Helper</h1>
          <p className="tool-subtitle">
            See exactly which heads to pay under in PMT-06. No sign-up required.
          </p>

          <div className="how-it-works">
            <h2 className="how-it-works-title">How It Works</h2>
            <div className="how-it-works-steps">
              <div className="how-it-works-step">
                <div className="how-it-works-num">1</div>
                <h3>Select Supply Type</h3>
                <p>Choose whether your supply is intrastate or interstate</p>
              </div>
              <div className="how-it-works-step">
                <div className="how-it-works-num">2</div>
                <h3>Enter Amounts</h3>
                <p>Enter tax, interest, late fee, and penalty amounts</p>
              </div>
              <div className="how-it-works-step">
                <div className="how-it-works-num">3</div>
                <h3>Get Challan Breakdown</h3>
                <p>See exactly which heads to pay under in PMT-06</p>
              </div>
            </div>
          </div>

          <div className="calc-card">
            <label className="calc-label">
              Supply Type
              <select
                className="calc-select"
                value={supplyType}
                onChange={(e) => setSupplyType(e.target.value)}
              >
                <option value="intrastate">Intrastate (CGST + SGST)</option>
                <option value="interstate">Interstate (IGST)</option>
              </select>
            </label>

            <label className="calc-label">
              Tax Amount (₹)
              <input
                type="number"
                className="calc-input"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                placeholder="Enter tax amount"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
              />
            </label>

            <label className="calc-label">
              Interest (₹) — if any
              <input
                type="number"
                className="calc-input"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </label>

            <label className="calc-label">
              Late Fee (₹) — if any
              <input
                type="number"
                className="calc-input"
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </label>

            <label className="calc-label">
              Penalty (₹) — if any
              <input
                type="number"
                className="calc-input"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </label>

            <label className="calc-label">
              Cess (₹) — if applicable
              <input
                type="number"
                className="calc-input"
                value={cess}
                onChange={(e) => setCess(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                <h3 className="challan-heading">Challan Breakdown (PMT-06)</h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Head</th>
                        <th>Tax</th>
                        <th>Interest</th>
                        <th>Late Fee</th>
                        <th>Penalty</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.head}>
                          <td><strong>{r.head}</strong></td>
                          <td>{formatINR(r.tax)}</td>
                          <td>{formatINR(r.interest)}</td>
                          <td>{formatINR(r.lateFee)}</td>
                          <td>{formatINR(r.penalty)}</td>
                          <td><strong>{formatINR(r.total)}</strong></td>
                        </tr>
                      ))}
                      <tr className="challan-total-row">
                        <td><strong>Total</strong></td>
                        <td><strong>{formatINR(result.grand.tax)}</strong></td>
                        <td><strong>{formatINR(result.grand.interest)}</strong></td>
                        <td><strong>{formatINR(result.grand.lateFee)}</strong></td>
                        <td><strong>{formatINR(result.grand.penalty)}</strong></td>
                        <td><strong>{formatINR(result.grand.total)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="calc-result-actions">
                  <ShareButtons
                    path="/payment-challan"
                    text={`GST payment challan breakdown: Total ${formatINR(result.grand.total)} — generated free on DoAide GST`}
                  />
                  <PrintButton label="Print Challan" />
                </div>
              </div>
            )}
          </div>

          <EmailCapture
            source="payment-challan"
            heading="Never miss a GST payment deadline"
            subtext="Get free email reminders before every GST due date."
            buttonLabel="Remind Me"
            compact
          />

          <section className="tool-info">
            <h2>PMT-06 Payment Process — Step by Step</h2>
            <ol>
              <li><strong>Log in</strong> to the GST Portal at gst.gov.in with your credentials</li>
              <li><strong>Navigate</strong> to Services → Payments → Create Challan</li>
              <li><strong>Select</strong> the tax period for which you are making the payment</li>
              <li><strong>Enter amounts</strong> under each head as shown in the breakdown above — IGST, CGST, SGST, and Cess with minor heads for tax, interest, late fee, and penalty</li>
              <li><strong>Choose payment mode:</strong> Net Banking (instant), NEFT/RTGS (2 hrs/30 min), or Over the Counter (up to ₹10,000)</li>
              <li><strong>Generate challan</strong> and complete the payment through your selected mode</li>
              <li><strong>Save the CIN</strong> (Challan Identification Number) — this is your proof of payment and is required for return filing</li>
            </ol>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>What is PMT-06 in GST?</h3>
            <p>
              PMT-06 is the challan form for making GST payments on the GST portal.
              It lets you pay tax, interest, penalty, late fee, and cess under the
              correct major and minor heads.
            </p>

            <h3>How to pay GST online using challan?</h3>
            <p>
              Log in to gst.gov.in → Services → Payments → Create Challan. Enter amounts
              under each head (IGST/CGST/SGST/Cess), choose a payment mode, generate the
              challan, and complete payment. Save the CIN as proof.
            </p>

            <h3>What are the payment modes for GST challan?</h3>
            <p>
              Net Banking (instant via authorized banks), NEFT/RTGS (through any bank,
              reflects in 30 min to 2 hrs), Over the Counter (up to ₹10,000 at bank branches),
              and Credit/Debit card at select banks.
            </p>

            <h3>What is CIN in GST payment?</h3>
            <p>
              CIN is the 17-digit Challan Identification Number generated after successful
              payment. It confirms the payment and credits your Electronic Cash Ledger.
              Always save it for return filing and dispute resolution.
            </p>

            <h3>Can I pay GST through NEFT/RTGS?</h3>
            <p>
              Yes. Generate the challan on the portal with NEFT/RTGS as payment mode.
              The portal provides bank details and a mandate form. RTGS reflects in 30
              minutes and NEFT in about 2 hours during business hours.
            </p>
          </section>

          <RelatedTools current="/payment-challan" />
          <CrossProductLinks page="payment-challan" />
        </div>
      </main>
      <DoAideFooter />
      <WhatsAppFloat path="/payment-challan" text="Free GST Payment Challan Helper — PMT-06 calculator" />
    </div>
  );
}
