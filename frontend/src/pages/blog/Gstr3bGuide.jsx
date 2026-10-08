import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import SeoHead from "../../components/SeoHead";

export default function Gstr3bGuide() {
  usePageTitle("GSTR-3B Filing: Due Dates, Format, and Common Mistakes");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Complete guide to GSTR-3B filing in 2026. Due dates, format walkthrough, step-by-step filing process, common mistakes, and late filing penalties.";

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
        headline: "GSTR-3B Filing: Due Dates, Format, and Common Mistakes",
        description: "Complete guide to GSTR-3B filing in 2026. Due dates, format, common mistakes, and penalties.",
        url: "https://gst.doaide.com/blog/gstr-3b-filing-guide",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "Can I revise GSTR-3B after filing?", acceptedAnswer: { "@type": "Answer", text: "No, GSTR-3B cannot be revised once filed. Any errors must be corrected in the next month's return through adjustments. This is why accuracy is critical before submission." } },
          { "@type": "Question", name: "How do I file a nil GSTR-3B?", acceptedAnswer: { "@type": "Answer", text: "You must still file even with no transactions. Log in to GST portal, go to GSTR-3B, select the period, file with all zeros. Nil returns can also be filed via SMS." } },
          { "@type": "Question", name: "What is the late fee for missing GSTR-3B deadline?", acceptedAnswer: { "@type": "Answer", text: "Late fee is ₹50/day (₹25 CGST + ₹25 SGST) for regular returns, capped at ₹5,000. For nil returns, it is ₹20/day (₹10 CGST + ₹10 SGST). Additionally, interest at 18% p.a. applies on unpaid tax." } },
          { "@type": "Question", name: "Is GSTR-3B auto-populated from GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "Partially. Since Jan 2022, some GSTR-3B tables auto-populate from GSTR-1 and GSTR-2B. Verify all figures before filing as auto-population may miss adjustments." } },
          { "@type": "Question", name: "What happens if GSTR-3B and GSTR-1 don't match?", acceptedAnswer: { "@type": "Answer", text: "Mismatches between GSTR-1 and GSTR-3B are flagged by the system and may trigger notices from the tax authority. GSTR-1 shows invoice-level details while GSTR-3B is summary — they should reconcile." } },
        ],
      },
    ]);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  return (
    <article className="blog-article">
      <SeoHead title="GSTR-3B Filing Guide: Due Dates, Format & Common Mistakes" description="Complete GSTR-3B filing guide — monthly due dates, table-wise format walkthrough, 8 common mistakes to avoid, and late filing penalty calculation." path="/blog/gstr-3b-filing-guide" />
      <h1>GSTR-3B Filing: Due Dates, Format, and Common Mistakes</h1>
      <p className="blog-meta">Updated October 2026 · 10 min read</p>

      <section>
        <h2>What Is GSTR-3B?</h2>
        <p>
          GSTR-3B is a monthly self-declaration summary return that every registered GST taxpayer must
          file. Unlike GSTR-1 (which reports invoice-level outward supply details), GSTR-3B is where
          you declare your total output tax liability, claim Input Tax Credit, and pay the net tax due.
          It is the most important return for tax payment purposes.
        </p>
        <p>
          Use our <Link to="/calculator">GST Calculator</Link> to compute your tax liability before filing.
        </p>
      </section>

      <section>
        <h2>Who Must File GSTR-3B?</h2>
        <ul>
          <li>All regular registered taxpayers (including those with nil transactions)</li>
          <li>SEZ developers and SEZ units</li>
          <li>Casual taxable persons</li>
          <li>Input Service Distributors (file GSTR-6 instead)</li>
        </ul>
        <p>
          <strong>Exempt:</strong> Composition scheme dealers (file GSTR-4 quarterly), non-resident
          taxable persons (file GSTR-5), and TDS/TCS deductors (file GSTR-7/GSTR-8).
        </p>
      </section>

      <section>
        <h2>GSTR-3B Due Dates 2026</h2>

        <h3>Monthly Filers (Turnover &gt; ₹5 Crore)</h3>
        <p>
          Due on the <strong>20th of the following month</strong>. For example, GSTR-3B for September
          2026 is due by 20th October 2026. Check all upcoming dates on our{" "}
          <Link to="/return-calendar">Return Calendar</Link>.
        </p>

        <h3>QRMP Scheme (Turnover ≤ ₹5 Crore)</h3>
        <p>
          Quarterly filers under the QRMP scheme have staggered due dates to reduce portal load:
        </p>
        <ul>
          <li><strong>Category A states</strong> (Chhattisgarh, MP, Gujarat, Maharashtra, Karnataka, Goa, Kerala, TN, Telangana, AP, Daman &amp; Diu, Puducherry, Andaman): <strong>22nd</strong> of the month following the quarter</li>
          <li><strong>Category B states</strong> (all remaining): <strong>24th</strong> of the month following the quarter</li>
        </ul>
        <p>
          See all GST <Link to="/due-dates">due dates</Link> for every return type.
        </p>
      </section>

      <section>
        <h2>GSTR-3B Format: Table-by-Table Walkthrough</h2>

        <h3>Table 3.1 — Outward Supplies and Tax</h3>
        <p>
          Report your total outward supplies (sales) categorized as:
        </p>
        <ul>
          <li>(a) Taxable outward supplies (other than reverse charge and zero-rated)</li>
          <li>(b) Outward supplies (reverse charge) — buyer pays tax</li>
          <li>(c) Zero-rated supplies (exports and supplies to SEZ)</li>
          <li>(d) Inward supplies liable to reverse charge</li>
          <li>(e) Non-GST outward supplies (petroleum, alcohol, etc.)</li>
        </ul>

        <h3>Table 3.2 — Inter-State Supplies</h3>
        <p>
          Break down supplies to unregistered persons (B2C) and composition dealers by state.
          This helps the government track the place of supply for IGST distribution.
        </p>

        <h3>Table 4 — Eligible ITC</h3>
        <p>
          Claim your Input Tax Credit here. This table has sub-sections:
        </p>
        <ul>
          <li>(A) ITC available — from imports, inward supplies, ISD, and reverse charge</li>
          <li>(B) ITC reversed — due to Rule 42/43, blocked credits under Sec 17(5), and other reversals</li>
          <li>(C) Net ITC available — (A) minus (B)</li>
          <li>(D) Ineligible ITC — as per Sec 17(5)</li>
        </ul>
        <p>
          Calculate your eligible ITC with our <Link to="/itc-calculator">ITC Calculator</Link>.
        </p>

        <h3>Table 5 — Exempt, Nil, and Non-GST Supplies</h3>
        <p>
          Report the value of supplies that are exempt from GST, nil-rated, or non-GST. Split
          between inter-state and intra-state.
        </p>

        <h3>Table 6 — Payment of Tax</h3>
        <p>
          The system auto-calculates tax payable. Pay using:
        </p>
        <ul>
          <li><strong>ITC</strong> — first adjust ITC (IGST can be used for CGST/SGST)</li>
          <li><strong>Cash</strong> — pay remaining liability through the electronic cash ledger</li>
          <li><strong>Interest</strong> — if paying after due date, interest at 18% p.a. applies. Use our{" "}
            <Link to="/interest-calculator">Interest Calculator</Link> to compute the exact amount.</li>
        </ul>
      </section>

      <section>
        <h2>Step-by-Step: How to File GSTR-3B</h2>
        <ol>
          <li><strong>Log in</strong> to the GST portal (gst.gov.in) with your credentials</li>
          <li>Navigate to <strong>Services → Returns → Returns Dashboard</strong></li>
          <li>Select the <strong>financial year and return period</strong> (month/quarter)</li>
          <li>Click <strong>Prepare Online</strong> (or Prepare Offline for large data)</li>
          <li>Review <strong>auto-populated values</strong> from GSTR-1 and GSTR-2B</li>
          <li>Fill or adjust values in <strong>Tables 3.1, 4, 5</strong></li>
          <li><strong>Preview</strong> the return and verify all figures match your books</li>
          <li>Click <strong>Submit</strong> — this freezes the data (no more changes)</li>
          <li>Go to <strong>Payment of Tax</strong> (Table 6) — offset ITC, then pay cash for the balance</li>
          <li><strong>File with DSC or EVC</strong> — the return is now filed</li>
        </ol>
      </section>

      <section>
        <h2>8 Common GSTR-3B Mistakes to Avoid</h2>
        <ol>
          <li><strong>Claiming excess ITC</strong> — ITC claimed in GSTR-3B exceeds the amount available in GSTR-2B. Always reconcile first.</li>
          <li><strong>Not reversing ineligible ITC</strong> — forgetting to reverse ITC on personal expenses, exempt supplies, or blocked credits under Section 17(5)</li>
          <li><strong>Wrong place of supply</strong> — reporting inter-state supply as intra-state (or vice versa) results in wrong tax type (IGST vs CGST+SGST)</li>
          <li><strong>Mismatch with GSTR-1</strong> — output tax in GSTR-3B should match the total from GSTR-1. Mismatches trigger notices.</li>
          <li><strong>Not reporting reverse charge</strong> — forgetting to report and pay tax on reverse charge supplies in Table 3.1(d)</li>
          <li><strong>Filing after deadline</strong> — late fee of ₹50/day applies immediately. Use our <Link to="/penalty-calculator">Penalty Calculator</Link> to check the impact.</li>
          <li><strong>Incorrect adjustment of credit notes</strong> — credit/debit notes must be reported in the correct period to avoid mismatch</li>
          <li><strong>Not offsetting ITC correctly</strong> — IGST credit must be used first, then CGST for CGST and SGST for SGST. Cross-utilization rules changed in 2019.</li>
        </ol>
      </section>

      <section>
        <h2>Penalties for Late GSTR-3B Filing</h2>
        <ul>
          <li><strong>Late fee:</strong> ₹50/day (₹25 CGST + ₹25 SGST), maximum ₹5,000 per return</li>
          <li><strong>Nil return late fee:</strong> ₹20/day (₹10 CGST + ₹10 SGST)</li>
          <li><strong>Interest:</strong> 18% p.a. on unpaid tax from the due date</li>
          <li><strong>Blocked returns:</strong> you cannot file the next month&apos;s return until the pending one is filed</li>
          <li><strong>E-way bill impact:</strong> if 2+ months of GSTR-3B are pending, e-way bill generation is blocked</li>
        </ul>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>Can I revise GSTR-3B after filing?</h3>
        <p>
          No, GSTR-3B cannot be revised once filed. Any errors must be corrected in the next
          month&apos;s return through adjustments in the relevant tables. This is why verifying all
          figures before submission is critical.
        </p>

        <h3>How do I file a nil GSTR-3B?</h3>
        <p>
          If you had no transactions in a period, you must still file a nil return. Log in to the
          GST portal, select GSTR-3B for the period, and file with all values as zero. You can
          also file nil GSTR-3B via SMS from your registered mobile.
        </p>

        <h3>What is the late fee for missing the GSTR-3B deadline?</h3>
        <p>
          ₹50/day (₹25 CGST + ₹25 SGST) for regular returns, capped at ₹5,000. For nil returns,
          ₹20/day. Additionally, interest at 18% per annum applies on any unpaid tax from the
          due date.
        </p>

        <h3>Is GSTR-3B auto-populated from GSTR-1?</h3>
        <p>
          Partially. Since January 2022, certain tables are auto-populated from GSTR-1 (outward
          supplies) and GSTR-2B (ITC). However, always verify auto-populated figures as they may
          not capture all adjustments, credit/debit notes, or provisional entries.
        </p>

        <h3>What if GSTR-3B and GSTR-1 don&apos;t match?</h3>
        <p>
          Mismatches are flagged by the system and can trigger scrutiny notices. Ensure your GSTR-1
          (invoice-level) and GSTR-3B (summary) reconcile before filing. Regular reconciliation
          using our tools prevents this.
        </p>
      </section>

      <section>
        <h2>Useful Tools for GSTR-3B Filing</h2>
        <ul>
          <li><Link to="/calculator">GST Calculator</Link> — compute your tax liability</li>
          <li><Link to="/interest-calculator">Interest Calculator</Link> — calculate late payment interest</li>
          <li><Link to="/return-calendar">Return Calendar</Link> — never miss a due date</li>
          <li><Link to="/penalty-calculator">Penalty Calculator</Link> — check late filing penalties</li>
          <li><Link to="/due-dates">Due Dates</Link> — all GST return due dates at a glance</li>
        </ul>
        <p>
          <Link to="/">Try DoAide GST free →</Link>
        </p>
      </section>
    </article>
  );
}
