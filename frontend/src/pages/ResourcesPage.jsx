import { Link } from "react-router-dom";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";

const TOOLS = [
  {
    to: "/calculator",
    title: "GST Calculator",
    desc: "Calculate CGST, SGST, and IGST tax breakdown instantly for any amount and GST rate slab. Supports both inclusive and exclusive calculations.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="10" y2="14" /><line x1="14" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="16" y2="18" />
      </svg>
    ),
  },
  {
    to: "/lookup",
    title: "GSTIN Verification",
    desc: "Verify any GST Identification Number instantly. Check state code, PAN, entity number, and check digit validity — no sign-up required.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    to: "/hsn",
    title: "HSN Code Search",
    desc: "Search HSN and SAC codes by product or service name. Find the correct GST rate for any item — covers all 5 GST slabs.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    to: "/due-dates",
    title: "GST Filing Due Dates",
    desc: "Complete calendar of GST filing deadlines for FY 2025-26 and 2026-27 — GSTR-1, GSTR-3B, GSTR-9, GSTR-9C, CMP-08, and IFF.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    to: "/embed",
    title: "Embed GST Widgets",
    desc: "Add free GST calculator, GSTIN lookup, or HSN code finder widgets to your own website with a single line of code.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
];

const GUIDES = [
  {
    to: "/blog/gst-filing-guide-india-2026",
    title: "GST Filing Guide for India 2026",
    desc: "Step-by-step guide to filing GSTR-1, GSTR-3B, and annual returns. Covers registration, invoicing, ITC, and common mistakes.",
  },
  {
    to: "/blog/hsn-code-lookup",
    title: "HSN Code Lookup Guide",
    desc: "How to find the correct HSN or SAC code for your products and services. Includes reporting requirements by turnover.",
  },
  {
    to: "/blog/gst-compliance-checklist-small-business",
    title: "GST Compliance Checklist for Small Businesses",
    desc: "Monthly and quarterly GST compliance checklist — what to file, when, and how to avoid penalties.",
  },
];

export default function ResourcesPage() {
  usePageTitle("Free GST Tools & Resources — Calculator, GSTIN Lookup, HSN Search");

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <h1 className="tool-title">Free GST Tools &amp; Resources</h1>
          <p className="tool-subtitle">
            Everything you need for GST compliance in India — free online tools and
            guides for calculating GST, verifying GSTIN numbers, searching HSN codes,
            and filing returns on time.
          </p>

          <section className="resources-section" aria-labelledby="tools-heading">
            <h2 id="tools-heading" className="resources-heading">Free GST Tools</h2>
            <div className="resources-grid">
              {TOOLS.map((t) => (
                <Link key={t.to} to={t.to} className="resources-card">
                  <div className="resources-icon">{t.icon}</div>
                  <h3>{t.title}</h3>
                  <p>{t.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="resources-section" aria-labelledby="guides-heading">
            <h2 id="guides-heading" className="resources-heading">GST Guides &amp; Articles</h2>
            <div className="resources-grid">
              {GUIDES.map((g) => (
                <Link key={g.to} to={g.to} className="resources-card">
                  <h3>{g.title}</h3>
                  <p>{g.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="resources-section" aria-labelledby="product-heading">
            <h2 id="product-heading" className="resources-heading">GST Compliance Platform</h2>
            <div className="resources-grid">
              <div className="resources-card resources-cta-card">
                <h3>Automate Your GST Filing</h3>
                <p>
                  Upload invoices, auto-reconcile with GSTR-2B, calculate ITC, and prepare
                  GSTR-1 &amp; GSTR-3B returns — free for up to 50 invoices/month.
                </p>
                <Link to="/" className="btn btn-primary resources-signup-btn">
                  Sign Up Free
                </Link>
              </div>
              <Link to="/pricing" className="resources-card">
                <h3>Pricing Plans</h3>
                <p>
                  Free forever for up to 50 invoices/month. Pro plans from ₹499/month
                  for higher volumes with priority support.
                </p>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
