import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import ShareButtons from "../../components/ShareButtons";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FEATURES = [
  { name: "GST Calculator", doaide: true, other: true },
  { name: "GSTIN Lookup & Verification", doaide: true, other: true },
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
  { name: "Free Tier (No Signup for Tools)", doaide: true, other: false },
];

const FAQ_ITEMS = [
  {
    q: "Is DoAide GST really free?",
    a: "Yes. DoAide GST offers all core tools — GST calculator, GSTIN lookup, HSN code search, and filing dates — completely free with no signup required. The full compliance platform is free for up to 50 invoices per month.",
  },
  {
    q: "How does DoAide GST compare to ClearTax for GST filing?",
    a: "Both support GSTR-1 and GSTR-3B filing. DoAide GST offers free AI invoice parsing and automatic GSTR-2B reconciliation. ClearTax is more established but charges for most filing features.",
  },
  {
    q: "Can I switch from ClearTax to DoAide GST?",
    a: "Yes. Start using DoAide GST immediately — no data migration needed. Upload your invoices and DoAide parses them automatically. Your GST filing history stays on the portal regardless of which software you use.",
  },
  {
    q: "Which is better for small businesses — DoAide GST or ClearTax?",
    a: "For small businesses, DoAide GST is better — generous free tier (50 invoices/month), AI invoice parsing, and simpler interface. ClearTax's free tools are limited and paid plans start at Rs 7,999/year.",
  },
  {
    q: "Does DoAide GST support e-invoicing?",
    a: "Yes. DoAide GST supports e-invoicing for businesses with turnover above the e-invoicing threshold. You can generate IRN numbers and manage e-invoices directly from the platform.",
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
  { name: "DoAide GST vs ClearTax" },
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

export default function ClearTaxCompare() {
  usePageTitle("DoAide GST vs ClearTax — Free GST Calculator & Tools Comparison");

  return (
    <div className="tool-page">
      <SeoHead
        title="DoAide GST vs ClearTax — Free GST Calculator & Tools Comparison"
        description="Compare DoAide GST with ClearTax. DoAide offers free GST calculator, GSTIN lookup, HSN search, and filing tools. See features, pricing, and which is better for your business."
        path="/compare/cleartax"
        jsonLd={FAQ_SCHEMA}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <div className="compare-hero">
            <h1>DoAide GST vs ClearTax &mdash; Detailed Comparison</h1>
            <p className="compare-intro">
              Choosing the right GST software can save your business hours every month.
              Here is a detailed comparison of DoAide GST and ClearTax across features,
              pricing, and ease of use to help you decide which platform fits your needs.
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
                    <th>ClearTax</th>
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
                  <li>GST calculator, GSTIN lookup, HSN search</li>
                  <li>GSTR-2B reconciliation included</li>
                  <li>AI invoice parsing included</li>
                  <li>Pro plan from Rs 499/month for higher volumes</li>
                </ul>
              </div>
              <div className="compare-pricing-card">
                <h3>ClearTax</h3>
                <div className="compare-price">From Rs 7,999/yr</div>
                <p className="compare-price-detail">Basic tools free, filing features require paid plans</p>
                <ul>
                  <li>Free GST calculator only</li>
                  <li>GST filing from Rs 7,999/year</li>
                  <li>Premium plans for reconciliation</li>
                  <li>Enterprise pricing for larger businesses</li>
                  <li>Signup required for most features</li>
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
                    <li>100% free core tools &mdash; no signup needed</li>
                    <li>AI-powered invoice parsing and data extraction</li>
                    <li>Automatic GSTR-2B reconciliation</li>
                    <li>Modern, clean user interface</li>
                    <li>Supplier compliance tracking included</li>
                    <li>Free for up to 50 invoices/month</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Newer platform (launched 2026)</li>
                    <li>Smaller user community compared to ClearTax</li>
                  </ul>
                </div>
              </div>
              <div className="compare-pros-cons-card">
                <h3>ClearTax</h3>
                <div className="compare-pros">
                  <h4>Pros</h4>
                  <ul>
                    <li>Established brand with large user base</li>
                    <li>Extensive documentation and support</li>
                    <li>Covers income tax and TDS alongside GST</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Expensive for small businesses</li>
                    <li>Complex interface with steep learning curve</li>
                    <li>Most features require paid subscription</li>
                    <li>Signup required even for basic tools</li>
                    <li>No AI-powered invoice parsing</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="compare-cta">
            <h2>Try DoAide GST Free</h2>
            <p>
              Get free access to GST calculator, GSTIN verification, HSN code search, and
              full GST compliance tools &mdash; no credit card, no signup required for tools.
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
              <Link to="/compare/zoho-gst">DoAide GST vs Zoho GST</Link>
              <Link to="/compare/tally">DoAide GST vs Tally Prime</Link>
              <Link to="/compare/busy">DoAide GST vs Busy Accounting</Link>
              <Link to="/best-gst-software">Best GST Software in India 2026</Link>
            </div>
            <ShareButtons
              path="/compare/cleartax"
              text="DoAide GST vs ClearTax — see the full comparison of free GST tools"
              label="Share this comparison"
            />
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
