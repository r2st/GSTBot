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

const QUESTIONS = [
  {
    key: "turnover_goods",
    question: "What is your annual aggregate turnover from sale of goods?",
    options: [
      { label: "Below ₹40 lakhs", value: "below_40" },
      { label: "₹40 lakhs – ₹1.5 crore", value: "40_to_150" },
      { label: "Above ₹1.5 crore", value: "above_150" },
    ],
  },
  {
    key: "turnover_services",
    question: "What is your annual aggregate turnover from services?",
    options: [
      { label: "Below ₹20 lakhs", value: "below_20" },
      { label: "₹20 lakhs – ₹50 lakhs", value: "20_to_50" },
      { label: "Above ₹50 lakhs", value: "above_50" },
    ],
  },
  {
    key: "special_state",
    question: "Is your business in a special category state (NE states, J&K, Himachal, Uttarakhand)?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    key: "interstate",
    question: "Do you make interstate supplies?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    key: "ecommerce",
    question: "Do you sell through e-commerce platforms (Amazon, Flipkart, etc.)?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    key: "reverse_charge",
    question: "Are you liable to pay tax under reverse charge?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    key: "agent",
    question: "Are you an agent or representative of a registered supplier?",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Registration Eligibility Checker",
  url: "https://gst.doaide.com/registration-checker",
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
      name: "What is the turnover limit for GST registration?",
      acceptedAnswer: { "@type": "Answer", text: "Goods: Rs 40 lakhs (Rs 20 lakhs in special states). Services: Rs 20 lakhs (Rs 10 lakhs in special states). Interstate and e-commerce sellers must register regardless." },
    },
    {
      "@type": "Question",
      name: "Is GST registration mandatory for e-commerce sellers?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. If you sell through e-commerce platforms like Amazon or Flipkart, GST registration is mandatory under Section 24 regardless of your turnover." },
    },
    {
      "@type": "Question",
      name: "Can I voluntarily register for GST below the threshold?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. Voluntary registration lets you claim Input Tax Credit on purchases and adds credibility for B2B transactions, even if your turnover is below the mandatory threshold." },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Registration Eligibility" },
];

