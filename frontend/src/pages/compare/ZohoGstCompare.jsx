import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FEATURES = [
  { name: "GST Calculator", doaide: true, other: true },
  { name: "GSTIN Lookup & Verification", doaide: true, other: false },
  { name: "HSN / SAC Code Search", doaide: true, other: true },
  { name: "GST Filing Dates Calendar", doaide: true, other: false },
  { name: "GSTR-1 Filing", doaide: true, other: true },
  { name: "GSTR-3B Filing", doaide: true, other: true },
  { name: "GSTR-2B Reconciliation", doaide: true, other: true },
  { name: "E-Invoicing", doaide: true, other: true },
  { name: "ITC Calculator", doaide: true, other: true },
  { name: "Invoice Management", doaide: true, other: true },
  { name: "AI Invoice Parsing", doaide: true, other: false },
  { name: "Supplier Compliance Tracking", doaide: true, other: false },
  { name: "Multi-Business Support", doaide: true, other: true },
  { name: "Standalone GST Tool (No Ecosystem)", doaide: true, other: false },
  { name: "API Access", doaide: true, other: true },
];

const FAQ_ITEMS = [
  {
    q: "Is DoAide GST free compared to Zoho GST?",
    a: "Yes. DoAide GST offers all core tools free with no signup. Zoho GST is part of Zoho Books which starts at Rs 1,499/month for the Standard plan. DoAide's free tier covers 50 invoices/month with full features.",
  },
  {
    q: "Do I need Zoho Books to use Zoho GST?",
    a: "Yes. Zoho GST features are built into Zoho Books, which is a full accounting suite. You cannot use Zoho GST as a standalone tool. DoAide GST is a standalone GST compliance tool that does not require any ecosystem.",
  },
  {
    q: "Can I switch from Zoho GST to DoAide GST?",
    a: "Yes. You can start using DoAide GST alongside or instead of Zoho GST. Upload your invoices and DoAide will parse them automatically. Your GST data on the GST portal remains accessible regardless of which software you use.",
  },
  {
    q: "Which is easier to set up — DoAide GST or Zoho GST?",
    a: "DoAide GST is significantly easier to set up. You can use the free tools instantly without creating an account. The full platform takes minutes to set up. Zoho GST requires setting up Zoho Books first, configuring your chart of accounts, and connecting to the Zoho ecosystem.",
  },
  {
    q: "Does DoAide GST have a mobile app like Zoho?",
    a: "DoAide GST is a progressive web app that works on any mobile browser. Zoho Books has a native mobile app. Both platforms are accessible on mobile devices.",
  },
];

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
  { name: "Compare", url: "https://gst.doaide.com/compare" },
  { name: "DoAide GST vs Zoho GST" },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <section className="compare-faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Frequently Asked Questions</h2>
      <dl className="compare-faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="compare-faq-item">
            <dt>
              <button
                className="compare-faq-q"
                aria-expanded={openIndex === i}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {item.q}
                <span aria-hidden="true">{openIndex === i ? "−" : "+"}</span>
              </button>
            </dt>
            {openIndex === i && <dd className="compare-faq-a">{item.a}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function ZohoGstCompare() {
  usePageTitle("DoAide GST vs Zoho GST — Free GST Software Comparison");

  return (
    <div className="tool-page">
      <SeoHead
        title="DoAide GST vs Zoho GST — Free GST Software Comparison"
        description="Compare DoAide GST with Zoho GST. See which free GST software is better for Indian businesses — features, pricing, ease of use, and filing support compared."
        path="/compare/zoho-gst"
        jsonLd={FAQ_SCHEMA}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <div className="compare-hero">
            <h1>DoAide GST vs Zoho GST &mdash; Which Free GST Software Is Better?</h1>
            <p className="compare-intro">
              Zoho GST is part of the Zoho Books accounting suite, while DoAide GST is a
              standalone GST compliance tool. This comparison helps you decide which
              platform is the right fit for your business needs and budget.
            </p>
          </div>

          <section className="compare-section">
            <h2>Feature Comparison</h2>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>DoAide GST</th>
                    <th>Zoho GST</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f) => (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      <td className={f.doaide ? "compare-yes" : "compare-no"}>{f.doaide ? "✓" : "✗"}</td>
                      <td className={f.other ? "compare-yes" : "compare-no"}>{f.other ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="compare-section">
            <h2>Pricing Comparison</h2>
            <div className="compare-pricing-grid">
              <div className="compare-pricing-card compare-pricing-highlight">
                <h3>DoAide GST</h3>
                <div className="compare-price">Free</div>
                <p className="compare-price-detail">Up to 50 invoices/month &mdash; no credit card required</p>
                <ul>
                  <li>All tools free with no signup</li>
                  <li>Standalone GST tool &mdash; no ecosystem needed</li>
                  <li>AI invoice parsing included</li>
                  <li>GSTR-2B reconciliation included</li>
                  <li>Pro plan from Rs 499/month</li>
                </ul>
              </div>
              <div className="compare-pricing-card">
                <h3>Zoho GST (Zoho Books)</h3>
                <div className="compare-price">From Rs 1,499/mo</div>
                <p className="compare-price-detail">Part of Zoho Books &mdash; GST is not available standalone</p>
                <ul>
                  <li>Free plan limited to 1 user, 1,000 invoices/year</li>
                  <li>Standard: Rs 1,499/month (3 users)</li>
                  <li>Professional: Rs 2,499/month (5 users)</li>
                  <li>Requires Zoho ecosystem</li>
                  <li>Annual billing discounts available</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="compare-section">
            <h2>Pros and Cons</h2>
            <div className="compare-pros-cons-grid">
              <div className="compare-pros-cons-card">
                <h3>DoAide GST</h3>
                <div className="compare-pros">
                  <h4>Pros</h4>
                  <ul>
                    <li>Standalone GST tool &mdash; no ecosystem lock-in</li>
                    <li>Free tier with all features for 50 invoices/month</li>
                    <li>AI-powered invoice parsing</li>
                    <li>Modern, intuitive interface</li>
                    <li>No signup required for free tools</li>
                    <li>Supplier compliance tracking</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Newer platform</li>
                    <li>Smaller user community</li>
                  </ul>
                </div>
              </div>
              <div className="compare-pros-cons-card">
                <h3>Zoho GST</h3>
                <div className="compare-pros">
                  <h4>Pros</h4>
                  <ul>
                    <li>Part of comprehensive Zoho business suite</li>
                    <li>Established platform with mobile app</li>
                    <li>Good for businesses already using Zoho</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Requires Zoho Books &mdash; cannot use standalone</li>
                    <li>Expensive starting at Rs 1,499/month</li>
                    <li>Complex setup for GST-only needs</li>
                    <li>No AI invoice parsing</li>
                    <li>No free GSTIN lookup tool</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="compare-cta">
            <h2>Try DoAide GST Free</h2>
            <p>
              Get free access to GST calculator, GSTIN verification, HSN code search, and
              full GST compliance tools &mdash; no ecosystem required.
            </p>
            <div className="compare-cta-buttons">
              <Link to="/" className="btn btn-primary">Create Free Account</Link>
              <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
            </div>
          </section>

          <FaqSection />

          <section className="compare-links">
            <h2>More Comparisons</h2>
            <div className="compare-links-grid">
              <Link to="/compare/cleartax">DoAide GST vs ClearTax</Link>
              <Link to="/compare/tally">DoAide GST vs Tally Prime</Link>
              <Link to="/compare/busy">DoAide GST vs Busy Accounting</Link>
              <Link to="/best-gst-software">Best GST Software in India 2026</Link>
            </div>
            <h2>Free GST Tools</h2>
            <div className="compare-links-grid">
              <Link to="/calculator">GST Calculator</Link>
              <Link to="/lookup">GSTIN Lookup</Link>
              <Link to="/hsn">HSN Code Search</Link>
              <Link to="/due-dates">Filing Dates Calendar</Link>
              <Link to="/guides">GST Guides</Link>
            </div>
          </section>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
