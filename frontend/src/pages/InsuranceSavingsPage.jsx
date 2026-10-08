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

const POLICY_TYPES = [
  { key: "health", label: "Health Insurance", oldRate: 18 },
  { key: "life_term", label: "Term Life Insurance", oldRate: 18 },
  { key: "life_endowment", label: "Endowment / ULIP", oldRate: 18 },
  { key: "motor_tp", label: "Motor Insurance (Third Party)", oldRate: 18 },
  { key: "motor_comprehensive", label: "Motor Insurance (Comprehensive)", oldRate: 18 },
  { key: "travel", label: "Travel Insurance", oldRate: 18 },
  { key: "home", label: "Home Insurance", oldRate: 18 },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Insurance GST Savings Calculator",
  url: "https://gst.doaide.com/insurance-savings",
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
      name: "Is GST removed from insurance under GST 2.0?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Under GST 2.0, health insurance and life insurance premiums have been moved to 0% GST (Nil rate), down from 18%. This provides significant savings on insurance premiums for all policyholders.",
      },
    },
    {
      "@type": "Question",
      name: "How much will I save on insurance premiums under GST 2.0?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You save the full 18% GST that was previously charged. For example, on a ₹25,000 health insurance premium, you save ₹4,500 per year. On a ₹10,000 term life premium, you save ₹1,800 per year.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Insurance GST Savings" },
];

export default function InsuranceSavingsPage() {
  usePageTitle("Insurance GST Savings Calculator — GST 2.0 Impact on Premiums");

  const [policyType, setPolicyType] = useState("health");
  const [annualPremium, setAnnualPremium] = useState("");
  const [yearsRemaining, setYearsRemaining] = useState("1");

  const policy = POLICY_TYPES.find((p) => p.key === policyType);

  const result = useMemo(() => {
    if (!policy) return null;
    const premium = parseFloat(annualPremium);
    const years = parseInt(yearsRemaining, 10) || 1;
    if (!Number.isFinite(premium) || premium <= 0) return null;

    const basePremium = Math.round((premium / (1 + policy.oldRate / 100)) * 100) / 100;
    const oldGstPerYear = Math.round((premium - basePremium) * 100) / 100;
    const savingsPerYear = oldGstPerYear;
    const totalSavings = Math.round(savingsPerYear * years * 100) / 100;
    const newPremium = basePremium;

    return {
      basePremium,
      oldGstPerYear,
      oldPremium: premium,
      newPremium,
      savingsPerYear,
      totalSavings,
      years,
    };
  }, [policy, annualPremium, yearsRemaining]);

  return (
    <div className="tool-page">
      <SeoHead
        title="Insurance GST Savings Calculator — How Much You Save Under GST 2.0"
        description="Calculate how much you save on insurance premiums under GST 2.0. Health and life insurance moved from 18% to 0% GST. See your annual and multi-year savings instantly."
        path="/insurance-savings"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">Insurance GST Savings Calculator</h1>
          <p className="tool-subtitle">
            See how much you save on insurance premiums under GST 2.0. Insurance GST reduced from 18% to 0%.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              Insurance Type
              <select
                className="calc-select"
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value)}
              >
                {POLICY_TYPES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className="calc-label">
              Current Annual Premium (₹) — including old 18% GST
              <input
                type="number"
                className="calc-input"
                value={annualPremium}
                onChange={(e) => setAnnualPremium(e.target.value)}
                placeholder="e.g. 25000"
                min="0"
                step="1"
                inputMode="decimal"
                autoFocus
              />
            </label>

            <label className="calc-label">
              Policy Term Remaining (years)
              <input
                type="number"
                className="calc-input"
                value={yearsRemaining}
                onChange={(e) => setYearsRemaining(e.target.value)}
                placeholder="1"
                min="1"
                max="50"
                step="1"
                inputMode="numeric"
              />
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                <div className="calc-result-row">
                  <span>Base Premium (excl. GST)</span>
                  <strong>{formatINR(result.basePremium)}</strong>
                </div>
                <div className="calc-result-row">
                  <span>Old GST @ 18%</span>
                  <strong className="calc-blocked">{formatINR(result.oldGstPerYear)}/yr</strong>
                </div>
                <div className="calc-result-row">
                  <span>New GST @ 0%</span>
                  <strong style={{ color: "#34d399" }}>₹0</strong>
                </div>
                <div className="calc-result-row">
                  <span>Old Premium (with GST)</span>
                  <strong>{formatINR(result.oldPremium)}/yr</strong>
                </div>
                <div className="calc-result-row">
                  <span>New Premium (GST 2.0)</span>
                  <strong style={{ color: "#34d399" }}>{formatINR(result.newPremium)}/yr</strong>
                </div>
                <div className="calc-result-row calc-total" style={{ color: "#34d399" }}>
                  <span>Annual Savings</span>
                  <strong>{formatINR(result.savingsPerYear)}/yr</strong>
                </div>
                {result.years > 1 && (
                  <div className="calc-result-row calc-total" style={{ color: "#34d399" }}>
                    <span>Total Savings ({result.years} years)</span>
                    <strong>{formatINR(result.totalSavings)}</strong>
                  </div>
                )}

                <div className="calc-result-actions">
                  <ShareButtons
                    path="/insurance-savings"
                    text={`I save ${formatINR(result.savingsPerYear)}/year on insurance thanks to GST 2.0! Check your savings free on DoAide GST`}
                  />
                </div>
              </div>
            )}
          </div>

          <section className="tool-info">
            <h2>Insurance Under GST 2.0</h2>
            <p>
              One of the biggest consumer-facing changes in GST 2.0 is the removal of GST
              on insurance premiums. Previously, all insurance products attracted 18% GST,
              making premiums significantly more expensive. Under GST 2.0, health insurance
              and life insurance have been moved to the Nil (0%) rate.
            </p>
            <h3>What This Means for Policyholders</h3>
            <ul>
              <li>Health insurance premiums drop by ~15.25% (the GST component of an inclusive price)</li>
              <li>Term life insurance premiums see the same reduction</li>
              <li>ULIPs and endowment plans also benefit from 0% GST</li>
              <li>Insurers must pass on the full benefit — anti-profiteering rules apply</li>
              <li>Existing policies should see reduced premiums at next renewal</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>Is GST removed from insurance under GST 2.0?</h3>
            <p>
              Yes. Health and life insurance premiums are now at 0% GST, down from 18%.
              This applies to new and existing policies.
            </p>

            <h3>When will I see the savings on my premium?</h3>
            <p>
              For new policies, the 0% rate applies immediately. For existing policies,
              the reduced premium will reflect at your next renewal. Contact your insurer
              if the 18% is still being charged.
            </p>

            <h3>Does the 0% GST apply to motor insurance?</h3>
            <p>
              Health and life insurance are confirmed at 0%. Motor insurance rates
              are subject to separate notifications — check with your insurer for
              the latest applicable rate.
            </p>
          </section>

          <EmailCapture
            source="insurance-savings"
            heading="Get insurance GST updates"
            subtext="Stay informed about insurance GST changes — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <RelatedTools current="/insurance-savings" />
          <CrossProductLinks page="insurance-savings" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