function evaluate(answers) {
  const reasons = [];
  let mandatory = false;

  if (answers.interstate === "yes") {
    mandatory = true;
    reasons.push("Interstate supply of goods or services requires mandatory GST registration regardless of turnover.");
  }

  if (answers.ecommerce === "yes") {
    mandatory = true;
    reasons.push("Supplying goods through e-commerce operators requires mandatory GST registration under Section 24.");
  }

  if (answers.reverse_charge === "yes") {
    mandatory = true;
    reasons.push("Persons liable to pay tax under reverse charge mechanism must register under GST (Section 24).");
  }

  if (answers.agent === "yes") {
    mandatory = true;
    reasons.push("Agents or representatives making supplies on behalf of registered taxable persons must register.");
  }

  if (!mandatory) {
    const isSpecial = answers.special_state === "yes";

    if (answers.turnover_goods === "above_150") {
      mandatory = true;
      reasons.push("Your goods turnover exceeds ₹1.5 crore — GST registration is mandatory.");
    } else if (answers.turnover_goods === "40_to_150") {
      if (isSpecial) {
        mandatory = true;
        reasons.push("In special category states, the threshold for goods is ₹20 lakhs. Your turnover exceeds this limit.");
      } else {
        mandatory = true;
        reasons.push("Your goods turnover exceeds ₹40 lakhs — GST registration is mandatory.");
      }
    } else if (answers.turnover_goods === "below_40" && isSpecial) {
      if (answers.turnover_services !== "below_20") {
        mandatory = true;
        reasons.push("In special category states, the threshold is ₹10 lakhs for services. Your combined turnover may exceed this.");
      }
    }

    if (answers.turnover_services === "above_50") {
      mandatory = true;
      reasons.push("Your services turnover exceeds ₹50 lakhs — GST registration is mandatory.");
    } else if (answers.turnover_services === "20_to_50") {
      if (isSpecial) {
        mandatory = true;
        reasons.push("In special category states, the threshold for services is ₹10 lakhs. Your turnover exceeds this limit.");
      } else {
        mandatory = true;
        reasons.push("Your services turnover exceeds ₹20 lakhs — GST registration is mandatory.");
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push("Based on your answers, GST registration is not mandatory. However, you may still register voluntarily to claim Input Tax Credit.");
  }

  const compositionEligible =
    !mandatory ||
    (answers.turnover_goods !== "above_150" &&
      answers.turnover_services === "below_20" &&
      answers.interstate !== "yes" &&
      answers.ecommerce !== "yes");

  return { mandatory: reasons.length > 0 && mandatory, reasons, compositionEligible };
}

export default function RegistrationCheckerPage() {
  usePageTitle("GST Registration Eligibility Checker — Do I Need GST?");

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const allAnswered = QUESTIONS.every((q) => answers[q.key]);

  const result = useMemo(() => {
    if (!allAnswered) return null;
    return evaluate(answers);
  }, [answers, allAnswered]);

  function handleAnswer(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    }
  }

  function reset() {
    setStep(0);
    setAnswers({});
  }

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Registration Eligibility Checker — Do I Need GST?"
        description="Free quiz to check if you need GST registration in India. Answer 7 simple questions about your business to find out if GST registration is mandatory or optional."
        path="/registration-checker"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Registration Eligibility" }]} />
          <h1 className="tool-title">GST Registration Eligibility Checker</h1>
          <p className="tool-subtitle">
            Answer 7 simple questions to find out if you need GST registration. No sign-up required.
          </p>

          <div className="calc-card">
            {!result && (
              <>
                <div className="quiz-progress">
                  Question {step + 1} of {QUESTIONS.length}
                  <div className="quiz-progress-bar">
                    <div
                      className="quiz-progress-fill"
                      style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="quiz-question">
                  <h2 className="quiz-question-text">{QUESTIONS[step].question}</h2>
                  <div className="quiz-options">
                    {QUESTIONS[step].options.map((opt) => (
                      <button
                        key={opt.value}
                        className={`quiz-option${answers[QUESTIONS[step].key] === opt.value ? " selected" : ""}`}
                        onClick={() => handleAnswer(QUESTIONS[step].key, opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="quiz-nav">
                  {step > 0 && (
                    <button className="quiz-nav-btn" onClick={() => setStep(step - 1)}>
                      ← Previous
                    </button>
                  )}
                  {answers[QUESTIONS[step].key] && step < QUESTIONS.length - 1 && (
                    <button className="quiz-nav-btn" onClick={() => setStep(step + 1)}>
                      Next →
                    </button>
                  )}
                </div>
              </>
            )}

            {result && (
              <div className="calc-result" aria-live="polite">
                <div
                  className="calc-result-row calc-total"
                  style={{ color: result.mandatory ? "#f59e42" : "#34d399" }}
                >
                  <span>GST Registration</span>
                  <strong>{result.mandatory ? "Mandatory" : "Not Required"}</strong>
                </div>

                <ul style={{ margin: "0.75rem 0", paddingLeft: "1.25rem", fontSize: "0.95rem", lineHeight: 1.6 }}>
                  {result.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>

                {result.compositionEligible && result.mandatory && (
                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                    💡 You may be eligible for the <strong>Composition Scheme</strong> (lower tax rate, simpler filing) if your turnover is below ₹1.5 crore for goods.
                  </p>
                )}

                <div className="calc-result-actions">
                  <ShareButtons
                    path="/registration-checker"
                    text={`GST registration ${result.mandatory ? "mandatory" : "not required"} — checked free on DoAide GST`}
                  />
                  <PrintButton label="Print Result" />
                  <button className="quiz-nav-btn" onClick={reset} style={{ marginTop: "0.5rem" }}>
                    Check Again
                  </button>
                </div>
              </div>
            )}
          </div>

          <EmailCapture
            source="registration-checker"
            heading="Need help with GST registration?"
            subtext="Get a free step-by-step guide to register for GST in India."
            buttonLabel="Get Guide"
            compact
          />

          <section className="tool-info">
            <h2>Who Needs GST Registration?</h2>
            <p>
              GST registration is mandatory for businesses exceeding specified turnover thresholds,
              and for certain categories regardless of turnover.
            </p>
            <h3>Mandatory Registration (Section 22 & 24)</h3>
            <ul>
              <li><strong>Goods:</strong> Turnover above ₹40 lakhs (₹20 lakhs in special category states)</li>
              <li><strong>Services:</strong> Turnover above ₹20 lakhs (₹10 lakhs in special category states)</li>
              <li>Interstate supply of goods or services</li>
              <li>E-commerce operators and sellers on e-commerce platforms</li>
              <li>Persons required to pay tax under reverse charge</li>
              <li>Agents of registered suppliers</li>
              <li>Non-resident taxable persons</li>
              <li>Casual taxable persons</li>
            </ul>
            <h3>Voluntary Registration</h3>
            <p>
              Even if not mandatory, businesses can register voluntarily to claim Input Tax Credit
              on purchases and build credibility with B2B customers.
            </p>
          </section>

          <InlineCTA variant="invoice" />
          <RelatedTools current="/registration-checker" />
          <CrossProductLinks page="registration-checker" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
    </div>
  );
}
