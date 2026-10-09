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

const REFUND_TYPES = [
  { key: "export", label: "Export of Goods/Services (with payment of tax)" },
  { key: "export_lut", label: "Export under LUT/Bond (without payment of tax)" },
  { key: "inverted", label: "Inverted Duty Structure" },
  { key: "deemed_export", label: "Deemed Export" },
  { key: "excess_cash", label: "Excess Balance in Electronic Cash Ledger" },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Refund Calculator",
  url: "https://gst.doaide.com/refund-calculator",
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
      name: "Who can claim GST refund?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Exporters, businesses with inverted duty structure, deemed exporters, embassies, UN bodies, and those with excess electronic cash ledger balance can claim GST refund under the applicable categories.",
      },
    },
    {
      "@type": "Question",
      name: "What is the formula for GST refund on inverted duty structure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Maximum refund equals turnover of inverted rated supply multiplied by Net ITC, divided by adjusted total turnover, minus tax payable on such supply. Net ITC excludes capital goods and input services.",
      },
    },
    {
      "@type": "Question",
      name: "What is the time limit for claiming GST refund?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A GST refund application must be filed within 2 years from the relevant date. For exports, the relevant date is the date of export. For inverted duty, it is the end of the financial year in which the claim arises.",
      },
    },
    {
      "@type": "Question",
      name: "What is export under LUT?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Letter of Undertaking (LUT) allows exporters to make zero-rated exports without paying IGST. The exporter can then claim refund of accumulated ITC on inputs used for the exports. LUT is filed annually in Form GST RFD-11.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "GST Refund Calculator" },
];

