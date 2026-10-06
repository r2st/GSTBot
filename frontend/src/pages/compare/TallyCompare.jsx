import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FEATURES = [
  { name: "Platform", doaide: "Web-based (any browser)", other: "Desktop software (Windows)" },
  { name: "GST Calculator", doaide: true, other: true },
  { name: "GSTIN Lookup & Verification", doaide: true, other: false },
  { name: "HSN / SAC Code Search", doaide: true, other: true },
  { name: "GST Filing Dates Calendar", doaide: true, other: false },
  { name: "GSTR-1 Filing", doaide: true, other: true },
  { name: "GSTR-3B Filing", doaide: true, other: true },
  { name: "GSTR-2B Reconciliation", doaide: true, other: true },
  { name: "E-Invoicing", doaide: true, other: true },
  { name: "ITC Calculator", doaide: true, other: true },
  { name: "AI Invoice Parsing", doaide: true, other: false },
  { name: "Multi-User Access", doaide: true, other: "Gold edition only" },
  { name: "Cloud Access", doaide: true, other: "TallyPrime Cloud add-on" },
  { name: "Mobile Access", doaide: true, other: false },
  { name: "Automatic Updates", doaide: true, other: false },
  { name: "Data Backup (Automatic)", doaide: true, other: false },
];

const FAQ_ITEMS = [
  {
    q: "Is DoAide GST better than Tally Prime for GST filing?",
    a: "For GST-specific needs, DoAide GST offers more features for free including AI invoice parsing, GSTIN lookup, and automatic GSTR-2B reconciliation. Tally Prime is a full accounting suite that includes GST but costs Rs 18,000 or more per year.",
  },
  {
    q: "Can I use DoAide GST without installing any software?",
    a: "Yes. DoAide GST is entirely web-based and works in any modern browser. No installation, no downloads, no Windows dependency. Tally Prime requires installation on a Windows PC.",
  },
  {
    q: "Is Tally Prime available on Mac or Linux?",
    a: "No. Tally Prime is Windows-only desktop software. DoAide GST works on any device with a browser — Windows, Mac, Linux, mobile phones, and tablets.",
  },
  {
    q: "How much does Tally Prime cost compared to DoAide GST?",
    a: "Tally Prime Silver costs Rs 18,000/year for a single user. Tally Prime Gold costs Rs 54,000/year for multi-user access. DoAide GST is free for up to 50 invoices/month, with Pro plans from Rs 499/month.",
  },
  {
    q: "Can my CA use DoAide GST to manage multiple businesses?",
    a: "Yes. DoAide GST supports multi-business management so your CA can handle multiple GSTIN numbers from a single account. This is included in the free tier.",
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
  { name: "DoAide GST vs Tally Prime" },
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

function renderCell(val) {
  if (typeof val === "string") return <td>{val}</td>;
  return <td className={val ? "compare-yes" : "compare-no"}>{val ? "✓" : "✗"}</td>;
}

export default function TallyCompare() {
  usePageTitle("DoAide GST vs Tally Prime — Web vs Desktop GST Software");

  return (
    <div className="tool-page">
      <SeoHead
        title="DoAide GST vs Tally Prime — Web vs Desktop GST Software Comparison"
        description="Compare DoAide GST (free, web-based) with Tally Prime (paid, desktop). Features, pricing, accessibility, and which GST software suits your business better."
        path="/compare/tally"
        jsonLd={FAQ_SCHEMA}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <div className="compare-hero">
            <h1>DoAide GST vs Tally Prime &mdash; Web-Based vs Desktop GST Software</h1>
            <p className="compare-intro">
              Tally Prime has been the go-to accounting software for Indian businesses for over
              30 years. DoAide GST is a modern, web-based GST compliance tool that works in
              any browser. This comparison covers the key differences in features, pricing,
              and accessibility.
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
                    <th>Tally Prime</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f) => (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      {renderCell(f.doaide)}
                      {renderCell(f.other)}
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
                <p className="compare-price-detail">Up to 50 invoices/month &mdash; no installation needed</p>
                <ul>
                  <li>All tools free with no signup</li>
                  <li>Works on any device &mdash; Windows, Mac, phone</li>
                  <li>AI invoice parsing included</li>
                  <li>Automatic updates and cloud backup</li>
                  <li>Pro plan from Rs 499/month</li>
                </ul>
              </div>
              <div className="compare-pricing-card">
                <h3>Tally Prime</h3>
                <div className="compare-price">From Rs 18,000/yr</div>
                <p className="compare-price-detail">Desktop software &mdash; Windows only</p>
                <ul>
                  <li>Silver: Rs 18,000/year (single user)</li>
                  <li>Gold: Rs 54,000/year (multi-user)</li>
                  <li>No free tier available</li>
                  <li>Cloud add-on at extra cost</li>
                  <li>Manual updates required</li>
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
                    <li>Free for up to 50 invoices/month</li>
                    <li>Web-based &mdash; no installation, works anywhere</li>
                    <li>AI-powered invoice parsing</li>
                    <li>Automatic updates and cloud data backup</li>
                    <li>Works on Mac, Linux, phones &mdash; not just Windows</li>
                    <li>Modern, intuitive user interface</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Requires internet connection</li>
                    <li>Newer platform, smaller user base</li>
                    <li>GST-focused &mdash; not a full accounting suite</li>
                  </ul>
                </div>
              </div>
              <div className="compare-pros-cons-card">
                <h3>Tally Prime</h3>
                <div className="compare-pros">
                  <h4>Pros</h4>
                  <ul>
                    <li>30+ years of history &mdash; trusted by CAs</li>
                    <li>Full accounting suite beyond GST</li>
                    <li>Works offline</li>
                    <li>Inventory management included</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Expensive &mdash; Rs 18,000 to Rs 54,000/year</li>
                    <li>Windows-only desktop software</li>
                    <li>No AI features</li>
                    <li>Manual updates required</li>
                    <li>Single-machine license (Silver)</li>
                    <li>Steep learning curve</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="compare-cta">
            <h2>Try DoAide GST Free</h2>
            <p>
              No download, no installation, no Windows requirement. Start using GST tools
              instantly in your browser &mdash; free forever for basic use.
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
              <Link to="/compare/zoho-gst">DoAide GST vs Zoho GST</Link>
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
