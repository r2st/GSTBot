import { useMemo, useState } from "react";
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

const TDS_RATE = 2;
const TDS_THRESHOLD = 250000;

const DEDUCTEE_TYPES = [
  { key: "resident", label: "Resident" },
  { key: "unregistered", label: "Unregistered Person" },
];

const SUPPLY_TYPES = [
  { key: "goods", label: "Supply of Goods" },
  { key: "services", label: "Supply of Services" },
  { key: "both", label: "Both Goods & Services" },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST TDS Calculator — Section 51",
  url: "https://gst.doaide.com/tds-calculator",
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
      name: "What is TDS under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "TDS under GST (Section 51) requires notified persons like government departments and PSUs to deduct 2% from payments above ₹2.5 lakh to suppliers for taxable goods and services.",
      },
    },
    {
      "@type": "Question",
      name: "What is the TDS rate under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The TDS rate under GST is 2% of the payment amount — split as 1% CGST + 1% SGST for intra-state supplies, or 2% IGST for inter-state supplies. It is deducted from the value of supply excluding tax.",
      },
    },
    {
      "@type": "Question",
      name: "What is the threshold for TDS deduction under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "TDS applies when a single contract's total supply value exceeds ₹2.5 lakh (excluding GST). Even smaller payments within such a contract attract TDS once the contract crosses this threshold.",
      },
    },
    {
      "@type": "Question",
      name: "Who is required to deduct TDS under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Government departments, local authorities, PSUs, government agencies, and boards with 51% or more government equity must deduct TDS on contractual payments above ₹2.5 lakh.",
      },
    },
    {
      "@type": "Question",
      name: "How does the supplier claim TDS credit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Once the deductor files GSTR-7, the TDS appears in the supplier's electronic cash ledger. The supplier can use this credit to pay GST on outward supplies or claim a refund.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "GST TDS Calculator" },
];

