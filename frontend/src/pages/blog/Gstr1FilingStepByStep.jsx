import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function Gstr1FilingStepByStep() {
  usePageTitle("How to File GSTR-1 Online Step by Step 2026");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Step-by-step guide to file GSTR-1 online in 2026. Login to GST portal, add invoices, verify B2B & B2C details, submit and file with DSC or EVC.";

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
        headline: "How to File GSTR-1 Online Step by Step 2026",
        description: "Complete guide to filing GSTR-1 online on the GST portal in 2026.",
        url: "https://gst.doaide.com/blog/how-to-file-gstr-1-step-by-step-2026",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "GSTR-1 is a monthly/quarterly return for outward supplies (sales). All regular GST taxpayers must file it." } },
          { "@type": "Question", name: "What is the due date for GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "Monthly filers: 11th of the next month. QRMP quarterly filers: 13th of the month after the quarter ends." } },
          { "@type": "Question", name: "Can I file GSTR-1 after the due date?", acceptedAnswer: { "@type": "Answer", text: "Yes, but late filing attracts ₹50/day (₹25 CGST + ₹25 SGST), max ₹10,000. Nil returns: ₹20/day, max ₹500." } },
          { "@type": "Question", name: "Do I need a digital signature to file GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "Companies and LLPs must use DSC. Others can file using EVC (Electronic Verification Code) sent via Aadhaar OTP." } },
          { "@type": "Question", name: "What invoices go into GSTR-1?", acceptedAnswer: { "@type": "Answer", text: "All sales invoices: B2B (above ₹2.5 lakh), B2C large/small, credit/debit notes, export invoices, and advances." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>How to File GSTR-1 Online Step by Step 2026</h1>
      <p className="blog-meta">Updated October 2026 · 10 min read</p>

      <section>
        <h2>What is GSTR-1?</h2>
        <p>
          GSTR-1 is the return for reporting all outward supplies (sales) made during a tax period.
          Every regular GST-registered taxpayer must file GSTR-1, either monthly or quarterly
          under the QRMP scheme. It contains invoice-level details for B2B supplies and aggregate
          details for B2C supplies. The data you report here flows into your buyers&apos; GSTR-2B
          for ITC matching.
        </p>
      </section>

      <section>
        <h2>Step 1: Login to the GST Portal</h2>
        <p>
          Visit <strong>gst.gov.in</strong> and log in with your GSTIN credentials. Navigate to
          <strong> Services → Returns → Returns Dashboard</strong>. Select the financial year and
          return filing period (month or quarter). Click <strong>Prepare Online</strong> under GSTR-1.
        </p>
      </section>

      <section>
        <h2>Step 2: Add B2B Invoices (Table 4A)</h2>
        <p>
          Click <strong>4A - B2B Invoices</strong>. Enter the buyer&apos;s GSTIN, invoice number,
          date, taxable value, and applicable GST rate. The system auto-calculates CGST, SGST, and
          IGST. Add all invoices for registered buyers with value above ₹2.5 lakh. You can also
          upload invoices in bulk using the <strong>offline tool</strong> or JSON format.
        </p>
      </section>

      <section>
        <h2>Step 3: Add B2C Sales (Tables 5A & 7)</h2>
        <p>
          <strong>Table 5A:</strong> B2C Large — interstate sales to unregistered buyers above ₹2.5 lakh
          (POS-wise). <strong>Table 7:</strong> B2C Small — all other B2C sales, reported as a consolidated
          rate-wise summary. For most small businesses, Table 7 is where the bulk of retail sales appear.
        </p>
      </section>

      <section>
        <h2>Step 4: Add Credit/Debit Notes (Table 9)</h2>
        <p>
          Report any credit notes or debit notes issued during the period. Link each note to the original
          invoice. Credit notes reduce your output liability; debit notes increase it. Ensure the note
          number, date, and original invoice reference are correct.
        </p>
      </section>

      <section>
        <h2>Step 5: Add Export & SEZ Invoices (Table 6A)</h2>
        <p>
          Report export invoices with or without payment of IGST, and supplies to SEZ units/developers.
          Include shipping bill number and port code for exports. This data is used by customs for
          IGST refund processing.
        </p>
      </section>

      <section>
        <h2>Step 6: HSN Summary (Table 12)</h2>
        <p>
          Add a summary of outward supplies by HSN code. Businesses with turnover above ₹5 crore must
          report 6-digit HSN codes; others report 4-digit codes. Use our{" "}
          <Link to="/hsn-sac-finder">HSN/SAC Code Finder</Link> to look up correct codes for your products.
        </p>
      </section>

      <section>
        <h2>Step 7: Preview, Submit & File</h2>
        <p>
          Click <strong>Preview</strong> to verify all entries. Check the summary of taxable values and
          tax amounts. Once satisfied, click <strong>Submit</strong>. After submission, the data is frozen
          and cannot be changed (amendments go in the next period&apos;s GSTR-1). Finally, click{" "}
          <strong>File GSTR-1</strong> with DSC or EVC. You&apos;ll receive an ARN (Acknowledgment Reference
          Number) confirming successful filing.
        </p>
      </section>

      <section>
        <h2>Common Mistakes to Avoid</h2>
        <ul>
          <li>Wrong GSTIN of buyer — causes ITC mismatch in their GSTR-2B</li>
          <li>Missing credit notes — inflates your output liability</li>
          <li>Incorrect HSN codes — may trigger notices during audit</li>
          <li>Filing after due date — attracts late fee of ₹50/day</li>
          <li>Not reconciling with books — discrepancies flagged in GSTR-9</li>
        </ul>
        <p>
          Use our <Link to="/calculator">GST Calculator</Link> to verify tax amounts and the{" "}
          <Link to="/late-fee-calculator">Late Fee Calculator</Link> if you&apos;re filing late.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>
        <dl className="blog-faq">
          <dt>What is GSTR-1?</dt>
          <dd>GSTR-1 is a monthly/quarterly return for outward supplies. All regular GST taxpayers must file it.</dd>
          <dt>What is the due date for GSTR-1?</dt>
          <dd>Monthly: 11th of the next month. QRMP quarterly: 13th of the month after the quarter.</dd>
          <dt>Can I file GSTR-1 after the due date?</dt>
          <dd>Yes, but late filing attracts ₹50/day (₹25 CGST + ₹25 SGST), max ₹10,000.</dd>
          <dt>Do I need a digital signature to file?</dt>
          <dd>Companies/LLPs need DSC. Others can use EVC via Aadhaar OTP.</dd>
          <dt>What invoices go into GSTR-1?</dt>
          <dd>B2B invoices, B2C large/small, credit/debit notes, exports, and advances received.</dd>
        </dl>
      </section>

      <section className="blog-cta">
        <p>
          <Link to="/">Try DoAide GST free</Link> — automate GSTR-1 preparation, invoice management,
          and ITC reconciliation. No credit card required.
        </p>
      </section>
    </article>
  );
}
