import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Breadcrumb from "../components/Breadcrumb";
import DeadlineBanner from "../components/DeadlineBanner";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import CrossProductLinks from "../components/CrossProductLinks";
import RelatedTools from "../components/RelatedTools";
import SavedCalculations, { getSavedCalcs, SaveCalcButton } from "../components/SavedCalculations";
import SavePrompt, { getCalcCount, incrementCalcCount } from "../components/SavePrompt";
import SeoHead from "../components/SeoHead";
import PrintButton from "../components/PrintButton";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { calcUrl, calculate, formatINR, GST_SLABS, parseCalcParams, reverseCalculate } from "../lib/gstCalc";
import { track } from "../lib/track";

export default function CalculatorPage() {
  usePageTitle("Free GST Calculator — Calculate CGST, SGST, IGST Instantly");
  const location = useLocation();
  const navigate = useNavigate();

  const initial = parseCalcParams(location.search);
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : "");
  const [rate, setRate] = useState(initial.rate != null ? initial.rate : 18);
  const [interstate, setInterstate] = useState(initial.interstate);
  const [mode, setMode] = useState("exclusive");
  const [calcCount, setCalcCount] = useState(getCalcCount);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [savedCalcs, setSavedCalcs] = useState(getSavedCalcs);

  const parsed = parseFloat(amount);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  const result = useMemo(
    () =>
      valid
        ? mode === "inclusive"
          ? reverseCalculate(parsed, rate, { interstate })
          : calculate(parsed, rate, { interstate })
        : null,
    [valid, mode, parsed, rate, interstate],
  );

  useEffect(() => {
    if (valid) {
      const url = calcUrl(parsed, rate, interstate);
      if (location.search !== url.replace("/calculator", "")) {
        navigate(url, { replace: true });
      }
    }
  }, [parsed, rate, interstate, valid, navigate, location.search]);

  useEffect(() => {
    if (result) {
      track("gst_calculate", { amount: result.taxable, rate });
      setCalcCount(incrementCalcCount());
    }
  }, [result, rate]);

  return (
    <div className="tool-page">
      <SeoHead
        title="Free GST Calculator Online - Calculate CGST, SGST, IGST"
        description="Calculate GST instantly for any amount. Get CGST, SGST, IGST breakdown with inclusive/exclusive modes. Example: 18% GST on ₹10,000 = ₹1,800 tax, ₹11,800 total."
        path="/calculator"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Free GST Calculator",
            url: "https://gst.doaide.com/calculator",
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              { "@type": "Question", name: "How do I calculate GST on a product?", acceptedAnswer: { "@type": "Answer", text: "Multiply the taxable amount by the GST rate percentage and divide by 100. For example, 18% GST on ₹10,000 = ₹10,000 × 18/100 = ₹1,800. The total becomes ₹11,800. For intrastate sales, split equally into CGST and SGST (₹900 each)." } },
              { "@type": "Question", name: "What is the difference between GST exclusive and inclusive?", acceptedAnswer: { "@type": "Answer", text: "GST exclusive means the price does not include GST — you add GST on top. GST inclusive means GST is already included in the price — you extract it. Formula for inclusive: Taxable amount = Total / (1 + GST rate/100)." } },
              { "@type": "Question", name: "When is IGST charged instead of CGST+SGST?", acceptedAnswer: { "@type": "Answer", text: "IGST is charged on interstate supplies (supplier and buyer in different states). CGST+SGST is charged on intrastate supplies (same state). The total GST amount is the same — only the split differs." } },
              { "@type": "Question", name: "What are the GST rate slabs in India?", acceptedAnswer: { "@type": "Answer", text: "India has 5 GST slabs: 0% (essentials like milk, grains), 5% (sugar, tea, transport), 12% (processed food, medicines), 18% (most goods and services), and 28% (luxury goods, cars, cement, tobacco)." } },
            ],
          },
        ]}
      />
      <ToolsNav />
      <DeadlineBanner />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">GST Calculator</h1>
          <p className="tool-subtitle">
            Calculate GST tax breakdown instantly. No sign-up required.
          </p>

          <div className="calc-card">
            <div className="calc-mode-toggle" role="group" aria-label="Calculation mode">
              <button
                className={`calc-mode-btn${mode === "exclusive" ? " active" : ""}`}
                onClick={() => setMode("exclusive")}
              >
                GST Exclusive
              </button>
              <button
                className={`calc-mode-btn${mode === "inclusive" ? " active" : ""}`}
                onClick={() => setMode("inclusive")}
              >
                GST Inclusive
              </button>
            </div>

            <label className="calc-label">
              {mode === "inclusive" ? "Total amount (including GST)" : "Taxable amount (excluding GST)"}
              <input
                type="number"
                className="calc-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount in ₹"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
              />
            </label>

            <label className="calc-label">
              GST Rate (%)
              <select
                className="calc-select"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              >
                {GST_SLABS.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>

            <label className="calc-checkbox-label">
              <input
                type="checkbox"
                checked={interstate}
                onChange={(e) => setInterstate(e.target.checked)}
              />
              Interstate supply (IGST instead of CGST + SGST)
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                <div className="calc-result-row">
                  <span>Taxable Value</span>
                  <strong>{formatINR(result.taxable)}</strong>
                </div>
                {result.interstate ? (
                  <div className="calc-result-row">
                    <span>IGST ({rate}%)</span>
                    <strong>{formatINR(result.igst)}</strong>
                  </div>
                ) : (
                  <>
                    <div className="calc-result-row">
                      <span>CGST ({rate / 2}%)</span>
                      <strong>{formatINR(result.cgst)}</strong>
                    </div>
                    <div className="calc-result-row">
                      <span>SGST ({rate / 2}%)</span>
                      <strong>{formatINR(result.sgst)}</strong>
                    </div>
                  </>
                )}
                <div className="calc-result-row calc-total">
                  <span>Total</span>
                  <strong>{formatINR(result.total)}</strong>
                </div>

                <div className="calc-result-actions">
                  <ShareButtons
                    path={calcUrl(result.taxable, rate, interstate)}
                    text={`GST on ${formatINR(result.taxable)} at ${rate}%: Total ${formatINR(result.total)} — calculated free on DoAide GST`}
                  />
                  <SaveCalcButton result={result} rate={rate} onSaved={setSavedCalcs} />
                  <PrintButton label="Print Result" />
                </div>
              </div>
            )}
          </div>

          {!promptDismissed && (
            <SavePrompt
              calcCount={calcCount}
              onDismiss={() => setPromptDismissed(true)}
            />
          )}

          <SavedCalculations calcs={savedCalcs} onUpdate={setSavedCalcs} />

          {result && (
            <EmailCapture
              source="calculator"
              heading="Get notified about GST rate changes"
              subtext="Stay updated when GST rates change — free email alerts."
              buttonLabel="Notify Me"
              compact
            />
          )}

          <section className="tool-info">
            <h2>How GST Calculation Works</h2>
            <p>
              GST in India is levied at the point of sale. For intrastate sales (within the same
              state), the tax is split equally between CGST (Central GST) and SGST (State GST).
              For interstate sales, IGST (Integrated GST) applies as a single tax.
            </p>
            <h3>GST Rate Slabs in India</h3>
            <ul>
              <li><strong>0%</strong> — Essential goods: milk, fresh vegetables, grains, books</li>
              <li><strong>5%</strong> — Common necessities: sugar, tea, cooking oil, transport</li>
              <li><strong>12%</strong> — Processed food, medicines, garments above ₹1,000</li>
              <li><strong>18%</strong> — Most goods and services: electronics, furniture, IT services</li>
              <li><strong>28%</strong> — Luxury and sin goods: cars, AC, cement, soft drinks, tobacco</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>How do I calculate GST on a product?</h3>
            <p>
              Multiply the taxable amount by the GST rate and divide by 100. For example,
              18% GST on ₹10,000 = ₹1,800 tax, total ₹11,800. For intrastate sales, the
              tax splits equally into CGST and SGST (₹900 each).
            </p>

            <h3>What is the difference between GST exclusive and inclusive?</h3>
            <p>
              Exclusive means GST is added on top of the price. Inclusive means GST is
              already included — you extract it. Formula: Taxable = Total ÷ (1 + rate/100).
            </p>

            <h3>When is IGST charged instead of CGST+SGST?</h3>
            <p>
              IGST applies to interstate supplies (different states). CGST+SGST applies to
              intrastate supplies (same state). The total GST amount is identical.
            </p>

            <h3>What are the GST rate slabs in India?</h3>
            <p>
              Five slabs: 0% (essentials), 5% (necessities), 12% (processed food, medicines),
              18% (most goods and services), and 28% (luxury goods, tobacco).
            </p>
          </section>

          <RelatedTools current="/calculator" />
          <CrossProductLinks page="calculator" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
