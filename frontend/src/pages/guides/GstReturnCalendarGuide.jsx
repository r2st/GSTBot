import { useState } from "react";
import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb";
import CrossProductLinks from "../../components/CrossProductLinks";
import DoAideFooter from "../../components/DoAideFooter";
import EmailCapture from "../../components/EmailCapture";
import RelatedTools from "../../components/RelatedTools";
import SeoHead from "../../components/SeoHead";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const GSTR1_DATES = [
  { period: "April 2026", monthly: "May 11, 2026", quarterly: "—" },
  { period: "May 2026", monthly: "Jun 11, 2026", quarterly: "—" },
  { period: "Jun 2026 (Q1)", monthly: "Jul 11, 2026", quarterly: "Jul 13, 2026" },
  { period: "July 2026", monthly: "Aug 11, 2026", quarterly: "—" },
  { period: "August 2026", monthly: "Sep 11, 2026", quarterly: "—" },
  { period: "Sep 2026 (Q2)", monthly: "Oct 11, 2026", quarterly: "Oct 13, 2026" },
  { period: "October 2026", monthly: "Nov 11, 2026", quarterly: "—" },
  { period: "November 2026", monthly: "Dec 11, 2026", quarterly: "—" },
  { period: "Dec 2026 (Q3)", monthly: "Jan 11, 2027", quarterly: "Jan 13, 2027" },
  { period: "January 2027", monthly: "Feb 11, 2027", quarterly: "—" },
  { period: "February 2027", monthly: "Mar 11, 2027", quarterly: "—" },
  { period: "Mar 2027 (Q4)", monthly: "Apr 11, 2027", quarterly: "Apr 13, 2027" },
];

const GSTR3B_DATES = [
  { period: "April 2026", monthly: "May 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "May 2026", monthly: "Jun 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "Jun 2026 (Q1)", monthly: "Jul 20, 2026", qrmpA: "Jul 22, 2026", qrmpB: "Jul 24, 2026" },
  { period: "July 2026", monthly: "Aug 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "August 2026", monthly: "Sep 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "Sep 2026 (Q2)", monthly: "Oct 20, 2026", qrmpA: "Oct 22, 2026", qrmpB: "Oct 24, 2026" },
  { period: "October 2026", monthly: "Nov 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "November 2026", monthly: "Dec 20, 2026", qrmpA: "—", qrmpB: "—" },
  { period: "Dec 2026 (Q3)", monthly: "Jan 20, 2027", qrmpA: "Jan 22, 2027", qrmpB: "Jan 24, 2027" },
  { period: "January 2027", monthly: "Feb 20, 2027", qrmpA: "—", qrmpB: "—" },
  { period: "February 2027", monthly: "Mar 20, 2027", qrmpA: "—", qrmpB: "—" },
  { period: "Mar 2027 (Q4)", monthly: "Apr 20, 2027", qrmpA: "Apr 22, 2027", qrmpB: "Apr 24, 2027" },
];

const FAQ_ITEMS = [
  {
    q: "Who needs to file GST returns monthly vs quarterly?",
    a: "Turnover above ₹5 crore requires monthly filing. Below ₹5 crore, you can opt for QRMP — quarterly returns with monthly tax payments.",
  },
  {
    q: "What is the QRMP scheme?",
    a: "QRMP lets taxpayers with turnover up to ₹5 crore file quarterly instead of monthly. Tax is still paid monthly via PMT-06, and IFF reports B2B invoices in months 1-2 of each quarter.",
  },
  {
    q: "What happens if I miss a GST filing deadline?",
    a: "Late fee is ₹50/day (₹25 CGST + ₹25 SGST), capped at ₹10,000. Nil returns: ₹20/day capped at ₹500. Interest of 18% per annum applies on late tax. Use our Penalty Calculator for exact figures.",
  },
  {
    q: "Do I need to file nil returns?",
    a: "Yes. Even if you had no transactions in a period, you must file nil GSTR-1 and GSTR-3B. Failure to file nil returns attracts late fees (₹20/day up to ₹500). Filing nil returns takes just a few clicks on the GST portal.",
  },
  {
    q: "When is GSTR-9 (annual return) due?",
    a: "GSTR-9 is due December 31 of the following year. For FY 2026-27, the deadline is December 31, 2027. GSTR-9C shares the same deadline and applies above ₹5 crore turnover.",
  },
];

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "GST Return Filing Calendar FY 2026-27",
  author: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  publisher: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  datePublished: "2026-10-07",
  dateModified: "2026-10-07",
};

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
  { name: "Guides", url: "https://gst.doaide.com/guides" },
  { name: "Return Filing Calendar FY 2026-27" },
];

