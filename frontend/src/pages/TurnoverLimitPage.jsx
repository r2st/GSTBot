import { useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatINR } from "../lib/gstCalc";

const SPECIAL_CATEGORY_STATES = [
  "Arunachal Pradesh", "Assam", "Himachal Pradesh", "Jammu & Kashmir",
  "Ladakh", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Sikkim", "Tripura", "Uttarakhand",
];

const BUSINESS_TYPES = [
  { key: "goods", label: "Supply of goods" },
  { key: "services", label: "Supply of services" },
  { key: "both", label: "Both goods and services" },
];

function determineThreshold(state, businessType) {
  const isSpecial = SPECIAL_CATEGORY_STATES.includes(state);
  if (businessType === "services") {
    return isSpecial ? 1000000 : 2000000;
  }
  return isSpecial ? 2000000 : 4000000;
}

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Registration Threshold Checker",
  url: "https://gst.doaide.com/turnover-limit",
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
      name: "What is the GST registration threshold for goods?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For suppliers of goods: ₹40 lakh aggregate turnover in normal states, ₹20 lakh in special category states (northeastern states, Himachal Pradesh, Uttarakhand, Jammu & Kashmir, and Ladakh).",
      },
    },
    {
      "@type": "Question",
      name: "What is the GST registration threshold for services?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For suppliers of services: ₹20 lakh aggregate turnover in normal states, ₹10 lakh in special category states.",
      },
    },
    {
      "@type": "Question",
      name: "When is GST registration mandatory regardless of turnover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Mandatory regardless of turnover: interstate supply, casual/non-resident taxable persons, reverse charge liability, e-commerce operators, suppliers via e-commerce platforms, and TDS/TCS deductors.",
      },
    },
    {
      "@type": "Question",
      name: "What is aggregate turnover under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Aggregate turnover includes taxable, exempt, export, and interstate supplies of persons with the same PAN, on an all-India basis. It excludes reverse charge inward supplies and GST (CGST, SGST, IGST, cess).",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Turnover Limit Checker" },
];

const ALL_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Chandigarh", "Dadra & Nagar Haveli & Daman & Diu",
  "Delhi", "Puducherry", "Andaman & Nicobar",
];

const MANDATORY_CASES = [
  "Interstate supply of taxable goods (any value)",
  "Interstate supply of taxable services (above threshold only)",
  "Casual taxable person making taxable supply",
  "Non-resident taxable person",
  "Person liable to pay tax under reverse charge",
  "E-commerce operator (TCS under Section 52)",
  "Person supplying goods through e-commerce platform",
  "Person required to deduct TDS under Section 51",
  "Input service distributor",
  "Agent of a supplier or recipient",
  "Transfer of business (transferee must register)",
];