export default function RefundCalculatorPage() {
  usePageTitle("GST Refund Calculator — Exports & Inverted Duty | Free Tool");

  const [refundType, setRefundType] = useState("export");
  const [exportTurnover, setExportTurnover] = useState("");
  const [totalTurnover, setTotalTurnover] = useState("");
  const [netItc, setNetItc] = useState("");
  const [taxPaid, setTaxPaid] = useState("");
  const [invertedInputRate, setInvertedInputRate] = useState("");
  const [invertedOutputRate, setInvertedOutputRate] = useState("");
  const [invertedTurnover, setInvertedTurnover] = useState("");

  const result = useMemo(() => {
    if (refundType === "export") {
      const paid = parseFloat(taxPaid);
      if (!Number.isFinite(paid) || paid < 0) return null;
      return {
        type: "export",
        label: "Export with Tax Payment",
        refundAmount: paid,
        explanation: `You paid ${formatINR(paid)} as IGST on exports. The entire IGST paid on zero-rated exports is refundable.`,
      };
    }

    if (refundType === "export_lut") {
      const expTurnover = parseFloat(exportTurnover);
      const adjTurnover = parseFloat(totalTurnover);
      const itc = parseFloat(netItc);

      if (!Number.isFinite(expTurnover) || expTurnover < 0) return null;
      if (!Number.isFinite(adjTurnover) || adjTurnover <= 0) return null;
      if (!Number.isFinite(itc) || itc < 0) return null;

      const refund = Math.round((expTurnover / adjTurnover) * itc * 100) / 100;
      return {
        type: "export_lut",
        label: "Export under LUT (ITC Refund)",
        refundAmount: refund,
        exportTurnover: expTurnover,
        totalTurnover: adjTurnover,
        netItc: itc,
        explanation: `Refund = (Export Turnover ÷ Total Turnover) × Net ITC = (${formatINR(expTurnover)} ÷ ${formatINR(adjTurnover)}) × ${formatINR(itc)} = ${formatINR(refund)}`,
      };
    }

    if (refundType === "inverted") {
      const turnover = parseFloat(invertedTurnover);
      const adjTurnover = parseFloat(totalTurnover);
      const itc = parseFloat(netItc);
      const inputRate = parseFloat(invertedInputRate);
      const outputRate = parseFloat(invertedOutputRate);

      if (!Number.isFinite(turnover) || turnover < 0) return null;
      if (!Number.isFinite(adjTurnover) || adjTurnover <= 0) return null;
      if (!Number.isFinite(itc) || itc < 0) return null;
      if (!Number.isFinite(inputRate) || inputRate < 0) return null;
      if (!Number.isFinite(outputRate) || outputRate < 0) return null;

      if (inputRate <= outputRate) {
        return {
          type: "inverted",
          label: "Inverted Duty Structure",
          refundAmount: 0,
          explanation: `Input tax rate (${inputRate}%) is not higher than output tax rate (${outputRate}%). Inverted duty structure refund does not apply.`,
        };
      }

      const taxPayable = Math.round(turnover * outputRate) / 100;
      const maxRefund = Math.round(((turnover * itc / adjTurnover) - taxPayable) * 100) / 100;
      const refund = Math.max(0, maxRefund);

      return {
        type: "inverted",
        label: "Inverted Duty Structure",
        refundAmount: refund,
        turnover,
        totalTurnover: adjTurnover,
        netItc: itc,
        inputRate,
        outputRate,
        taxPayable,
        explanation: `Refund = (Inverted Turnover × Net ITC ÷ Adjusted Turnover) − Tax Payable = (${formatINR(turnover)} × ${formatINR(itc)} ÷ ${formatINR(adjTurnover)}) − ${formatINR(taxPayable)} = ${formatINR(refund)}`,
      };
    }

    if (refundType === "deemed_export") {
      const paid = parseFloat(taxPaid);
      if (!Number.isFinite(paid) || paid < 0) return null;
      return {
        type: "deemed_export",
        label: "Deemed Export",
        refundAmount: paid,
        explanation: `Tax paid on deemed export supplies of ${formatINR(paid)} is eligible for refund. Either the supplier or the recipient can claim the refund.`,
      };
    }

    if (refundType === "excess_cash") {
      const excess = parseFloat(taxPaid);
      if (!Number.isFinite(excess) || excess < 0) return null;
      return {
        type: "excess_cash",
        label: "Excess Cash Ledger Balance",
        refundAmount: excess,
        explanation: `Excess balance of ${formatINR(excess)} in electronic cash ledger is refundable. File RFD-01 on the GST portal to claim.`,
      };
    }

    return null;
  }, [refundType, exportTurnover, totalTurnover, netItc, taxPaid, invertedInputRate, invertedOutputRate, invertedTurnover]);

  const showExportFields = refundType === "export_lut";
  const showInvertedFields = refundType === "inverted";
  const showTaxPaidField = refundType === "export" || refundType === "deemed_export" || refundType === "excess_cash";
  const showTurnoverFields = refundType === "export_lut" || refundType === "inverted";

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Refund Calculator — Exports & Inverted Duty Structure | Free Tool"
        description="Calculate your GST refund for exports, inverted duty structure, deemed exports, and excess cash ledger balance. Uses official formula. Free, no login required."
        path="/refund-calculator"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST Refund Calculator</h1>
          <p className="tool-subtitle">
            Calculate your eligible GST refund for exports, inverted duty structure, and more. No sign-up required.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              Refund Type
              <select
                className="calc-select"
                value={refundType}
                onChange={(e) => setRefundType(e.target.value)}
              >
                {REFUND_TYPES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </label>

            {showTaxPaidField && (
              <label className="calc-label">
                {refundType === "excess_cash" ? "Excess Cash Ledger Balance (₹)" : "Tax Paid on Exports (₹)"}
                <input
                  type="number"
                  className="calc-input"
                  value={taxPaid}
                  onChange={(e) => setTaxPaid(e.target.value)}
                  placeholder={refundType === "excess_cash" ? "Enter excess balance" : "Enter IGST paid on exports"}
                  min="0"
                  step="1"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
            )}

            {showExportFields && (
              <label className="calc-label">
                Export Turnover (₹)
                <input
                  type="number"
                  className="calc-input"
                  value={exportTurnover}
                  onChange={(e) => setExportTurnover(e.target.value)}
                  placeholder="Turnover of zero-rated exports"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
            )}

            {showInvertedFields && (
              <>
                <label className="calc-label">
                  Turnover of Inverted Rated Supply (₹)
                  <input
                    type="number"
                    className="calc-input"
                    value={invertedTurnover}
                    onChange={(e) => setInvertedTurnover(e.target.value)}
                    placeholder="Turnover of inverted rated goods/services"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    autoFocus
                  />
                </label>
                <label className="calc-label">
                  Input Tax Rate (%)
                  <input
                    type="number"
                    className="calc-input"
                    value={invertedInputRate}
                    onChange={(e) => setInvertedInputRate(e.target.value)}
                    placeholder="e.g. 18"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                  />
                </label>
                <label className="calc-label">
                  Output Tax Rate (%)
                  <input
                    type="number"
                    className="calc-input"
                    value={invertedOutputRate}
                    onChange={(e) => setInvertedOutputRate(e.target.value)}
                    placeholder="e.g. 5"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                  />
                </label>
              </>
            )}

            {showTurnoverFields && (
              <>
                <label className="calc-label">
                  Adjusted Total Turnover (₹)
                  <input
                    type="number"
                    className="calc-input"
                    value={totalTurnover}
                    onChange={(e) => setTotalTurnover(e.target.value)}
                    placeholder="Total turnover (excluding exempt supplies)"
                    min="0"
                    step="1"
                    inputMode="numeric"
                  />
                </label>
                <label className="calc-label">
                  Net ITC (₹)
                  <input
                    type="number"
                    className="calc-input"
                    value={netItc}
                    onChange={(e) => setNetItc(e.target.value)}
                    placeholder="ITC availed on inputs and input services"
                    min="0"
                    step="1"
                    inputMode="numeric"
                  />
                </label>
              </>
            )}

            {result && (
              <div className="calc-result" aria-live="polite">
                <div className="calc-result-row">
                  <span>Refund Type</span>
                  <strong>{result.label}</strong>
                </div>
                <div className="calc-result-row calc-total" style={{ color: result.refundAmount > 0 ? "#34d399" : "#f87171" }}>
                  <span>Eligible Refund</span>
                  <strong>{formatINR(result.refundAmount)}</strong>
                </div>
                <p style={{ margin: "0.5rem 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {result.explanation}
                </p>
                <div className="calc-result-actions">
                  <ShareButtons
                    path="/refund-calculator"
                    text={`GST Refund (${result.label}): ${formatINR(result.refundAmount)} — calculated free on DoAide GST`}
                    toolName="GST Refund Calculator"
                  />
                </div>
              </div>
            )}
          </div>

          {result && result.refundAmount > 0 && (
            <SaveResultsCTA resultSummary={`GST Refund: ${formatINR(result.refundAmount)} (${result.label})`} />
          )}
          <EmailCapture
            source="refund-calculator"
            heading="Track your GST refund status"
            subtext="Get automated refund tracking and compliance alerts — sign up free."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>GST Refund — Complete Guide</h2>
            <p>
              GST refund is available in several situations: exports (with or without tax payment),
              inverted duty structure, deemed exports, excess cash in the electronic ledger, and
              more. The refund is claimed through Form RFD-01 on the GST portal.
            </p>
            <h3>Types of GST Refund</h3>
            <ul>
              <li><strong>Exports with tax:</strong> Full IGST paid on exports is refundable — the shipping bill itself acts as the refund application</li>
              <li><strong>Exports under LUT:</strong> Accumulated ITC on inputs used for zero-rated exports is refundable proportionately</li>
              <li><strong>Inverted duty structure:</strong> When input tax rate exceeds output tax rate, the accumulated ITC is refundable using the prescribed formula</li>
              <li><strong>Deemed exports:</strong> Supplies to SEZ, EOU, or under specific government notifications — either supplier or recipient can claim</li>
              <li><strong>Excess cash ledger:</strong> Any excess balance deposited in the electronic cash ledger can be claimed back</li>
            </ul>
            <h3>Inverted Duty Structure Formula</h3>
            <p>
              Maximum Refund = (Turnover of inverted rated supply of goods &amp; services × Net ITC ÷ Adjusted total turnover)
              − Tax payable on such inverted rated supply of goods &amp; services.
            </p>
            <p>
              Net ITC for this formula excludes ITC on capital goods and input services
              (Circular No. 135/05/2020-GST). Only ITC on inputs (goods) is considered.
            </p>
            <h3>Time Limit</h3>
            <ul>
              <li><strong>Exports:</strong> Within 2 years from the date of export</li>
              <li><strong>Inverted duty:</strong> Within 2 years from the end of the financial year</li>
              <li><strong>Excess cash:</strong> Can be claimed anytime</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>Who can claim GST refund?</h3>
            <p>
              Exporters (with tax or under LUT), businesses with inverted duty structure,
              deemed exporters, embassies, UN bodies, and anyone with excess cash ledger balance.
            </p>

            <h3>What is the formula for inverted duty structure refund?</h3>
            <p>
              Maximum Refund = (Inverted Turnover × Net ITC ÷ Adjusted Total Turnover) − Tax
              Payable on inverted supply. Net ITC excludes capital goods and input services ITC.
            </p>

            <h3>What is the time limit for claiming GST refund?</h3>
            <p>
              2 years from the relevant date. For exports, the date of export. For inverted duty,
              end of the financial year. For excess cash, anytime.
            </p>

            <h3>What is export under LUT?</h3>
            <p>
              Letter of Undertaking (LUT) allows zero-rated exports without paying IGST. The
              exporter claims refund of accumulated ITC on inputs instead. File LUT annually
              in Form GST RFD-11.
            </p>
          </section>

          <InlineCTA variant="save" />
          <RelatedTools current="/refund-calculator" />
          <CrossProductLinks page="refund-calculator" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
      <ExitIntentPopup />
    </div>
  );
}
