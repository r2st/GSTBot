import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../components/SeoHead";
import DoAideFooter from "../components/DoAideFooter";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";

const SOFTWARE_LIST = [
  {
    rank: 1, name: "DoAide GST", bestFor: "Best free GST tool",
    features: "GST calculator, GSTIN lookup, HSN search, AI invoice parsing, GSTR-2B reconciliation, filing prep, supplier tracking",
    pricing: "Free / Rs 499/mo", rating: "4.8",
    review: [
      "DoAide GST is the best free GST software in India.",
      "It offers a complete suite of GST tools including a calculator, GSTIN verification, HSN code search, and filing dates calendar — all without requiring signup.",
      "The paid plan adds AI-powered invoice parsing, automatic GSTR-2B reconciliation, ITC calculation, and GSTR-1/3B preparation for just Rs 499/month.",
      "Ideal for small businesses and CAs looking for a modern, web-based GST solution.",
    ].join(" "),
    link: "/",
  },
  {
    rank: 2, name: "ClearTax", bestFor: "Best for large enterprises",
    features: "GST filing, income tax, TDS, compliance suite, document management",
    pricing: "Rs 7,999/yr+", rating: "4.5",
    review: [
      "ClearTax is one of India's most established tax platforms covering GST, income tax, and TDS.",
      "It offers comprehensive filing features but most require paid plans starting at Rs 7,999/year.",
      "Best suited for larger businesses that need a full tax compliance suite.",
    ].join(" "),
    link: "/compare/cleartax",
  },
  {
    rank: 3, name: "Zoho GST (Zoho Books)", bestFor: "Best for Zoho users",
    features: "GST filing, accounting, invoicing, bank reconciliation, inventory, Zoho ecosystem integration",
    pricing: "Rs 1,499/mo+", rating: "4.4",
    review: [
      "Zoho GST is built into Zoho Books, making it ideal for businesses already in the Zoho ecosystem.",
      "It provides solid GST compliance features alongside full accounting.",
      "However, it cannot be used as a standalone GST tool and starts at Rs 1,499/month.",
    ].join(" "),
    link: "/compare/zoho-gst",
  },
  {
    rank: 4, name: "Tally Prime", bestFor: "Best for CAs",
    features: "Full accounting, GST filing, inventory, payroll, banking, TDS",
    pricing: "Rs 18,000/yr+", rating: "4.3",
    review: "Tally Prime is India's most-used accounting software with 30+ years of history. It includes GST filing alongside full accounting and inventory. Desktop-only (Windows), expensive, and lacks AI features.",
    link: "/compare/tally",
  },
  {
    rank: 5, name: "Busy Accounting", bestFor: "Best for SMEs",
    features: "Accounting, GST filing, inventory, payroll, purchase/sales management",
    pricing: "Rs 7,200/yr+", rating: "4.1",
    review: "Busy Accounting is a popular Indian accounting software for SMEs. It covers GST compliance alongside full accounting and inventory. Like Tally, it is desktop-only and requires Windows. Pricing starts at Rs 7,200/year.",
    link: "/compare/busy",
  },
  {
    rank: 6, name: "Marg ERP", bestFor: "Best for traders & distributors",
    features: "GST billing, inventory, barcode, distribution management, POS",
    pricing: "Rs 8,000/yr+", rating: "4.0",
    review: "Marg ERP is designed for traders and distributors with strong inventory management and GST billing. Includes barcode scanning, POS, and distribution management. Best for complex inventory needs.",
  },
  {
    rank: 7, name: "Vyapar", bestFor: "Best for micro businesses",
    features: "GST invoicing, billing, estimates, payment tracking, reports",
    pricing: "Free / Rs 4,999/yr", rating: "4.2",
    review: "Vyapar is a simple invoicing and billing app popular with small shopkeepers and freelancers. It offers basic GST invoicing with a mobile app. The free plan is limited; paid costs Rs 4,999/year.",
  },
  {
    rank: 8, name: "myBillBook", bestFor: "Best for billing",
    features: "GST billing, invoicing, estimates, inventory, payment reminders",
    pricing: "Free / Rs 2,999/yr", rating: "4.0",
    review: "MyBillBook focuses on billing and invoicing with built-in GST support. Good for businesses that primarily need invoice generation with GST compliance. Mobile-first with a simple interface.",
  },
  {
    rank: 9, name: "Saral GST", bestFor: "Best for filing-only",
    features: "GSTR-1, GSTR-3B, GSTR-9 filing, e-invoicing, reconciliation",
    pricing: "Rs 2,500/yr+", rating: "3.9",
    review: "Saral GST is a focused GST return filing tool. It handles GSTR-1, GSTR-3B, and GSTR-9 filing with basic reconciliation. No frills — just GST filing. Suitable for CAs who need a simple filing tool for multiple clients.",
  },
  {
    rank: 10, name: "Gen GST", bestFor: "Best for CA practices",
    features: "Bulk GST filing, multi-client management, GSTR-1/3B/9, e-filing",
    pricing: "Rs 4,000/yr+", rating: "3.8",
    review: "Gen GST by SAG Infotech is designed for CA practices handling bulk GST filings. It supports multi-client management and all major GST return types. The interface is functional but dated.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is the best free GST software in India?",
    a: "DoAide GST is the best free GST software in India. It offers GST calculator, GSTIN lookup, HSN code search, and filing dates calendar — all free, no signup. The full platform is free for up to 50 invoices per month.",
  },
  {
    q: "Which GST software is best for small businesses?",
    a: "For small businesses, DoAide GST is the top choice — free tier (50 invoices/month), simple interface, and AI invoice parsing. Vyapar and myBillBook are good options for basic billing.",
  },
  {
    q: "Is DoAide GST better than ClearTax?",
    a: "For small to medium businesses, DoAide GST offers better value with its free tier and AI features. ClearTax suits large enterprises needing a full tax compliance suite covering income tax and TDS alongside GST.",
  },
  {
    q: "Can I file GST returns for free?",
    a: "Yes. You can file GST returns for free on the GST portal (gst.gov.in) directly. DoAide GST helps prepare your returns for free (up to 50 invoices/month), then you submit them on the portal.",
  },
  {
    q: "What features should I look for in GST software?",
    a: "Key features: GST calculator, GSTIN verification, HSN code search, GSTR-2B reconciliation, ITC calculation, GSTR-1 and GSTR-3B prep, e-invoicing, and deadline alerts. AI invoice parsing saves significant time.",
  },
  {
    q: "Which GST software do CAs prefer?",
    a: "Many CAs prefer Tally Prime for its accounting depth and long history. Modern CAs increasingly use web tools like DoAide GST for GST work — AI features and multi-client support. Gen GST is popular for bulk filing.",
  },
  {
    q: "Is web-based or desktop GST software better?",
    a: "Web-based GST software like DoAide GST works on any device, updates automatically, and backs up data in the cloud. Desktop software like Tally offers offline access but is limited to one machine.",
  },
  {
    q: "How much does GST software cost in India?",
    a: "GST software in India ranges from free (DoAide GST) to Rs 54,000/year (Tally Prime Gold). Most paid options cost Rs 2,500 to Rs 18,000 per year. DoAide GST offers the best value with a free tier for 50 invoices/month.",
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

const ITEM_LIST_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: SOFTWARE_LIST.map((s) => ({
    "@type": "ListItem",
    position: s.rank,
    name: s.name,
    description: s.review,
  })),
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Best GST Software India" },
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

export default function BestGstSoftwarePage() {
  usePageTitle("10 Best GST Software in India 2026 — Free & Paid Compared");

  return (
    <div className="tool-page">
      <SeoHead
        title="10 Best GST Software in India 2026 — Free & Paid Compared"
        description="Compare the top 10 GST software solutions in India for 2026. Features, pricing, ratings, and reviews. Find the best free GST software for your business."
        path="/best-gst-software"
        jsonLd={[FAQ_SCHEMA, ITEM_LIST_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <div className="compare-hero">
            <h1>10 Best GST Software in India (2026) &mdash; Free &amp; Paid Options Compared</h1>
            <p className="compare-intro">
              Choosing the right GST software is critical for Indian businesses. The right tool saves
              hours on compliance every month, prevents costly filing errors, and ensures you claim
              every rupee of eligible Input Tax Credit.
            </p>
            <p className="compare-intro">
              We compared the top 10 GST software solutions available in India across features, pricing,
              ease of use, and user ratings to help you make the right choice. Whether you are a small
              shopkeeper, a growing SME, or a CA managing multiple clients, there is an option here
              for you.
            </p>
            <p className="blog-meta">Last updated: October 2026</p>
          </div>

          <section className="compare-section">
            <h2>Top 10 GST Software &mdash; Quick Comparison</h2>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Software</th>
                    <th>Best For</th>
                    <th>Pricing</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {SOFTWARE_LIST.map((s) => (
                    <tr key={s.rank} className={s.rank === 1 ? "compare-highlight-row" : ""}>
                      <td>{s.rank}</td>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.bestFor}</td>
                      <td>{s.pricing}</td>
                      <td>{s.rating}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="compare-section">
            <h2>Detailed Reviews</h2>
            {SOFTWARE_LIST.map((s) => (
              <div key={s.rank} className="best-gst-review">
                <h3>{s.rank}. {s.name} &mdash; {s.bestFor}</h3>
                <div className="best-gst-review-meta">
                  <span><strong>Pricing:</strong> {s.pricing}</span>
                  <span><strong>Rating:</strong> {s.rating}/5</span>
                </div>
                <p>{s.review}</p>
                <p className="best-gst-review-features"><strong>Key features:</strong> {s.features}</p>
                {s.link && (
                  <Link to={s.link} className="best-gst-review-link">
                    {s.rank === 1 ? "Try DoAide GST Free →" : `Compare with DoAide GST →`}
                  </Link>
                )}
              </div>
            ))}
          </section>

          <section className="compare-section">
            <h2>How We Ranked These GST Software Solutions</h2>
            <p>Our ranking considers the following criteria:</p>
            <ul>
              <li><strong>Features:</strong> Range of GST-specific tools including calculator, filing, reconciliation, and e-invoicing</li>
              <li><strong>Pricing:</strong> Value for money, with extra weight given to free tiers and affordable plans</li>
              <li><strong>Ease of use:</strong> Setup time, learning curve, and user interface quality</li>
              <li><strong>Accessibility:</strong> Web vs desktop, mobile access, multi-platform support</li>
              <li><strong>AI and automation:</strong> Invoice parsing, automatic reconciliation, smart features</li>
              <li><strong>Support:</strong> Documentation, customer support quality, and community</li>
            </ul>
          </section>

          <section className="compare-cta">
            <h2>Try DoAide GST Free &mdash; The #1 Free GST Software in India</h2>
            <p>
              Get free access to GST calculator, GSTIN verification, HSN code search,
              AI invoice parsing, and full GST compliance &mdash; no credit card required.
            </p>
            <div className="compare-cta-buttons">
              <Link to="/" className="btn btn-primary">Create Free Account</Link>
              <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
              <Link to="/pricing" className="btn compare-cta-secondary">View Pricing</Link>
            </div>
          </section>

          <FaqSection />

          <section className="compare-links">
            <h2>Detailed Comparisons</h2>
            <div className="compare-links-grid">
              <Link to="/compare/cleartax">DoAide GST vs ClearTax</Link>
              <Link to="/compare/zoho-gst">DoAide GST vs Zoho GST</Link>
              <Link to="/compare/tally">DoAide GST vs Tally Prime</Link>
              <Link to="/compare/busy">DoAide GST vs Busy Accounting</Link>
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
