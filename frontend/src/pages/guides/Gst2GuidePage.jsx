import { useState } from "react";
import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb";
import CrossProductLinks from "../../components/CrossProductLinks";
import DoAideFooter from "../../components/DoAideFooter";
import EmailCapture from "../../components/EmailCapture";
import RelatedTools from "../../components/RelatedTools";
import SeoHead from "../../components/SeoHead";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FAQ_ITEMS = [
  {
    q: "What is GST 2.0?",
    a: "GST 2.0 is the major rate rationalization of India's Goods and Services Tax. It simplifies the rate structure from 5 slabs (0%, 5%, 12%, 18%, 28%) to 3 slabs plus Nil (0%, 5%, 18%, 40%), abolishing the 12% and 28% slabs.",
  },
  {
    q: "When does GST 2.0 come into effect?",
    a: "GST 2.0 rate changes have been implemented through CBIC notifications in 2026. Different changes have different effective dates — check specific notifications for your product category.",
  },
  {
    q: "What happened to the 12% GST slab?",
    a: "The 12% slab has been abolished. Items previously at 12% have been moved to either 5% (essentials like cancer drugs) or 18% (most standard goods like smartphones, processed food).",
  },
  {
    q: "What happened to the 28% GST slab?",
    a: "The 28% slab has been abolished. Most items moved to 18% (cement, ACs, electronics). Premium and demerit goods like tobacco, aerated drinks, and luxury vehicles moved to the new 40% slab.",
  },
  {
    q: "Is insurance still taxed under GST 2.0?",
    a: "No. Health insurance and life insurance have been moved from 18% to 0% (Nil) under GST 2.0, providing significant savings for policyholders.",
  },
  {
    q: "What is the new 40% GST slab?",
    a: "The 40% slab replaces the old 28% + cess structure for premium and demerit goods: tobacco products, aerated drinks, motor vehicles above ₹20 lakh, motorcycles above 350cc, and luxury goods like yachts.",
  },
  {
    q: "What about compensation cess under GST 2.0?",
    a: "Compensation cess on tobacco has been eliminated from February 2026. The cess revenue is effectively folded into the new 40% rate for premium goods.",
  },
  {
    q: "Do I need to update my contracts for GST 2.0?",
    a: "Yes, if your contracts reference the old 12% or 28% rates. Use our Migration Checker tool to identify which contracts need updates and calculate the financial impact.",
  },
];

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "GST 2.0 Complete Guide — Everything You Need to Know About the New GST Rates",
  author: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  publisher: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  datePublished: "2026-10-08",
  dateModified: "2026-10-08",
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Guides", url: "https://gst.doaide.com/guides" },
  { name: "GST 2.0 Guide" },
];

