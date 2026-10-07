import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function Gstr1VsGstr3b() {
  usePageTitle("Difference Between GSTR-1 and GSTR-3B Explained");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Key differences between GSTR-1 and GSTR-3B returns. Compare purpose, due dates, data granularity, and ITC impact of these two mandatory GST returns.";

    let script = document.getElementById("blog-ld-json");
    if (!script) {
      script = document.createElement("script");
      script.id = "blog-ld-json";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify([
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Difference Between GSTR-1 and GSTR-3B Explained",
        description: "Detailed comparison of GSTR-1 and GSTR-3B GST returns — purpose, due dates, and filing requirements.",
        url: "https://gst.doaide.com/blog/gstr-1-vs-gstr-3b-difference",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the main difference between GSTR-1 and GSTR-3B?", acceptedAnswer: { "@type": "Answer", text: "GSTR-1 reports outward supply details (sales). GSTR-3B is a summary return for paying tax — it covers both output liability and ITC." } },
          { "@type": "Question", name: "Which return should be filed first — GSTR-1 or GSTR-3B?", acceptedAnswer: { "@type": "Answer", text: "GSTR-1 should be filed first. Data from GSTR-1 auto-populates buyers' GSTR-2B, which is needed for ITC claims." } },
          { "@type": "Question", name: "Can I file GSTR-3B without filing GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "Yes, but it is not recommended. Mismatches between GSTR-1 and GSTR-3B trigger notices from the department." } },
          { "@type": "Question", name: "What happens if GSTR-1 and GSTR-3B data don't match?", acceptedAnswer: { "@type": "Answer", text: "Mismatches may trigger DRC-01B notices. Your buyers' ITC could be blocked if GSTR-1 data is lower than GSTR-3B." } },
          { "@type": "Question", name: "Is GSTR-3B a self-assessed return?", acceptedAnswer: { "@type": "Answer", text: "Yes. GSTR-3B is a self-assessed summary return. The taxpayer calculates and pays tax based on their own records." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>Difference Between GSTR-1 and GSTR-3B Explained</h1>
      <p className="blog-meta">Updated October 2026 · 7 min read</p>

      <section>
        <h2>Overview</h2>
        <p>
          Every regular GST taxpayer must file both GSTR-1 and GSTR-3B. While they cover overlapping
          data, they serve fundamentally different purposes. GSTR-1 is for reporting invoice-level
          details of your outward supplies (sales). GSTR-3B is a summary return where you declare
          output tax liability, claim input tax credit (ITC), and pay the net tax due.
        </p>
      </section>

      <section>
        <h2>Key Differences at a Glance</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line, #e2e8f0)" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>Parameter</th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>GSTR-1</th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>GSTR-3B</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Purpose", "Report outward supplies (sales)", "Pay tax and claim ITC"],
                ["Data Level", "Invoice-level detail", "Summary / aggregate"],
                ["Due Date (Monthly)", "11th of next month", "20th of next month"],
                ["Due Date (QRMP)", "13th after quarter", "22nd/24th after quarter"],
                ["Tax Payment", "No", "Yes — net tax paid here"],
                ["ITC Claim", "No", "Yes — ITC claimed here"],
                ["Revision", "Amendments in next period's GSTR-1", "Cannot be revised once filed"],
                ["Auto-population", "Populates buyer's GSTR-2B", "Auto-populated from GSTR-2B (ITC side)"],
                ["Late Fee", "₹50/day, max ₹10,000", "₹50/day, max ₹10,000"],
              ].map(([param, g1, g3b]) => (
                <tr key={param} style={{ borderBottom: "1px solid var(--line, #e2e8f0)" }}>
                  <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>{param}</td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>{g1}</td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>{g3b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>GSTR-1: What It Contains</h2>
        <p>GSTR-1 captures granular invoice-level data of all your sales:</p>
        <ul>
          <li><strong>B2B invoices (Table 4A):</strong> GSTIN-wise, invoice-wise details for registered buyers</li>
          <li><strong>B2C Large (Table 5A):</strong> Interstate sales above ₹2.5 lakh to unregistered buyers</li>
          <li><strong>B2C Small (Table 7):</strong> All other B2C sales, rate-wise aggregate</li>
          <li><strong>Credit/Debit Notes (Table 9):</strong> Linked to original invoices</li>
          <li><strong>Export Invoices (Table 6A):</strong> With or without IGST payment</li>
          <li><strong>HSN Summary (Table 12):</strong> Outward supplies by HSN code</li>
        </ul>
      </section>

      <section>
        <h2>GSTR-3B: What It Contains</h2>
        <p>GSTR-3B is a consolidated summary with these key sections:</p>
        <ul>
          <li><strong>Table 3.1:</strong> Outward supplies — taxable, zero-rated, nil-rated, exempt</li>
          <li><strong>Table 3.2:</strong> Interstate supplies to unregistered persons and composition taxpayers</li>
          <li><strong>Table 4:</strong> Eligible ITC — from imports, reverse charge, ISD, and other sources</li>
          <li><strong>Table 5:</strong> Exempt, nil-rated, and non-GST inward supplies</li>
          <li><strong>Table 6:</strong> Payment of tax — IGST, CGST, SGST, Cess via cash and ITC</li>
        </ul>
      </section>

      <section>
        <h2>Why Filing Order Matters</h2>
        <p>
          Always file GSTR-1 before GSTR-3B. Here&apos;s why: when you file GSTR-1, the invoice data
          flows into your buyers&apos; GSTR-2B. They use GSTR-2B to verify and claim ITC.
          If you delay GSTR-1, your buyers cannot see those invoices in their GSTR-2B, and their ITC
          gets stuck. The government also cross-checks GSTR-1 and GSTR-3B data for mismatches.
        </p>
      </section>

      <section>
        <h2>What Happens When They Don&apos;t Match?</h2>
        <p>
          If your GSTR-1 and GSTR-3B data have significant differences, the system generates a
          <strong> DRC-01B notice</strong>. Common mismatch scenarios:
        </p>
        <ul>
          <li>GSTR-1 taxable value higher than GSTR-3B → you may have under-paid tax</li>
          <li>GSTR-3B output higher than GSTR-1 → your buyers&apos; ITC doesn&apos;t reconcile</li>
          <li>Missing invoices in GSTR-1 but tax paid in GSTR-3B → data integrity gap</li>
        </ul>
        <p>
          Reconcile both returns monthly using our <Link to="/calculator">GST Calculator</Link> to
          avoid surprises during the annual GSTR-9 filing.
        </p>
      </section>

      <section>
        <h2>Late Fee Comparison</h2>
        <p>
          Both returns attract the same late fee structure: ₹50 per day (₹25 CGST + ₹25 SGST),
          capped at ₹10,000 per return. Nil returns have a reduced fee of ₹20/day (max ₹500).
          Use our <Link to="/late-fee-calculator">Late Fee Calculator</Link> to compute exact penalties.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>
        <dl className="blog-faq">
          <dt>What is the main difference between GSTR-1 and GSTR-3B?</dt>
          <dd>GSTR-1 reports sales details. GSTR-3B is a summary return for paying tax and claiming ITC.</dd>
          <dt>Which return should be filed first?</dt>
          <dd>GSTR-1 first. Its data populates buyers&apos; GSTR-2B, needed for their ITC claims.</dd>
          <dt>Can I file GSTR-3B without filing GSTR-1?</dt>
          <dd>Yes, but mismatches between the two may trigger DRC-01B notices from the department.</dd>
          <dt>What happens if the data doesn&apos;t match?</dt>
          <dd>Mismatches trigger DRC-01B notices. Buyers&apos; ITC could be blocked if GSTR-1 data is lower.</dd>
          <dt>Is GSTR-3B a self-assessed return?</dt>
          <dd>Yes. You calculate and pay tax based on your own records in GSTR-3B.</dd>
        </dl>
      </section>

      <section className="blog-cta">
        <p>
          <Link to="/">Try DoAide GST free</Link> — reconcile GSTR-1 and GSTR-3B,
          catch mismatches early, and file with confidence. No credit card required.
        </p>
      </section>
    </article>
  );
}
