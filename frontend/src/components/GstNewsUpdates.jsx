import { Link } from "react-router-dom";

const GST_NEWS = [
  {
    date: "Oct 2026",
    title: "GST 2.0 Rate Rationalisation in Effect",
    summary: "Revised 4-slab structure (5%, 12%, 18%, 28%) is now live. Health and life insurance GST reduced from 18% to 5%. Check if your business is affected.",
    link: "/guides/gst-2-guide",
    tag: "Rate Change",
  },
  {
    date: "Oct 2026",
    title: "GSTR-1 Due Date: 11 October 2026",
    summary: "File your GSTR-1 for September 2026 by 11th October. Late filing attracts ₹50/day penalty. Use our due dates calendar to stay on track.",
    link: "/due-dates",
    tag: "Deadline",
  },
  {
    date: "Sep 2026",
    title: "E-Invoice Mandatory for Turnover Above ₹5 Crore",
    summary: "All businesses with aggregate turnover exceeding ₹5 crore must generate e-invoices through the IRP. Non-compliance can lead to penalties.",
    link: "/guides/gst-registration-process",
    tag: "Compliance",
  },
  {
    date: "Sep 2026",
    title: "GSTR-9 Annual Return Filing Window Open",
    summary: "Annual return filing for FY 2025-26 is now open. Reconcile your monthly filings before submitting. Use our GSTR-9 checklist to avoid errors.",
    link: "/gstr9-checklist",
    tag: "Filing",
  },
];

const TAG_COLORS = {
  "Rate Change": "var(--accent)",
  Deadline: "#EF4444",
  Compliance: "#3B82F6",
  Filing: "#10B981",
};

export default function GstNewsUpdates() {
  return (
    <section className="gst-news" aria-labelledby="gst-news-heading">
      <h2 id="gst-news-heading" className="landing-section-title">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 8 }}>
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
        GST News &amp; Updates
      </h2>
      <div className="gst-news-grid">
        {GST_NEWS.map((item) => (
          <Link key={item.title} to={item.link} className="gst-news-card">
            <div className="gst-news-meta">
              <span
                className="gst-news-tag"
                style={{ backgroundColor: TAG_COLORS[item.tag] || "var(--accent)" }}
              >
                {item.tag}
              </span>
              <span className="gst-news-date">{item.date}</span>
            </div>
            <h3 className="gst-news-title">{item.title}</h3>
            <p className="gst-news-summary">{item.summary}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export { GST_NEWS };