export default function TdsCalculatorPage() {
  usePageTitle("GST TDS Calculator — Section 51 | Free Tool");

  const [contractValue, setContractValue] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [interstate, setInterstate] = useState(false);
  const [deducteeType, setDeducteeType] = useState("resident");
  const [supplyType, setSupplyType] = useState("services");

  const result = useMemo(() => {
    const contract = parseFloat(contractValue);
    const payment = parseFloat(paymentAmount);

    if (!Number.isFinite(contract) || contract < 0) return null;
    if (!Number.isFinite(payment) || payment < 0) return null;

    if (contract <= TDS_THRESHOLD) {
      return {
        applicable: false,
        reason: `Contract value of ${formatINR(contract)} is within the ₹2,50,000 threshold. TDS under GST is not applicable.`,
      };
    }

    const tdsAmount = Math.round(payment * TDS_RATE) / 100;
    const netPayment = Math.round((payment - tdsAmount) * 100) / 100;

    if (interstate) {
      return {
        applicable: true,
        contractValue: contract,
        paymentAmount: payment,
        tdsRate: TDS_RATE,
        igst: tdsAmount,
        cgst: 0,
        sgst: 0,
        totalTds: tdsAmount,
        netPayment,
        interstate: true,
      };
    }

    const halfTds = Math.round((tdsAmount / 2) * 100) / 100;
    const otherHalf = Math.round((tdsAmount - halfTds) * 100) / 100;

    return {
      applicable: true,
      contractValue: contract,
      paymentAmount: payment,
      tdsRate: TDS_RATE,
      igst: 0,
      cgst: halfTds,
      sgst: otherHalf,
      totalTds: Math.round((halfTds + otherHalf) * 100) / 100,
      netPayment: Math.round((payment - halfTds - otherHalf) * 100) / 100,
      interstate: false,
    };
  }, [contractValue, paymentAmount, interstate]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST TDS Calculator — Section 51 | Free Online Tool"
        description="Calculate TDS under GST (Section 51). Enter contract value and payment amount to get CGST, SGST, IGST TDS breakdown. Check threshold applicability. Free, no login required."
        path="/tds-calculator"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST TDS Calculator — Section 51</h1>
          <p className="tool-subtitle">
            Calculate Tax Deducted at Source under GST. Enter contract and payment details for instant TDS breakdown. No sign-up required.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              Total Contract Value (excluding GST) (₹)
              <input
                type="number"
                className="calc-input"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="Enter total contract value"
                min="0"
                step="1"
                inputMode="numeric"
                autoFocus
              />
            </label>

            <label className="calc-label">
              Payment Amount for This Invoice (excluding GST) (₹)
              <input
                type="number"
                className="calc-input"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter current payment amount"
                min="0"
                step="1"
                inputMode="numeric"
              />
            </label>

            <label className="calc-label">
              Type of Supply
              <select
                className="calc-select"
                value={supplyType}
                onChange={(e) => setSupplyType(e.target.value)}
              >
                {SUPPLY_TYPES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="calc-label">
              Deductee Type
              <select
                className="calc-select"
                value={deducteeType}
                onChange={(e) => setDeducteeType(e.target.value)}
              >
                {DEDUCTEE_TYPES.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="calc-checkbox-label">
              <input
                type="checkbox"
                checked={interstate}
                onChange={(e) => setInterstate(e.target.checked)}
              />
              Inter-state supply (supplier and deductor in different states)
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                <div className="calc-result-row calc-total" style={{ color: result.applicable ? "#fbbf24" : "#34d399" }}>
                  <span>TDS Applicable</span>
                  <strong>{result.applicable ? "Yes" : "No"}</strong>
                </div>

                {!result.applicable && (
                  <p style={{ margin: "0.5rem 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    {result.reason}
                  </p>
                )}

                {result.applicable && (
                  <>
                    <div className="calc-result-row">
                      <span>Payment Amount</span>
                      <strong>{formatINR(result.paymentAmount)}</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>TDS Rate</span>
                      <strong>{result.tdsRate}%</strong>
                    </div>
                    {result.interstate ? (
                      <div className="calc-result-row">
                        <span>IGST TDS</span>
                        <strong>{formatINR(result.igst)}</strong>
                      </div>
                    ) : (
                      <>
                        <div className="calc-result-row">
                          <span>CGST TDS (1%)</span>
                          <strong>{formatINR(result.cgst)}</strong>
                        </div>
                        <div className="calc-result-row">
                          <span>SGST TDS (1%)</span>
                          <strong>{formatINR(result.sgst)}</strong>
                        </div>
                      </>
                    )}
                    <div className="calc-result-row calc-total">
                      <span>Total TDS</span>
                      <strong>{formatINR(result.totalTds)}</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>Net Payment to Supplier</span>
                      <strong>{formatINR(result.netPayment)}</strong>
                    </div>
                  </>
                )}

                <div className="calc-result-actions">
                  <ShareButtons
                    path="/tds-calculator"
                    text={result.applicable
                      ? `GST TDS on ₹${paymentAmount}: ${formatINR(result.totalTds)} — calculated free on DoAide GST`
                      : `Contract below ₹2.5L threshold — no GST TDS applicable. Checked on DoAide GST`}
                    toolName="GST TDS Calculator"
                  />
                </div>
              </div>
            )}
          </div>

          {result && result.applicable && (
            <SaveResultsCTA resultSummary={`GST TDS: ${formatINR(result.totalTds)} on payment of ${formatINR(result.paymentAmount)}`} />
          )}
          <EmailCapture
            source="tds-calculator"
            heading="Stay updated on GST TDS rules"
            subtext="Get notified when TDS thresholds or rates change — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>GST TDS Under Section 51 — Complete Guide</h2>
            <p>
              Tax Deducted at Source (TDS) under GST was introduced under Section 51 of the
              CGST Act, 2017. Certain categories of persons are required to deduct TDS at 2%
              (1% CGST + 1% SGST/UTGST for intra-state, or 2% IGST for inter-state) when
              making payments for taxable supplies exceeding ₹2,50,000.
            </p>
            <h3>Who Must Deduct TDS Under GST?</h3>
            <ul>
              <li>A department or establishment of the Central or State Government</li>
              <li>Local authority</li>
              <li>Governmental agencies</li>
              <li>Persons or categories notified by the Government on the Council&apos;s recommendation</li>
              <li>An authority, board, or body set up by Parliament, State Legislature, or Government with 51%+ equity or control by Government</li>
              <li>Society established by Central or State Government or a local authority under the Societies Registration Act</li>
              <li>Public Sector Undertakings</li>
            </ul>
            <h3>TDS Rate and Threshold</h3>
            <ul>
              <li><strong>Rate:</strong> 2% of the payment (1% CGST + 1% SGST for intra-state; 2% IGST for inter-state)</li>
              <li><strong>Threshold:</strong> ₹2,50,000 per contract (excluding GST)</li>
              <li>TDS is deducted from the value of supply, not on the GST component</li>
              <li>Individual payments below ₹2.5 lakh still attract TDS if the total contract exceeds the threshold</li>
            </ul>
            <h3>Filing Requirements</h3>
            <ul>
              <li><strong>GSTR-7:</strong> Monthly return by the deductor — due by 10th of the following month</li>
              <li><strong>GSTR-7A:</strong> TDS certificate generated automatically and available to the deductee</li>
              <li>Late filing penalty: ₹100/day under CGST + ₹100/day under SGST (max ₹5,000 each)</li>
            </ul>
            <h3>How Does the Supplier Claim TDS Credit?</h3>
            <p>
              Once the deductor files GSTR-7, the TDS amount reflects in the supplier&apos;s
              electronic cash ledger automatically. The supplier can use this credit to pay
              GST on outward supplies or claim a refund if TDS exceeds their liability.
            </p>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>What is TDS under GST?</h3>
            <p>
              TDS under GST (Section 51) requires certain notified persons — government departments,
              local authorities, PSUs — to deduct 2% from payments exceeding ₹2.5 lakh made for
              taxable supplies. It is split as 1% CGST + 1% SGST for intra-state, or 2% IGST for
              inter-state.
            </p>

            <h3>What is the TDS rate under GST?</h3>
            <p>
              The TDS rate is 2% of the payment amount (excluding GST). For intra-state supplies,
              it splits into 1% CGST and 1% SGST. For inter-state supplies, 2% IGST is deducted.
            </p>

            <h3>What is the threshold for TDS deduction under GST?</h3>
            <p>
              TDS applies when the total value of supply under a single contract exceeds ₹2,50,000
              (excluding GST). Individual payments within the contract are subject to TDS even if
              each individual payment is below ₹2.5 lakh.
            </p>

            <h3>Who is required to deduct TDS under GST?</h3>
            <p>
              Government departments, local authorities, governmental agencies, PSUs, and bodies
              with 51%+ government equity. Private companies are not required to deduct TDS under GST.
            </p>

            <h3>How does the supplier claim TDS credit?</h3>
            <p>
              The TDS amount auto-populates in the supplier&apos;s electronic cash ledger once the
              deductor files GSTR-7. The supplier can use it to pay outward GST or claim a refund.
            </p>
          </section>

          <InlineCTA variant="save" />
          <RelatedTools current="/tds-calculator" />
          <CrossProductLinks page="tds-calculator" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
      <ExitIntentPopup />
    </div>
  );
}
