import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function Gstr3bCommonMistakes() {
  usePageTitle("GSTR-3B Filing: Common Mistakes and How to Avoid Them");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Top 10 common GSTR-3B filing mistakes Indian businesses make and how to avoid them. Wrong ITC claims, GSTR-1 mismatch, incorrect tax period, missing RCM liability, and penalty implications explained.";

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
        headline: "GSTR-3B Filing: Common Mistakes and How to Avoid Them",
        description: "Top 10 common GSTR-3B filing mistakes and how to avoid them. ITC mismatch, wrong tax period, missing RCM, penalty implications, and best practices for error-free filing.",
        url: "https://gst.doaide.com/blog/gstr-3b-common-mistakes-how-to-avoid",
        datePublished: "2026-10-10",
        dateModified: "2026-10-10",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "Can I revise GSTR-3B after filing?", acceptedAnswer: { "@type": "Answer", text: "No. GSTR-3B cannot be revised after filing. Correct errors in the next month's return and maintain a reconciliation log for audit purposes." } },
          { "@type": "Question", name: "What is the penalty for filing GSTR-3B late?", acceptedAnswer: { "@type": "Answer", text: "Late filing attracts ₹50 per day (₹25 CGST + ₹25 SGST), capped at ₹10,000 per return. For nil returns, the fee is ₹20 per day. Interest at 18% per annum applies on unpaid tax." } },
          { "@type": "Question", name: "What happens if GSTR-3B and GSTR-1 figures don't match?", acceptedAnswer: { "@type": "Answer", text: "A mismatch triggers a DRC-01B notice. You must explain the difference or pay the differential tax with interest. Persistent mismatches increase audit risk." } },
          { "@type": "Question", name: "Can I claim ITC in GSTR-3B that is not in GSTR-2B?", acceptedAnswer: { "@type": "Answer", text: "No. Since January 2022, ITC can only be claimed up to the amount reflected in GSTR-2B plus 5% additional. Any ITC not appearing in GSTR-2B cannot be claimed until the supplier files their return." } },
          { "@type": "Question", name: "How do I correct a wrong ITC claim in GSTR-3B?", acceptedAnswer: { "@type": "Answer", text: "If you claimed excess ITC, reverse the excess amount in Table 4(B) of the next month's GSTR-3B. Pay the differential tax with interest at 18% per annum from the date of wrong claim to the date of reversal." } },
          { "@type": "Question", name: "Is it mandatory to file GSTR-3B every month?", acceptedAnswer: { "@type": "Answer", text: "Regular taxpayers with turnover above ₹5 crore must file monthly. Businesses with turnover up to ₹5 crore can opt for quarterly filing under the QRMP scheme, but must still pay tax monthly using Form PMT-06." } },
        ],
      },
    ]);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  return (
    <article className="blog-article">
      <h1>GSTR-3B Filing: Common Mistakes and How to Avoid Them</h1>
      <p className="blog-meta">Updated October 2026 · 14 min read</p>

      <section>
        <p>
          GSTR-3B is the summary return that every regular GST-registered taxpayer in India must file either
          monthly or quarterly. It is where you declare your output tax liability, claim Input Tax Credit (ITC),
          and pay the net tax due. Despite being a &quot;summary&quot; return, GSTR-3B is where most GST errors
          happen — and unlike GSTR-1, it <strong>cannot be revised</strong> after filing. A single mistake can
          result in excess tax payments, lost ITC, penalty notices, or even departmental scrutiny.
        </p>
        <p>
          In this guide, we cover the 10 most common GSTR-3B filing mistakes made by Indian businesses and give
          you actionable steps to avoid each one. For a full walkthrough of the filing process, see our{" "}
          <Link to="/blog/gstr-3b-filing-guide">GSTR-3B Filing Guide</Link>.
        </p>
      </section>

      <section>
        <h2>What Is GSTR-3B and Why Does It Matter?</h2>
        <p>
          GSTR-3B is a self-assessed summary return filed under GST. It captures your total outward supplies
          (sales), inward supplies attracting reverse charge, ITC claimed, and the net tax payable. The government
          uses GSTR-3B to collect revenue, while your GSTR-1 provides the transaction-level details. Any
          discrepancy between the two triggers automatic notices from the GST system.
        </p>
        <p>
          Key due dates: 20th of the following month for monthly filers, and 22nd/24th for quarterly filers under
          the QRMP scheme. Check all deadlines on our <Link to="/return-calendar">Return Calendar</Link>.
        </p>
      </section>

      <section>
        <h2>Top 10 Common GSTR-3B Mistakes</h2>

        <h3>1. Claiming ITC That Does Not Appear in GSTR-2B</h3>
        <p>
          This is the single most common mistake. Many businesses claim ITC based on their purchase register
          without cross-checking GSTR-2B. Since January 2022, the ITC you can claim in GSTR-3B is limited to
          the amount appearing in your GSTR-2B plus a 5% provisional allowance. Claiming beyond this limit
          leads to automatic notices (DRC-01C) and forced reversals.
        </p>
        <p>
          <strong>How to avoid:</strong> Before filing GSTR-3B each month, reconcile your purchase register with
          GSTR-2B using our <Link to="/gstr2b-reconciliation">GSTR-2B Reconciliation</Link> tool. Follow up with
          suppliers whose invoices are missing from GSTR-2B — the ITC becomes available only after they file their
          GSTR-1.
        </p>

        <h3>2. Mismatch Between GSTR-3B and GSTR-1 Output Tax</h3>
        <p>
          Your GSTR-1 contains invoice-level details of all outward supplies, while GSTR-3B has the summary
          totals. These figures must match. If GSTR-3B shows lower output tax than GSTR-1, the system generates
          a DRC-01B notice asking you to explain the difference or pay the shortfall with interest. For a
          detailed comparison, read our <Link to="/blog/gstr-1-vs-gstr-3b-difference">GSTR-1 vs GSTR-3B guide</Link>.
        </p>
        <p>
          <strong>How to avoid:</strong> Always file GSTR-1 first, then use the GSTR-1 summary to fill GSTR-3B.
          Compare Table 3.1 of GSTR-3B with the GSTR-1 summary before submitting. Pay attention to B2B and
          B2C breakups, export supplies, and nil-rated/exempt supplies.
        </p>

        <h3>3. Wrong Classification of Inter-State vs Intra-State Supplies</h3>
        <p>
          Reporting an inter-state supply (IGST) as intra-state (CGST + SGST), or vice versa, is a frequent
          error. This affects the tax deposited to the correct government (centre vs state) and leads to
          demand notices even though the total tax amount may be correct.
        </p>
        <p>
          <strong>How to avoid:</strong> Determine the place of supply for every transaction based on GST place
          of supply rules. When the supplier and recipient are in different states, charge IGST. When in the
          same state, charge CGST + SGST. Use our <Link to="/calculator">GST Calculator</Link> to verify the
          correct tax split.
        </p>

        <h3>4. Not Reporting Reverse Charge Liability</h3>
        <p>
          Certain inward supplies require you to pay GST under the Reverse Charge Mechanism (RCM) — for example,
          legal services from advocates, transport by GTA, sponsorship services, and purchases from unregistered
          dealers exceeding daily limits. Many businesses forget to report RCM liability in Table 3.1(d) of
          GSTR-3B, which leads to interest and penalty on the unreported tax.
        </p>
        <p>
          <strong>How to avoid:</strong> Maintain a separate RCM register. Review Section 9(3) and 9(4) of
          the CGST Act for the complete list of RCM-applicable services. Ensure you create self-invoices for
          RCM supplies and report them correctly. Use our <Link to="/reverse-charge">Reverse Charge Calculator</Link> to
          check if RCM applies.
        </p>

        <h3>5. Incorrect Reporting of Exempt and Nil-Rated Supplies</h3>
        <p>
          Table 3.1(c) of GSTR-3B requires you to report exempt, nil-rated, and non-GST supplies separately.
          Businesses often either skip this table entirely or mix up exempt supplies with zero-rated exports.
          While this doesn&apos;t directly affect your tax payment, it causes reconciliation issues and triggers
          notices during assessments.
        </p>
        <p>
          <strong>How to avoid:</strong> Categorize your supplies correctly: nil-rated (GST rate is 0% by law),
          exempt (specifically exempted by notification), non-GST (outside GST scope like petrol, alcohol),
          and zero-rated (exports and supplies to SEZ). Report the correct type in Table 3.1(c).
        </p>

        <h3>6. Forgetting to Reverse Ineligible ITC</h3>
        <p>
          Not all ITC can be claimed. Section 17(5) of the CGST Act lists blocked credits — motor vehicles
          (except for specified purposes), food and beverages, health and fitness, club memberships, rent-a-cab,
          life/health insurance (except when provided to employees by law), and construction of immovable
          property. Claiming ITC on these blocked items leads to demand notices with interest and penalty.
        </p>
        <p>
          <strong>How to avoid:</strong> Review every ITC claim against the blocked credit list before filing.
          Use our <Link to="/input-tax-credit">ITC Eligibility Checker</Link> to verify whether a specific
          expense qualifies for ITC. Also read our detailed guide on{" "}
          <Link to="/blog/itc-rules-2026-what-every-business-must-know">ITC Rules 2026</Link>.
        </p>

        <h3>7. Filing in the Wrong Tax Period</h3>
        <p>
          Selecting the wrong month/quarter in the tax period dropdown is a surprisingly common mistake,
          especially when filing returns for multiple months together. Once submitted, you cannot change the
          tax period — the figures get locked against that month permanently.
        </p>
        <p>
          <strong>How to avoid:</strong> Double-check the tax period displayed at the top of the GSTR-3B form
          before entering any data. If you are filing overdue returns, work through them chronologically —
          oldest month first.
        </p>

        <h3>8. Not Adjusting Previous Period Errors</h3>
        <p>
          Since GSTR-3B cannot be revised, any error discovered after filing must be corrected through
          adjustments in the next period&apos;s return. Many businesses either forget to make these adjustments
          or make them incorrectly (for example, adjusting in the wrong table or the wrong direction).
        </p>
        <p>
          <strong>How to avoid:</strong> Maintain a monthly reconciliation log that tracks all adjustments
          carried forward. For excess output tax reported, reduce in the next month&apos;s Table 3.1. For
          excess ITC claimed, reverse in Table 4(B)(2). For short-reported tax, add it in the next month
          and pay interest at 18% per annum using the interest calculator.
        </p>

        <h3>9. Ignoring the Auto-Populated GSTR-3B</h3>
        <p>
          Since 2022, the GST portal auto-populates GSTR-3B based on your GSTR-1 (for output tax) and
          GSTR-2B (for ITC). Many taxpayers ignore the auto-populated figures and manually enter different
          amounts without reconciliation. This creates mismatches that the system flags automatically.
        </p>
        <p>
          <strong>How to avoid:</strong> Start with the auto-populated GSTR-3B. Review each table and only
          modify values where you have a genuine reason (e.g., RCM additions, exemptions not captured in
          GSTR-1). Document the reason for every deviation from auto-populated figures.
        </p>

        <h3>10. Late Filing and Underestimating Penalties</h3>
        <p>
          Late filing of GSTR-3B attracts a late fee of <strong>₹50 per day</strong> (₹25 CGST + ₹25 SGST),
          capped at ₹10,000 per return. For nil returns, the fee is ₹20 per day. Additionally, interest at
          18% per annum is charged on unpaid tax from the due date until the date of payment. Persistent
          late filing can also result in your GSTIN being suspended.
        </p>
        <p>
          <strong>How to avoid:</strong> Set up calendar reminders for the 20th of every month (or 22nd/24th
          for QRMP). Use our <Link to="/return-calendar">Return Calendar</Link> to track all deadlines. If
          you anticipate a delay, at least pay the estimated tax using Form PMT-06 by the due date to
          minimize interest. Calculate exact late fees with our{" "}
          <Link to="/late-fee-calculator">Late Fee Calculator</Link>.
        </p>
      </section>

      <section>
        <h2>Best Practices for Error-Free GSTR-3B Filing</h2>
        <ul>
          <li><strong>File GSTR-1 before GSTR-3B:</strong> Use your own GSTR-1 summary as the starting point for GSTR-3B Table 3.1</li>
          <li><strong>Reconcile ITC with GSTR-2B monthly:</strong> Never claim ITC beyond what appears in GSTR-2B plus 5% — use our <Link to="/gstr2b-reconciliation">GSTR-2B Reconciliation</Link> tool</li>
          <li><strong>Maintain a RCM register:</strong> Track all reverse charge transactions separately and ensure they are reported in Table 3.1(d)</li>
          <li><strong>Review auto-populated data:</strong> Start with the portal&apos;s auto-populated GSTR-3B and only modify with documented reasons</li>
          <li><strong>Cross-verify cash and credit ledgers:</strong> Before submission, check your electronic cash ledger and credit ledger balances on the portal</li>
          <li><strong>Keep an adjustment log:</strong> Track all corrections carried forward from previous months</li>
          <li><strong>Pay tax on time even if return is delayed:</strong> Use PMT-06 to deposit tax by the due date to avoid interest</li>
          <li><strong>Use the ITC calculator:</strong> Verify eligible ITC amounts with our <Link to="/itc-calculator">ITC Calculator</Link> before filing</li>
        </ul>
      </section>

      <section>
        <h2>Penalty Implications of GSTR-3B Errors</h2>
        <p>GSTR-3B errors can attract multiple types of penalties:</p>
        <ul>
          <li><strong>Short payment of tax:</strong> Interest at 18% per annum on the shortfall amount from due date to payment date</li>
          <li><strong>Excess ITC claimed:</strong> Interest at 24% per annum on wrongly availed and utilized ITC</li>
          <li><strong>Late filing fee:</strong> ₹50/day (₹20/day for nil returns), capped at ₹10,000</li>
          <li><strong>Non-filing for consecutive months:</strong> GSTIN suspension and eventual cancellation</li>
          <li><strong>Fraud or suppression:</strong> Penalty equal to the tax amount under Section 74</li>
        </ul>
        <p>
          Estimate your penalty exposure with the <Link to="/penalty-calculator">Penalty Calculator</Link>.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>Can I revise GSTR-3B after filing?</h3>
        <p>
          No. GSTR-3B cannot be revised once filed. You must correct any errors through adjustments in the
          next month&apos;s return. Over-reported output tax can be reduced in the next period, and excess
          ITC claimed must be reversed with interest.
        </p>

        <h3>What is the penalty for filing GSTR-3B late?</h3>
        <p>
          Late filing attracts ₹50 per day (₹25 CGST + ₹25 SGST), capped at ₹10,000 per return. Nil returns
          attract ₹20 per day. Additionally, 18% interest per annum applies on any unpaid tax from the due
          date. Use our <Link to="/late-fee-calculator">Late Fee Calculator</Link> to compute exact penalties.
        </p>

        <h3>What happens if GSTR-3B and GSTR-1 figures don&apos;t match?</h3>
        <p>
          The GST system automatically generates a DRC-01B notice when GSTR-3B liability is lower than GSTR-1.
          You must either explain the difference with supporting reasons or pay the differential tax with
          interest within the specified timeframe.
        </p>

        <h3>Can I claim ITC in GSTR-3B that is not in GSTR-2B?</h3>
        <p>
          No. ITC is restricted to the amount appearing in GSTR-2B plus 5% provisional credit. Follow up
          with your suppliers to ensure they file GSTR-1 on time so your ITC appears in GSTR-2B.
        </p>

        <h3>How do I correct a wrong ITC claim in GSTR-3B?</h3>
        <p>
          Reverse the excess ITC in Table 4(B)(2) of the next month&apos;s GSTR-3B. Pay the differential tax
          along with interest at 18% per annum from the date of the wrong claim to the date of reversal.
          Use our <Link to="/itc-mismatch">ITC Mismatch Resolver</Link> for guidance.
        </p>

        <h3>Is it mandatory to file GSTR-3B every month?</h3>
        <p>
          Taxpayers with annual turnover above ₹5 crore must file monthly. Businesses with turnover up to
          ₹5 crore can opt for quarterly filing under the QRMP scheme, but must still deposit tax monthly
          using Form PMT-06 by the 25th of each month.
        </p>
      </section>

      <section>
        <h2>Tools to Help You File GSTR-3B Correctly</h2>
        <p>Use these free DoAide GST tools to avoid mistakes:</p>
        <ul>
          <li><Link to="/gstr2b-reconciliation">GSTR-2B Reconciliation</Link> — match ITC with GSTR-2B before filing</li>
          <li><Link to="/itc-calculator">ITC Calculator</Link> — verify eligible ITC amounts</li>
          <li><Link to="/itc-mismatch">ITC Mismatch Resolver</Link> — identify and fix ITC discrepancies</li>
          <li><Link to="/input-tax-credit">ITC Eligibility Checker</Link> — check if a specific expense qualifies for ITC</li>
          <li><Link to="/calculator">GST Calculator</Link> — calculate correct tax amounts</li>
          <li><Link to="/late-fee-calculator">Late Fee Calculator</Link> — compute late filing penalties</li>
          <li><Link to="/penalty-calculator">Penalty Calculator</Link> — estimate total penalty exposure</li>
          <li><Link to="/return-calendar">Return Calendar</Link> — track all GSTR-3B due dates</li>
        </ul>
        <p>
          <Link to="/">Start using DoAide GST free →</Link>
        </p>
      </section>
    </article>
  );
}