export default function GstReturnCalendarGuide() {
  usePageTitle("GST Return Filing Calendar FY 2026-27 — All Due Dates");
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Return Filing Calendar FY 2026-27 — All Due Dates"
        description="Complete GST return filing calendar for FY 2026-27. All due dates for GSTR-1, GSTR-3B, GSTR-9, CMP-08, and IFF. Monthly and quarterly filing deadlines."
        path="/guides/gst-return-calendar-2026-27"
        jsonLd={[ARTICLE_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container" style={{ maxWidth: 800 }}>
          <Breadcrumb />
          <h1 className="tool-title">GST Return Filing Calendar FY 2026-27</h1>
          <p className="tool-subtitle">
            Complete filing deadlines for all GST returns — GSTR-1, GSTR-3B, GSTR-9,
            CMP-08, and IFF. Bookmark this page so you never miss a deadline.
          </p>

          <section className="tool-info">
            <h2>Types of GST Returns</h2>
            <ul>
              <li><strong>GSTR-1:</strong> Details of outward supplies (sales). Filed monthly (by 11th) or quarterly (by 13th of month after quarter).</li>
              <li><strong>GSTR-3B:</strong> Summary return with tax payment. Filed monthly (by 20th) or quarterly under QRMP.</li>
              <li><strong>GSTR-9:</strong> Annual return. Due December 31 of the following year.</li>
              <li><strong>GSTR-9C:</strong> Reconciliation statement for turnover above ₹5 crore. Same deadline as GSTR-9.</li>
              <li><strong>CMP-08:</strong> Quarterly return for Composition Scheme dealers. Due by 18th of month following the quarter.</li>
              <li><strong>IFF:</strong> Invoice Furnishing Facility for QRMP taxpayers to report B2B invoices in months 1 and 2 of each quarter.</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>GSTR-1 Due Dates FY 2026-27</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Monthly Filers</th>
                    <th>Quarterly (QRMP)</th>
                  </tr>
                </thead>
                <tbody>
                  {GSTR1_DATES.map((d) => (
                    <tr key={d.period}>
                      <td>{d.period}</td>
                      <td>{d.monthly}</td>
                      <td>{d.quarterly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Quarterly filers can use <strong>IFF (Invoice Furnishing Facility)</strong> to report
              B2B invoices in months 1 and 2 of each quarter, by the 13th of the following month.
            </p>
          </section>

          <section className="tool-info">
            <h2>GSTR-3B Due Dates FY 2026-27</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Monthly</th>
                    <th>QRMP Group A</th>
                    <th>QRMP Group B</th>
                  </tr>
                </thead>
                <tbody>
                  {GSTR3B_DATES.map((d) => (
                    <tr key={d.period}>
                      <td>{d.period}</td>
                      <td>{d.monthly}</td>
                      <td>{d.qrmpA}</td>
                      <td>{d.qrmpB}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <strong>QRMP Group A</strong> includes: Chhattisgarh, Madhya Pradesh, Gujarat, Maharashtra,
              Karnataka, Goa, Kerala, Tamil Nadu, Telangana, Andhra Pradesh, Daman &amp; Diu,
              Dadra &amp; Nagar Haveli, Puducherry, Andaman &amp; Nicobar, Lakshadweep.
            </p>
            <p>
              <strong>QRMP Group B</strong> includes: All remaining states and UTs (Jammu &amp; Kashmir,
              Himachal Pradesh, Punjab, Chandigarh, Uttarakhand, Haryana, Delhi, Rajasthan,
              UP, Bihar, Sikkim, NE states, West Bengal, Jharkhand, Odisha, Ladakh).
            </p>
          </section>

          <section className="tool-info">
            <h2>GSTR-9 and GSTR-9C Due Dates</h2>
            <ul>
              <li><strong>GSTR-9 (Annual Return):</strong> December 31, 2027 for FY 2026-27</li>
              <li><strong>GSTR-9C (Reconciliation):</strong> December 31, 2027 — mandatory for turnover above ₹5 crore</li>
              <li>GSTR-9 is mandatory for all regular taxpayers. Composition dealers file GSTR-4 (annual) instead.</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>CMP-08 Due Dates (Composition Scheme)</h2>
            <ul>
              <li><strong>Q1 (Apr-Jun 2026):</strong> July 18, 2026</li>
              <li><strong>Q2 (Jul-Sep 2026):</strong> October 18, 2026</li>
              <li><strong>Q3 (Oct-Dec 2026):</strong> January 18, 2027</li>
              <li><strong>Q4 (Jan-Mar 2027):</strong> April 18, 2027</li>
            </ul>
            <p>
              Check if the <Link to="/composition-scheme">Composition Scheme</Link> is
              right for your business.
            </p>
          </section>

          <section className="tool-info">
            <h2>Important Tips</h2>
            <ul>
              <li>Use GSTR-2B (auto-populated by the 14th of each month) to <Link to="/reconcile">reconcile your purchases</Link> before filing GSTR-3B</li>
              <li>File nil returns even if you had no transactions — missing nil returns still attract <Link to="/penalty-calculator">late fees</Link></li>
              <li>QRMP taxpayers must still pay tax monthly using PMT-06 challan by the 25th</li>
              <li>Use the <Link to="/return-calendar">interactive return calendar</Link> to filter deadlines by return type</li>
              <li>Set up <Link to="/due-dates">deadline alerts</Link> so you get reminders before each due date</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>
            <dl className="landing-faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="landing-faq-item">
                  <dt>
                    <button
                      className="landing-faq-q"
                      aria-expanded={openFaq === i}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      {item.q}
                      <span className="landing-faq-chevron" aria-hidden="true">{openFaq === i ? "−" : "+"}</span>
                    </button>
                  </dt>
                  {openFaq === i && <dd className="landing-faq-a">{item.a}</dd>}
                </div>
              ))}
            </dl>
          </section>

          <EmailCapture
            source="return-calendar-guide"
            heading="Never miss a filing deadline"
            subtext="Get free email reminders before every GST due date."
            buttonLabel="Get Reminders"
            compact
          />

          <RelatedTools current="/guides/gst-return-calendar-2026-27" />
          <CrossProductLinks page="guides" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
