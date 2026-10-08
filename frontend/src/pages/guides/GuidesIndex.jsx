import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const GUIDES = [
  {
    to: "/guides/gst-registration",
    title: "How to Register for GST in India",
    desc: "Step-by-step guide to GST registration on the GST portal. Documents required, eligibility, timelines, and common mistakes to avoid.",
  },
  {
    to: "/guides/how-to-file-gstr-1",
    title: "How to File GSTR-1",
    desc: "Complete guide to filing GSTR-1 for outward supplies. Covers B2B, B2C, credit notes, HSN summary, and step-by-step portal walkthrough.",
  },
  {
    to: "/guides/how-to-file-gstr-3b",
    title: "How to File GSTR-3B",
    desc: "Step-by-step GSTR-3B filing guide. Covers output liability, ITC claim, tax payment, due dates, and common filing mistakes.",
  },
  {
    to: "/guides/input-tax-credit",
    title: "Complete Guide to Input Tax Credit (ITC)",
    desc: "Everything about ITC — eligibility, conditions under Section 16, blocked credits under Section 17(5), reversal rules, and practical examples.",
  },
  {
    to: "/guides/eway-bill",
    title: "E-Way Bill Guide for Businesses",
    desc: "Complete e-way bill guide — when required, how to generate, validity periods, exemptions, penalties, and state-specific rules.",
  },
  {
    to: "/guides/gst-registration-process",
    title: "GST Registration Process Step by Step 2026",
    desc: "Complete step-by-step guide to GST registration in India 2026. Documents, eligibility, portal walkthrough, and common mistakes.",
  },
  {
    to: "/guides/gst-return-calendar-2026-27",
    title: "GST Return Filing Calendar FY 2026-27",
    desc: "All due dates for GSTR-1, GSTR-3B, GSTR-9, CMP-08, and IFF. Monthly and quarterly filing deadlines at a glance.",
  },
  {
    to: "/guides/gst-rates-list-2026",
    title: "GST Rates List by Product Category 2026",
    desc: "Complete GST 2.0 rates list — all rate slabs (0%, 5%, 18%, 40%) with product categories, service rates, and HSN codes. Old 12% and 28% slabs abolished.",
  },
  {
    to: "/guides/gst-2-guide",
    title: "GST 2.0 Complete Guide",
    desc: "Everything about GST 2.0 — new rate structure, abolished slabs, insurance at 0%, 40% on tobacco, migration checklist, and impact on businesses.",
  },
];

const BLOG_ARTICLES = [
  {
    to: "/blog/gst-filing-guide-india-2026",
    title: "Complete Guide to GST Filing in India 2026",
    desc: "Comprehensive overview of all GST returns, due dates, and filing requirements for Indian businesses.",
  },
  {
    to: "/blog/hsn-code-lookup",
    title: "HSN Code Lookup Guide",
    desc: "How to find the correct HSN or SAC code for your products and services, with reporting requirements by turnover.",
  },
  {
    to: "/blog/gst-compliance-checklist-small-business",
    title: "GST Compliance Checklist for Small Businesses",
    desc: "Monthly and quarterly GST compliance checklist for small businesses to stay compliant and avoid penalties.",
  },
];

const TOOLS = [
  { to: "/calculator", title: "GST Calculator", desc: "Calculate CGST, SGST, IGST instantly" },
  { to: "/lookup", title: "GSTIN Lookup", desc: "Verify any GST number" },
  { to: "/hsn", title: "HSN Code Search", desc: "Find HSN/SAC codes and GST rates" },
  { to: "/due-dates", title: "Due Dates Calendar", desc: "GST filing deadlines" },
  { to: "/penalty-calculator", title: "Penalty Calculator", desc: "Late filing penalties & interest" },
  { to: "/eway-bill", title: "E-Way Bill Checker", desc: "Check if e-way bill is needed" },
  { to: "/input-tax-credit", title: "ITC Eligibility", desc: "Check Input Tax Credit eligibility" },
  { to: "/gstin-validator", title: "GSTIN Validator", desc: "Validate GSTIN format & check digit" },
  { to: "/scheme-comparison", title: "Scheme Comparison", desc: "Regular vs Composition scheme" },
  { to: "/payment-challan", title: "Payment Challan", desc: "GST PMT-06 challan helper" },
  { to: "/itc-calculator", title: "ITC Calculator", desc: "Calculate Input Tax Credit amount" },
];

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "GST Guides" },
];

export default function GuidesIndex() {
  usePageTitle("GST Guides & Tutorials — Free Step-by-Step GST Help");

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Guides & Tutorials — Free Step-by-Step GST Help for Indian Businesses"
        description="Free GST guides and tutorials for Indian businesses. Learn how to register for GST, file GSTR-1, file GSTR-3B, and stay compliant with step-by-step instructions."
        path="/guides"
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container" style={{ maxWidth: 800 }}>
          <h1 className="tool-title">GST Guides &amp; Tutorials</h1>
          <p className="tool-subtitle">
            Step-by-step guides for GST registration, return filing, and compliance
            in India. Written for business owners, accountants, and CAs.
          </p>

          <section className="resources-section" aria-labelledby="guides-heading">
            <h2 id="guides-heading" className="resources-heading">Step-by-Step Guides</h2>
            <div className="resources-grid">
              {GUIDES.map((g) => (
                <Link key={g.to} to={g.to} className="resources-card">
                  <h3>{g.title}</h3>
                  <p>{g.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="resources-section" aria-labelledby="articles-heading">
            <h2 id="articles-heading" className="resources-heading">GST Articles</h2>
            <div className="resources-grid">
              {BLOG_ARTICLES.map((a) => (
                <Link key={a.to} to={a.to} className="resources-card">
                  <h3>{a.title}</h3>
                  <p>{a.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="resources-section" aria-labelledby="tools-heading">
            <h2 id="tools-heading" className="resources-heading">Free GST Tools</h2>
            <div className="resources-grid">
              {TOOLS.map((t) => (
                <Link key={t.to} to={t.to} className="resources-card">
                  <h3>{t.title}</h3>
                  <p>{t.desc}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="resources-section" aria-labelledby="compare-heading">
            <h2 id="compare-heading" className="resources-heading">GST Software Comparisons</h2>
            <div className="resources-grid">
              <Link to="/best-gst-software" className="resources-card">
                <h3>Best GST Software in India 2026</h3>
                <p>Compare top 10 GST solutions &mdash; features, pricing, and ratings.</p>
              </Link>
              <Link to="/compare/cleartax" className="resources-card">
                <h3>DoAide GST vs ClearTax</h3>
                <p>Detailed comparison of features, pricing, and ease of use.</p>
              </Link>
            </div>
          </section>

          <section className="compare-cta">
            <h2>Start Using DoAide GST Free</h2>
            <p>
              All GST tools are free &mdash; calculator, GSTIN lookup, HSN search, and more.
              Sign up for free GSTR-2B reconciliation and filing prep.
            </p>
            <div className="compare-cta-buttons">
              <Link to="/" className="btn btn-primary">Create Free Account</Link>
              <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
            </div>
          </section>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
