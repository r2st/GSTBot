import { Link, Outlet } from "react-router-dom";

const ARTICLES = [
  {
    slug: "gst-filing-guide-india-2026",
    title: "Complete Guide to GST Filing in India 2026",
    description: "Step-by-step guide to filing GST returns — GSTR-1, GSTR-3B, and GSTR-2B reconciliation explained for Indian businesses.",
  },
  {
    slug: "hsn-code-lookup",
    title: "HSN Code Lookup: Everything You Need to Know",
    description: "Understand HSN codes, how to find the right code for your goods, and why accurate HSN classification matters for GST compliance.",
  },
  {
    slug: "gst-compliance-checklist-small-business",
    title: "GST Compliance Checklist for Small Businesses",
    description: "A practical checklist for small businesses to stay GST-compliant — from registration to return filing and ITC claims.",
  },
];

export { ARTICLES };

export default function BlogLayout() {
  return (
    <div className="blog-layout">
      <header className="blog-header">
        <Link to="/" className="blog-home-link">← Back to DoAide GST</Link>
        <h1 className="blog-title">DoAide GST Blog</h1>
        <p className="blog-subtitle">Guides and resources for GST compliance in India</p>
      </header>
      <Outlet />
    </div>
  );
}

export function BlogIndex() {
  return (
    <div className="blog-index">
      {ARTICLES.map((a) => (
        <Link key={a.slug} to={`/blog/${a.slug}`} className="blog-card">
          <h2>{a.title}</h2>
          <p>{a.description}</p>
          <span className="blog-read-more">Read more →</span>
        </Link>
      ))}
    </div>
  );
}
