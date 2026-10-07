import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import ShareButtons from "../../components/ShareButtons";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FEATURES = [
  { name: "Platform", doaide: "Web-based (any browser)", other: "Desktop (Windows)" },
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
  { name: "Inventory Management", doaide: false, other: true },
  { name: "Multi-User Access", doaide: true, other: "Enterprise only" },
  { name: "Cloud Access", doaide: true, other: false },
  { name: "Mobile Access", doaide: true, other: false },
];

const FAQ_ITEMS = [
  {
    q: "Is DoAide GST free compared to Busy Accounting?",
    a: "Yes. DoAide GST is free for up to 50 invoices/month with all GST tools included. Busy Accounting starts at Rs 7,200/year for the Basic edition with limited features.",
  },
  {
    q: "Can Busy Accounting work on Mac or mobile?",
    a: "No. Busy Accounting is Windows-only desktop software with no mobile or Mac support. DoAide GST is web-based and works on any device with a browser.",
  },
  {
    q: "Does Busy Accounting have AI features?",
    a: "No. Busy Accounting does not include AI-powered features. DoAide GST offers AI invoice parsing that automatically extracts data from uploaded invoices in any format.",
  },
  {
    q: "Which is better for a small shop — DoAide GST or Busy?",
    a: "For a small shop, DoAide GST is the better choice — free, works on any device, and handles GST calculations, filing, and reconciliation. Busy is better if you need full inventory and accounting alongside GST.",
  },
  {
    q: "Can I use both DoAide GST and Busy Accounting?",
    a: "Yes. Many businesses use Busy for accounting and inventory while using DoAide GST for its free tools like the GST calculator, GSTIN lookup, and HSN code search.",
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
  { name: "DoAide GST vs Busy Accounting" },
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

export default function BusyCompare() {
  usePageTitle("DoAide GST vs Busy Accounting — Free vs Paid GST Software");

  return (
    <div className="tool-page">
      <SeoHead
        title="DoAide GST vs Busy Accounting — Free vs Paid GST Software Comparison"
        description="Compare DoAide GST (free, web-based) with Busy Accounting (paid, desktop). Features, pricing, and ease of use compared for Indian businesses."
        path="/compare/busy"
        jsonLd={FAQ_SCHEMA}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <div className="compare-hero">
            <h1>DoAide GST vs Busy Accounting &mdash; Comprehensive Comparison</h1>
            <p className="compare-intro">
              Busy Accounting is an Indian desktop accounting software popular with SMEs.
              DoAide GST is a modern, web-based GST compliance tool. This comparison covers
              features, pricing, and which is the better fit for your GST needs.
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
                    <th>Busy Accounting</th>
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
                  <li>AI invoice parsing included</li>
                  <li>GSTR-2B reconciliation included</li>
                  <li>Cloud-based with automatic backup</li>
                  <li>Pro plan from Rs 499/month</li>
                </ul>
              </div>
              <div className="compare-pricing-card">
                <h3>Busy Accounting</h3>
                <div className="compare-price">From Rs 7,200/yr</div>
                <p className="compare-price-detail">Desktop software &mdash; Windows only</p>
                <ul>
                  <li>Basic: Rs 7,200/year</li>
                  <li>Standard: Rs 14,400/year</li>
                  <li>Enterprise: Rs 24,000/year</li>
                  <li>No free tier</li>
                  <li>Additional cost for multi-user</li>
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
                    <li>Web-based &mdash; works on any device</li>
                    <li>AI-powered invoice parsing</li>
                    <li>Modern, clean interface</li>
                    <li>Automatic cloud backup</li>
                    <li>No installation required</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>GST-focused &mdash; no full accounting suite</li>
                    <li>No inventory management</li>
                    <li>Newer platform</li>
                  </ul>
                </div>
              </div>
              <div className="compare-pros-cons-card">
                <h3>Busy Accounting</h3>
                <div className="compare-pros">
                  <h4>Pros</h4>
                  <ul>
                    <li>Full accounting suite with inventory</li>
                    <li>Established in Indian market</li>
                    <li>Payroll management included</li>
                    <li>Works offline</li>
                  </ul>
                </div>
                <div className="compare-cons">
                  <h4>Cons</h4>
                  <ul>
                    <li>Windows-only desktop software</li>
                    <li>Dated user interface</li>
                    <li>Steep learning curve</li>
                    <li>No AI features</li>
                    <li>No cloud or mobile access</li>
                    <li>Starts at Rs 7,200/year with no free tier</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="compare-cta">
            <h2>Try DoAide GST Free</h2>
            <p>
              Start with free GST tools instantly &mdash; no download, no Windows requirement,
              no credit card.
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
              <Link to="/compare/tally">DoAide GST vs Tally Prime</Link>
              <Link to="/best-gst-software">Best GST Software in India 2026</Link>
            </div>
            <ShareButtons
              path="/compare/busy"
              text="DoAide GST vs Busy Accounting — see the full comparison of free GST tools"
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
