import { Link } from "react-router-dom";
import SeoHead from "../components/SeoHead";
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
    to: "/penalty-calculator",
    title: "Penalty Calculator",
    desc: "Calculate late filing penalties and interest for GSTR-1, GSTR-3B, and GSTR-9. Get exact late fees based on days of delay.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    to: "/eway-bill",
    title: "E-Way Bill Checker",
    desc: "Check if your shipment requires an e-way bill under GST. Enter consignment value and distance for instant results.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    to: "/input-tax-credit",
    title: "ITC Eligibility Checker",
    desc: "Check if your purchase qualifies for Input Tax Credit under GST. Covers blocked credits and Section 16 conditions.",
    icon: (
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
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
    to: "/guides/gst-registration",
    title: "How to Register for GST in India",
    desc: "Step-by-step GST registration guide. Documents required, eligibility, and common mistakes to avoid.",
  },
  {
    to: "/guides/how-to-file-gstr-1",
    title: "How to File GSTR-1",
    desc: "Complete guide to filing GSTR-1 for outward supplies. B2B, B2C, credit notes, and HSN summary.",
  },
  {
    to: "/guides/how-to-file-gstr-3b",
    title: "How to File GSTR-3B",
    desc: "Step-by-step GSTR-3B filing guide. Output liability, ITC claim, tax payment, and penalties.",
  },
  {
    to: "/blog/gst-filing-guide-india-2026",
    title: "GST Filing Guide for India 2026",
    desc: "Comprehensive overview of all GST returns, due dates, and filing requirements.",
  },
  {
    to: "/blog/hsn-code-lookup",
    title: "HSN Code Lookup Guide",
    desc: "How to find the correct HSN or SAC code for your products and services.",
  },
  {
    to: "/blog/gst-compliance-checklist-small-business",
    title: "GST Compliance Checklist",
    desc: "Monthly and quarterly GST compliance checklist for small businesses.",
  },
  {
    to: "/guides/input-tax-credit",
    title: "Input Tax Credit Guide",
    desc: "Complete ITC guide — eligibility, blocked credits, reversal rules, and practical examples.",
  },
  {
    to: "/guides/eway-bill",
    title: "E-Way Bill Guide",
    desc: "E-way bill rules, generation process, validity periods, exemptions, and penalties.",
  },
];

export default function ResourcesPage() {
  usePageTitle("Free GST Tools & Resources — Calculator, GSTIN Lookup, HSN Search");

  return (
    <div className="tool-page">
      <SeoHead
        title="Free GST Tools & Resources — Calculator, GSTIN Lookup, HSN Search"
        description="Complete collection of free GST tools for Indian businesses — GST calculator, GSTIN verification, HSN code search, filing due dates, and compliance guides."
        path="/resources"
      />
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

          <section className="resources-section" aria-labelledby="compare-heading">
            <h2 id="compare-heading" className="resources-heading">Compare GST Software</h2>
            <div className="resources-grid">
              <Link to="/best-gst-software" className="resources-card">
                <h3>Best GST Software in India 2026</h3>
                <p>Top 10 GST solutions compared &mdash; features, pricing, and ratings.</p>
              </Link>
              <Link to="/compare/cleartax" className="resources-card">
                <h3>DoAide GST vs ClearTax</h3>
                <p>Feature, pricing, and ease-of-use comparison.</p>
              </Link>
              <Link to="/compare/zoho-gst" className="resources-card">
                <h3>DoAide GST vs Zoho GST</h3>
                <p>Standalone vs ecosystem-based GST tools compared.</p>
              </Link>
              <Link to="/compare/tally" className="resources-card">
                <h3>DoAide GST vs Tally Prime</h3>
                <p>Web-based vs desktop GST software comparison.</p>
              </Link>
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
