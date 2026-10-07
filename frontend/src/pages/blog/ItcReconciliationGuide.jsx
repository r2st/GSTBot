import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function ItcReconciliationGuide() {
  usePageTitle("ITC Reconciliation Under GST: How to Match GSTR-2A with Purchase Register");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Detailed guide to ITC reconciliation under GST. How to match GSTR-2B with your purchase register, resolve mismatches, and avoid ITC reversals.";

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
        headline: "ITC Reconciliation Under GST: How to Match GSTR-2A with Purchase Register",
        description: "Detailed guide to ITC reconciliation under GST. Match GSTR-2B with purchase register, resolve mismatches, avoid reversals.",
        url: "https://gst.doaide.com/blog/itc-reconciliation-gstr-2a-guide",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the difference between GSTR-2A and GSTR-2B?", acceptedAnswer: { "@type": "Answer", text: "GSTR-2A is dynamic and changes when suppliers file GSTR-1. GSTR-2B is static, generated on the 14th monthly, and is the authoritative document for ITC claims." } },
          { "@type": "Question", name: "Can I claim ITC on invoices not appearing in GSTR-2B?", acceptedAnswer: { "@type": "Answer", text: "No. As per Rule 36(4), ITC can only be claimed on invoices that appear in GSTR-2B. If an invoice is missing, follow up with your supplier to ensure they file their GSTR-1 correctly." } },
          { "@type": "Question", name: "What is the time limit for claiming ITC?", acceptedAnswer: { "@type": "Answer", text: "By the earlier of: 30th November following the financial year, or the date of filing GSTR-9 annual return. For FY 2025-26, the deadline is 30 Nov 2026." } },
          { "@type": "Question", name: "What are blocked ITC credits under Section 17(5)?", acceptedAnswer: { "@type": "Answer", text: "ITC is blocked on motor vehicles, food, health/life insurance (unless mandatory), travel, club memberships, personal use, free samples, and construction of immovable property." } },
        ],
      },
    ]);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  return (
    <article className="blog-article">
      <h1>ITC Reconciliation Under GST: How to Match GSTR-2A with Purchase Register</h1>
      <p className="blog-meta">Updated October 2026 · 11 min read</p>

      <section>
        <h2>What Is ITC Reconciliation?</h2>
        <p>
          ITC (Input Tax Credit) reconciliation is the process of matching the GST credit available
          to you (as reported in GSTR-2B) with your own purchase register or books of accounts.
          This is essential because you can only claim ITC on invoices that meet all four conditions
          under <strong>Section 16</strong> of the CGST Act:
        </p>
        <ol>
          <li>You have the tax invoice or debit note</li>
          <li>You have received the goods or services</li>
          <li>The tax has been paid to the government by the supplier</li>
          <li>You have filed your return claiming the ITC</li>
        </ol>
        <p>
          <strong>Rule 36(4)</strong> further restricts ITC to only those invoices that appear in
          your GSTR-2B. This makes monthly reconciliation non-negotiable for every GST-registered
          business. Our <Link to="/itc-mismatch">ITC Mismatch Tool</Link> helps identify discrepancies.
        </p>
      </section>

      <section>
        <h2>GSTR-2A vs GSTR-2B: Key Differences</h2>
        <table className="blog-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>GSTR-2A</th>
              <th>GSTR-2B</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nature</td>
              <td>Dynamic (changes in real-time)</td>
              <td>Static (generated on 14th of each month)</td>
            </tr>
            <tr>
              <td>Source</td>
              <td>Supplier&apos;s GSTR-1 filings</td>
              <td>GSTR-1, GSTR-5, and GSTR-6 filings</td>
            </tr>
            <tr>
              <td>ITC eligibility</td>
              <td>Indicative only</td>
              <td>Authoritative for ITC claims</td>
            </tr>
            <tr>
              <td>Can change?</td>
              <td>Yes, whenever supplier amends</td>
              <td>No, fixed once generated</td>
            </tr>
            <tr>
              <td>Use for</td>
              <td>Reference and monitoring</td>
              <td>Claiming ITC in GSTR-3B</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>Bottom line:</strong> Always use GSTR-2B (not GSTR-2A) as the basis for your ITC
          claims. GSTR-2A is useful for monitoring supplier compliance in real-time.
        </p>
      </section>

      <section>
        <h2>Step-by-Step ITC Reconciliation Process</h2>

        <h3>Step 1: Download GSTR-2B</h3>
        <p>
          After the 14th of each month, log in to the GST portal and download GSTR-2B for the
          relevant period. Download in JSON or Excel format. This contains all invoices reported
          by your suppliers that are eligible for ITC.
        </p>

        <h3>Step 2: Export Your Purchase Register</h3>
        <p>
          Export your purchase register (accounts payable) from your accounting software. Ensure it
          includes: supplier GSTIN, invoice number, invoice date, taxable value, CGST, SGST, IGST,
          and cess amounts.
        </p>

        <h3>Step 3: Match Invoices</h3>
        <p>
          Match invoices between your purchase register and GSTR-2B on these key fields:
        </p>
        <ul>
          <li><strong>Supplier GSTIN</strong> — exact 15-digit match. Verify with our{" "}
            <Link to="/gstin-validator">GSTIN Validator</Link>.</li>
          <li><strong>Invoice number</strong> — watch for formatting differences (leading zeros, spaces, special characters)</li>
          <li><strong>Invoice date</strong> — should match within the same tax period</li>
          <li><strong>Taxable value and tax amounts</strong> — exact match or within ₹1 tolerance for rounding</li>
        </ul>

        <h3>Step 4: Categorize Results</h3>
        <p>
          After matching, categorize every invoice into one of these buckets:
        </p>
        <ul>
          <li><strong>Matched</strong> — invoice found in both your books and GSTR-2B with matching amounts. ITC can be claimed.</li>
          <li><strong>In books, missing in GSTR-2B</strong> — supplier hasn&apos;t reported this invoice in their GSTR-1. Follow up with supplier.</li>
          <li><strong>In GSTR-2B, missing in books</strong> — invoice reported by supplier but not in your records. Investigate: possible unrecorded purchase or wrong GSTIN.</li>
          <li><strong>Amount mismatch</strong> — invoice found in both but amounts differ. Reconcile with supplier.</li>
        </ul>
      </section>

      <section>
        <h2>Types of Mismatches and How to Resolve Them</h2>

        <h3>1. Missing Invoices in GSTR-2B</h3>
        <p>
          <strong>Cause:</strong> Supplier hasn&apos;t filed GSTR-1, or filed with wrong buyer GSTIN.
        </p>
        <p>
          <strong>Resolution:</strong> Contact supplier immediately. Share a screenshot of the missing
          invoice. If supplier has already filed, check if they used the correct GSTIN. The invoice
          will appear in the next GSTR-2B once the supplier corrects and re-files.
        </p>

        <h3>2. Amount Differences</h3>
        <p>
          <strong>Cause:</strong> Rounding differences, different HSN rates applied, or credit/debit
          notes not accounted for.
        </p>
        <p>
          <strong>Resolution:</strong> Check if a credit or debit note was issued. Verify the
          applicable GST rate using our <Link to="/hsn-sac-finder">HSN/SAC Finder</Link>. For
          rounding differences of ₹1-2, accept the GSTR-2B value.
        </p>

        <h3>3. Duplicate Entries</h3>
        <p>
          <strong>Cause:</strong> Same invoice entered twice in your books, or supplier reported it
          in two different periods.
        </p>
        <p>
          <strong>Resolution:</strong> Remove the duplicate from your purchase register. If the
          supplier reported it twice, request them to issue a credit note.
        </p>

        <h3>4. Timing Differences</h3>
        <p>
          <strong>Cause:</strong> Invoice recorded in your books in one month but supplier filed
          GSTR-1 in the next month.
        </p>
        <p>
          <strong>Resolution:</strong> ITC can be claimed in the period when it appears in GSTR-2B.
          There is no need to match the exact period of your purchase register entry.
        </p>

        <h3>5. GSTIN Errors</h3>
        <p>
          <strong>Cause:</strong> Supplier recorded the wrong buyer GSTIN. The invoice appears in
          someone else&apos;s GSTR-2B.
        </p>
        <p>
          <strong>Resolution:</strong> Supplier must issue a credit note against the wrong GSTIN
          and re-issue the invoice with your correct GSTIN.
        </p>
      </section>

      <section>
        <h2>ITC Reversal Rules</h2>
        <p>
          You must reverse ITC already claimed in these situations:
        </p>
        <ul>
          <li><strong>Non-payment within 180 days</strong> — if you don&apos;t pay the supplier within 180 days of invoice date, ITC must be reversed with interest</li>
          <li><strong>Blocked credits (Section 17(5))</strong> — ITC on motor vehicles, food, health insurance (unless mandatory), travel, club memberships, personal consumption, free samples, construction</li>
          <li><strong>Common credits (Rule 42/43)</strong> — proportional reversal for inputs used partly for exempt supplies or personal use</li>
          <li><strong>Capital goods disposed</strong> — reverse ITC on a reducing balance basis if capital goods are sold within the useful life</li>
          <li><strong>Invoice not in GSTR-2B</strong> — ITC provisionally claimed must be reversed if the invoice doesn&apos;t appear in GSTR-2B within the stipulated time</li>
        </ul>
        <p>
          Use our <Link to="/itc-calculator">ITC Calculator</Link> to compute eligible and ineligible
          credit, and the <Link to="/input-tax-credit">ITC Eligibility Checker</Link> for detailed
          eligibility analysis.
        </p>
      </section>

      <section>
        <h2>Best Practices for Ongoing Reconciliation</h2>
        <ol>
          <li><strong>Reconcile monthly</strong> — don&apos;t wait until the annual return. Monthly reconciliation catches issues early.</li>
          <li><strong>Set up a supplier follow-up process</strong> — email suppliers with missing/mismatched invoices within 5 days of GSTR-2B generation</li>
          <li><strong>Validate GSTIN before recording</strong> — check every supplier GSTIN at invoice entry to prevent errors</li>
          <li><strong>Standardize invoice number format</strong> — remove leading zeros, spaces, and special characters before matching</li>
          <li><strong>Maintain a mismatch tracker</strong> — track unresolved mismatches month-on-month until cleared</li>
          <li><strong>Use automation</strong> — manual reconciliation is error-prone for large volumes. DoAide GST automates the matching process.</li>
        </ol>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>What is the difference between GSTR-2A and GSTR-2B?</h3>
        <p>
          GSTR-2A is a dynamic document that changes whenever your supplier files or amends their
          GSTR-1. GSTR-2B is a static statement generated on the 14th of each month — it doesn&apos;t
          change once generated. GSTR-2B is the authoritative document for ITC claims.
        </p>

        <h3>Can I claim ITC on invoices not appearing in GSTR-2B?</h3>
        <p>
          No. As per Rule 36(4), ITC can only be claimed on invoices appearing in GSTR-2B. If an
          invoice is missing, follow up with your supplier to file or correct their GSTR-1. The
          credit will be available in the next GSTR-2B cycle.
        </p>

        <h3>What is the time limit for claiming ITC?</h3>
        <p>
          ITC must be claimed by the earlier of: (a) 30th November of the year following the financial
          year, or (b) the date of filing the annual return (GSTR-9). For FY 2025-26, the deadline
          is 30th November 2026.
        </p>

        <h3>What are blocked ITC credits under Section 17(5)?</h3>
        <p>
          ITC is blocked on: motor vehicles (except for transport, driving schools, etc.), food and
          beverages, health/life insurance (unless mandatory for employees), travel (leave or home
          travel), club memberships, personal consumption, free samples, gifts, and construction of
          immovable property (except plant and machinery).
        </p>
      </section>

      <section>
        <h2>Tools for ITC Reconciliation</h2>
        <ul>
          <li><Link to="/input-tax-credit">ITC Eligibility Checker</Link> — check if your ITC claim is valid</li>
          <li><Link to="/itc-mismatch">ITC Mismatch Tool</Link> — identify discrepancies in your ITC</li>
          <li><Link to="/itc-calculator">ITC Calculator</Link> — compute eligible credit amount</li>
          <li><Link to="/hsn-sac-finder">HSN/SAC Finder</Link> — verify correct HSN codes and rates</li>
          <li><Link to="/gstin-validator">GSTIN Validator</Link> — verify supplier GSTINs</li>
        </ul>
        <p>
          <Link to="/">Try DoAide GST free →</Link>
        </p>
      </section>
    </article>
  );
}