export default function TurnoverLimitPage() {
  usePageTitle("GST Registration Threshold — Check if You Need GST");

  const [state, setState] = useState("");
  const [businessType, setBusinessType] = useState("goods");
  const [turnover, setTurnover] = useState("");
  const [interstate, setInterstate] = useState(false);
  const [ecommerce, setEcommerce] = useState(false);

  const result = useMemo(() => {
    if (!state) return null;

    const threshold = determineThreshold(state, businessType);
    const parsed = parseFloat(turnover);
    const hasTurnover = Number.isFinite(parsed) && parsed >= 0;

    if (interstate) {
      return {
        required: true,
        reason: "GST registration is mandatory for interstate supply of taxable goods, regardless of turnover.",
        threshold,
        turnoverValue: hasTurnover ? parsed : null,
      };
    }

    if (ecommerce) {
      return {
        required: true,
        reason: "GST registration is mandatory for persons supplying goods or services through an e-commerce platform, regardless of turnover.",
        threshold,
        turnoverValue: hasTurnover ? parsed : null,
      };
    }

    if (!hasTurnover) {
      return { required: null, threshold, turnoverValue: null, reason: "Enter your aggregate turnover to check." };
    }

    if (parsed >= threshold) {
      return {
        required: true,
        reason: `Your aggregate turnover (${formatINR(parsed)}) exceeds the ${formatINR(threshold)} threshold for ${state}. GST registration is mandatory.`,
        threshold,
        turnoverValue: parsed,
      };
    }

    return {
      required: false,
      reason: `Your aggregate turnover (${formatINR(parsed)}) is below the ${formatINR(threshold)} threshold for ${state}. GST registration is not mandatory, but you may register voluntarily.`,
      threshold,
      turnoverValue: parsed,
    };
  }, [state, businessType, turnover, interstate, ecommerce]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Registration Threshold — Check if You Need GST Registration"
        description="Check if your business needs GST registration based on turnover, state, and supply type. Free threshold checker tool — no login required."
        path="/turnover-limit"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST Registration Threshold Checker</h1>
          <p className="tool-subtitle">
            Check whether your business needs GST registration based on your turnover,
            state, and type of supply. No sign-up required.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              State / UT
              <select
                className="calc-select"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">Select your state</option>
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>{s}{SPECIAL_CATEGORY_STATES.includes(s) ? " (Special Category)" : ""}</option>
                ))}
              </select>
            </label>

            <label className="calc-label">
              Type of Supply
              <select
                className="calc-select"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
              >
                {BUSINESS_TYPES.map((b) => (
                  <option key={b.key} value={b.key}>{b.label}</option>
                ))}
              </select>
            </label>

            <label className="calc-label">
              Aggregate Annual Turnover (₹)
              <input
                type="number"
                className="calc-input"
                value={turnover}
                onChange={(e) => setTurnover(e.target.value)}
                placeholder="Enter your annual turnover"
                min="0"
                step="1"
                inputMode="numeric"
              />
            </label>

            <label className="calc-checkbox-label">
              <input
                type="checkbox"
                checked={interstate}
                onChange={(e) => setInterstate(e.target.checked)}
              />
              Interstate supply of taxable goods
            </label>

            <label className="calc-checkbox-label">
              <input
                type="checkbox"
                checked={ecommerce}
                onChange={(e) => setEcommerce(e.target.checked)}
              />
              Selling through e-commerce platform (Amazon, Flipkart, etc.)
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                {result.threshold && (
                  <div className="calc-result-row">
                    <span>Applicable Threshold</span>
                    <strong>{formatINR(result.threshold)}</strong>
                  </div>
                )}
                {SPECIAL_CATEGORY_STATES.includes(state) && (
                  <div className="calc-result-row">
                    <span>State Category</span>
                    <strong>Special Category (Lower Threshold)</strong>
                  </div>
                )}
                {result.required !== null && (
                  <div className="calc-result-row calc-total" style={{ color: result.required ? "#f59e42" : "#34d399" }}>
                    <span>GST Registration</span>
                    <strong>{result.required ? "Required" : "Not Mandatory"}</strong>
                  </div>
                )}
                <p style={{ margin: "0.5rem 0", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {result.reason}
                </p>
                <div className="calc-result-actions">
                  <ShareButtons
                    path="/turnover-limit"
                    text={`GST registration ${result.required ? "required" : "not mandatory"} — checked free on DoAide GST`}
                  />
                </div>
              </div>
            )}
          </div>

          <EmailCapture
            source="turnover-limit"
            heading="Stay updated on GST thresholds"
            subtext="Get notified when GST registration thresholds change."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>GST Registration Thresholds</h2>
            <table className="due-date-table">
              <thead>
                <tr>
                  <th>Supply Type</th>
                  <th>Normal States</th>
                  <th>Special Category States</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Goods only</td>
                  <td>₹40 lakh</td>
                  <td>₹20 lakh</td>
                </tr>
                <tr>
                  <td>Services only</td>
                  <td>₹20 lakh</td>
                  <td>₹10 lakh</td>
                </tr>
                <tr>
                  <td>Both goods &amp; services</td>
                  <td>₹40 lakh</td>
                  <td>₹20 lakh</td>
                </tr>
              </tbody>
            </table>

            <h3>Mandatory Registration (Regardless of Turnover)</h3>
            <ul>
              {MANDATORY_CASES.map((c, i) => <li key={i}>{c}</li>)}
            </ul>

            <h3>Special Category States</h3>
            <p>
              The following states and UTs have lower GST registration thresholds:
              {" "}{SPECIAL_CATEGORY_STATES.join(", ")}.
            </p>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>What is aggregate turnover under GST?</h3>
            <p>
              Aggregate turnover includes all taxable, exempt, and export supplies of persons
              having the same PAN, computed on an all-India basis. It excludes inward supplies
              under reverse charge and tax amounts (CGST, SGST, IGST, cess).
            </p>

            <h3>Should I register even if below the threshold?</h3>
            <p>
              Voluntary registration is allowed and often beneficial — it lets you collect GST,
              claim ITC on purchases, sell to other registered businesses more easily, and
              list on government and e-commerce platforms that require a GSTIN.
            </p>

            <h3>What happens if I cross the threshold mid-year?</h3>
            <p>
              You must apply for GST registration within 30 days of your aggregate turnover
              crossing the applicable threshold. Failure to register attracts a penalty equal
              to the tax due or ₹10,000, whichever is higher.
            </p>
          </section>

          <RelatedTools current="/turnover-limit" />
          <CrossProductLinks page="turnover-limit" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}

export { SPECIAL_CATEGORY_STATES, determineThreshold };