export default function Gst2GuidePage() {
  usePageTitle("GST 2.0 Complete Guide — New GST Rates, Changes & Impact 2026");
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST 2.0 Complete Guide — New GST Rates, Changes & Impact 2026"
        description="Everything about GST 2.0: new rate structure (0%, 5%, 18%, 40%), abolished 12% and 28% slabs, insurance at 0%, 40% on tobacco, and what it means for your business."
        path="/guides/gst-2-guide"
        jsonLd={[ARTICLE_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container" style={{ maxWidth: 800 }}>
          <Breadcrumb />
          <h1 className="tool-title">GST 2.0 — Complete Guide to the New GST Rate Structure</h1>
          <p className="tool-subtitle">
            Everything you need to know about GST 2.0: the new 3-slab rate structure,
            abolished rates, and impact on your business.
          </p>

          <section className="tool-info">
            <h2>What is GST 2.0?</h2>
            <p>
              GST 2.0 is the most significant overhaul of India&#39;s Goods and Services Tax since
              its launch in 2017. The key objective is rate rationalization — simplifying the
              complex 5-slab structure into a cleaner 3-slab model plus Nil rate, while
              correcting anomalies like high taxes on essential items.
            </p>
          </section>

          <section className="tool-info">
            <h2>New Rate Structure</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr><th>Slab</th><th>What It Covers</th><th>Old Equivalent</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>0% (Nil)</strong></td>
                    <td>Essentials: fresh food, books, healthcare, education, insurance (health &amp; life), 33 life-saving medicines</td>
                    <td>0% (expanded)</td>
                  </tr>
                  <tr>
                    <td><strong>5%</strong></td>
                    <td>Common necessities: sugar, tea, transport, economy air travel, cancer drugs</td>
                    <td>5% (with some items from old 12%)</td>
                  </tr>
                  <tr>
                    <td><strong>18%</strong></td>
                    <td>Most goods and services: electronics, furniture, IT, cement, processed food, smartphones, banking</td>
                    <td>18% (absorbs most of old 12% and 28%)</td>
                  </tr>
                  <tr>
                    <td><strong>40%</strong></td>
                    <td>Premium &amp; demerit goods: tobacco, aerated drinks, vehicles &gt;₹20L, bikes &gt;350cc, luxury goods</td>
                    <td>28% + cess (consolidated)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p><em>Special rates of 0.25% (rough diamonds), 1.5% (gold bars), and 3% (jewellery) continue unchanged.</em></p>
          </section>

          <section className="tool-info">
            <h2>What Changed — Key Highlights</h2>
            <h3>Abolished Slabs</h3>
            <ul>
              <li><strong>12% slab abolished</strong> — items moved to 5% or 18% based on their nature</li>
              <li><strong>28% slab abolished</strong> — items moved to 18% or 40% based on their category</li>
            </ul>

            <h3>Major Rate Changes</h3>
            <ul>
              <li><strong>Insurance (health &amp; life):</strong> 18% → 0% — biggest consumer relief</li>
              <li><strong>Cancer drugs:</strong> 12% → 5% — healthcare affordability</li>
              <li><strong>33 life-saving medicines:</strong> moved to Nil rate</li>
              <li><strong>Cement:</strong> 28% → 18% — reduced construction costs</li>
              <li><strong>Tobacco products:</strong> 28% + cess → 40% — compensation cess eliminated from Feb 2026</li>
              <li><strong>Aerated drinks:</strong> 28% + 12% cess → 40% — simplified single rate</li>
              <li><strong>Luxury vehicles (&gt;₹20L):</strong> 28% + cess → 40%</li>
              <li><strong>Motorcycles (&gt;350cc):</strong> 28% + cess → 40%</li>
              <li><strong>Leasing without operator:</strong> now attracts same rate as underlying goods</li>
            </ul>

            <h3>ITC Changes</h3>
            <ul>
              <li><strong>Hard ITC validation blocks</strong> — the GST portal now automatically rejects ITC claims that don&#39;t match GSTR-2B</li>
              <li>Excess ITC claims will block GSTR-3B submission until resolved</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Impact on Businesses</h2>
            <h3>What You Need to Do</h3>
            <ol>
              <li><strong>Update your billing software</strong> — remove 12% and 28% rate options, add 40%</li>
              <li><strong>Review all contracts</strong> — identify agreements referencing old rates. Use our <Link to="/migration-checker">Migration Checker</Link></li>
              <li><strong>Update HSN rate mappings</strong> — verify current rates with <Link to="/hsn-sac-finder">HSN/SAC Finder</Link></li>
              <li><strong>Anti-profiteering compliance</strong> — if rates decreased, pass benefits to customers</li>
              <li><strong>Recalculate pricing</strong> — use the <Link to="/calculator">GST Calculator</Link> with new rates</li>
              <li><strong>Insurance premiums</strong> — demand 18% reduction from insurers. Check savings with our <Link to="/insurance-savings">Insurance Savings Calculator</Link></li>
              <li><strong>Reconcile ITC</strong> — ensure all claims match GSTR-2B before filing</li>
            </ol>
          </section>

          <section className="tool-info">
            <h2>GST 2.0 Tools</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
              <Link to="/rate-comparison" className="resources-card">
                <h3>Rate Comparison</h3>
                <p>Compare old vs new GST rates for any item</p>
              </Link>
              <Link to="/migration-checker" className="resources-card">
                <h3>Migration Checker</h3>
                <p>Check if your contracts need rate updates</p>
              </Link>
              <Link to="/insurance-savings" className="resources-card">
                <h3>Insurance Savings</h3>
                <p>Calculate your insurance GST savings</p>
              </Link>
              <Link to="/calculator" className="resources-card">
                <h3>GST Calculator</h3>
                <p>Calculate GST at the new rates</p>
              </Link>
            </div>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>
            <dl className="landing-faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="landing-faq-item">
                  <dt>
                    <button
                      className="landing-faq-q"
                      aria-expanded={openFaq === i}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      {item.q}
                      <span className="landing-faq-chevron" aria-hidden="true">{openFaq === i ? "−" : "+"}</span>
                    </button>
                  </dt>
                  {openFaq === i && <dd className="landing-faq-a">{item.a}</dd>}
                </div>
              ))}
            </dl>
          </section>

          <EmailCapture
            source="gst-2-guide"
            heading="Stay updated on GST 2.0"
            subtext="Get notified as more GST 2.0 changes are announced — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <RelatedTools current="/guides/gst-2-guide" />
          <CrossProductLinks page="guides" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
