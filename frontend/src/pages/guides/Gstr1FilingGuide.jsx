import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import ShareButtons from "../../components/ShareButtons";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FAQ_ITEMS = [
  {
    q: "What is GSTR-1?",
    a: "GSTR-1 is a monthly or quarterly return for reporting outward supplies (sales). It includes B2B invoices, B2C sales, credit/debit notes, exports, and advance receipts. Your data flows into buyers' GSTR-2B for ITC claims.",
  },
  {
    q: "What is the due date for GSTR-1?",
    a: "Monthly filers: 11th of the following month. Quarterly filers under QRMP: 13th of the month after the quarter. IFF (Invoice Furnishing Facility) for QRMP filers is due by the 13th of each month.",
  },
  {
    q: "Can GSTR-1 be revised after filing?",
    a: "No, GSTR-1 cannot be revised once filed. Errors must be corrected through amendments in the next period's GSTR-1. For example, a wrong invoice in October's GSTR-1 should be amended in November's GSTR-1.",
  },
  {
    q: "What happens if I file GSTR-1 late?",
    a: "Late fee: Rs 50/day (Rs 25 CGST + Rs 25 SGST), capped at Rs 10,000. For nil returns: Rs 20/day (Rs 10 + Rs 10). Your buyers also cannot claim ITC on your invoices until you file.",
  },
  {
    q: "What is the difference between GSTR-1 and GSTR-3B?",
    a: "GSTR-1 reports detailed outward supply data (each invoice). GSTR-3B is a summary return for declaring liability, claiming ITC, and paying tax. Both must be filed — GSTR-1 feeds buyers' ITC; GSTR-3B is where you pay.",
  },
  {
    q: "Who is eligible for quarterly GSTR-1 under QRMP?",
    a: "Businesses with aggregate turnover up to Rs 5 crore in the previous financial year can opt for the QRMP (Quarterly Return Monthly Payment) scheme. Under QRMP, GSTR-1 is filed quarterly but tax is paid monthly.",
  },
];

const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to File GSTR-1",
  description: "Step-by-step guide to filing GSTR-1 for outward supplies on the GST portal",
  totalTime: "PT45M",
  step: [
    { "@type": "HowToStep", name: "Login to GST Portal", text: "Go to gst.gov.in and log in with your credentials." },
    { "@type": "HowToStep", name: "Navigate to GSTR-1", text: "Go to Returns > Returns Dashboard > Select period > GSTR-1 > Prepare Online." },
    { "@type": "HowToStep", name: "Add B2B Invoices (Table 4)", text: "Enter invoices issued to registered businesses with their GSTIN, invoice number, date, value, and tax amounts." },
    { "@type": "HowToStep", name: "Add B2C Large (Table 5)", text: "Add invoices above Rs 2.5 lakhs to unregistered persons with state-wise breakup." },
    { "@type": "HowToStep", name: "Add B2C Small (Table 7)", text: "Enter aggregate inter-state sales to unregistered persons below Rs 2.5 lakhs, state-wise." },
    { "@type": "HowToStep", name: "Add Credit/Debit Notes (Table 9)", text: "Enter any credit notes or debit notes issued during the period." },
    { "@type": "HowToStep", name: "Add HSN Summary (Table 12)", text: "Provide HSN-wise summary of outward supplies with quantity and value." },
    { "@type": "HowToStep", name: "Preview and Verify", text: "Review the GSTR-1 summary to ensure all data is correct." },
    { "@type": "HowToStep", name: "Submit GSTR-1", text: "Click Submit to freeze the data. After submission, no changes can be made." },
    { "@type": "HowToStep", name: "File with DSC or EVC", text: "File the return using Digital Signature Certificate or Electronic Verification Code." },
  ],
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
  { name: "How to File GSTR-1" },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading">Frequently Asked Questions</h2>
      <dl className="compare-faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="compare-faq-item">
            <dt>
              <button
                className="compare-faq-q"
                aria-expanded={openIndex === i}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {item.q}
                <span aria-hidden="true">{openIndex === i ? "−" : "+"}</span>
              </button>
            </dt>
            {openIndex === i && <dd className="compare-faq-a">{item.a}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Gstr1FilingGuide() {
  usePageTitle("How to File GSTR-1 — Step-by-Step Guide 2026");

  return (
    <div className="tool-page">
      <SeoHead
        title="How to File GSTR-1 — Complete Step-by-Step Guide 2026"
        description="Learn how to file GSTR-1 online step by step. Covers B2B invoices, B2C sales, credit notes, HSN summary, due dates, penalties, and common mistakes. Updated for 2026."
        path="/guides/how-to-file-gstr-1"
        jsonLd={[HOWTO_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <article className="blog-article">
            <h1>How to File GSTR-1 &mdash; Complete Step-by-Step Guide</h1>
            <p className="blog-meta">Updated October 2026 &middot; 12 min read</p>

            <section>
              <h2>What Is GSTR-1?</h2>
              <p>
                GSTR-1 is a GST return that contains details of all outward supplies (sales) made by a
                registered taxpayer during a given period. It includes business-to-business (B2B) invoices,
                business-to-consumer (B2C) sales, export invoices, credit and debit notes, and advance
                receipts.
              </p>
              <p>
                GSTR-1 is critical because the data you report here flows directly into your buyers&apos;
                GSTR-2B statement. If you do not file GSTR-1 or report incorrect data, your buyers cannot
                claim Input Tax Credit on those invoices. This makes accurate and timely GSTR-1 filing
                essential for the entire GST chain.
              </p>
            </section>

            <section>
              <h2>Who Must File GSTR-1?</h2>
              <p>All registered taxpayers must file GSTR-1, with these exceptions:</p>
              <ul>
                <li><strong>Composition scheme dealers:</strong> File CMP-08 instead of GSTR-1</li>
                <li><strong>Input Service Distributors:</strong> File GSTR-6 instead</li>
                <li><strong>Non-resident taxable persons:</strong> File GSTR-5 instead</li>
                <li><strong>TDS deductors:</strong> File GSTR-7 instead</li>
                <li><strong>E-commerce operators:</strong> File GSTR-8 for TCS</li>
              </ul>
              <p>
                Regular registered taxpayers file GSTR-1 every month. Businesses under the QRMP scheme
                (turnover up to Rs 5 crore) can file GSTR-1 quarterly, but they should use the Invoice
                Furnishing Facility (IFF) to upload B2B invoices monthly so buyers can claim ITC sooner.
              </p>
            </section>

            <section>
              <h2>GSTR-1 Due Dates</h2>
              <table className="blog-table">
                <thead>
                  <tr>
                    <th>Filing Frequency</th>
                    <th>Due Date</th>
                    <th>Applicable To</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Monthly</td>
                    <td>11th of the following month</td>
                    <td>Turnover above Rs 5 crore</td>
                  </tr>
                  <tr>
                    <td>Quarterly (QRMP)</td>
                    <td>13th of month after quarter</td>
                    <td>Turnover up to Rs 5 crore</td>
                  </tr>
                  <tr>
                    <td>IFF (optional for QRMP)</td>
                    <td>13th of each month</td>
                    <td>B2B invoices only, up to Rs 50 lakhs</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Check our <Link to="/due-dates">GST Due Dates Calendar</Link> for exact dates
                for every month and return type.
              </p>
            </section>

            <section>
              <h2>Data You Need Before Filing GSTR-1</h2>
              <ul>
                <li>All sales invoices issued during the period</li>
                <li>Credit notes and debit notes issued</li>
                <li>Export invoices with shipping bill numbers</li>
                <li>Advances received for which invoices are not yet issued</li>
                <li>Adjustment of advances against invoices</li>
                <li>HSN-wise summary of outward supplies</li>
                <li>Amendments to invoices from previous periods (if any)</li>
              </ul>
            </section>

            <section>
              <h2>Step-by-Step GSTR-1 Filing Process</h2>

              <h3>Step 1: Login to the GST Portal</h3>
              <p>
                Go to <strong>gst.gov.in</strong> and log in with your username and password.
                Navigate to <strong>Returns &gt; Returns Dashboard</strong>.
              </p>

              <h3>Step 2: Select the Return Period</h3>
              <p>
                Select the financial year and the month (or quarter for QRMP filers) for which
                you are filing GSTR-1. Click <strong>Search</strong> and then click
                <strong> Prepare Online</strong> under GSTR-1.
              </p>

              <h3>Step 3: Add B2B Invoices (Table 4A/4B)</h3>
              <p>
                Enter details of all invoices issued to registered businesses. For each invoice,
                provide the buyer&apos;s GSTIN, invoice number, invoice date, total value, taxable
                value, and tax amounts (IGST for inter-state, CGST+SGST for intra-state). You can
                also upload invoices in bulk using the offline tool or Excel template.
              </p>
              <p>
                Use the <Link to="/lookup">GSTIN Lookup tool</Link> to verify buyer GSTINs
                before filing. A wrong GSTIN means your buyer cannot claim ITC.
              </p>

              <h3>Step 4: Add B2C Large Invoices (Table 5)</h3>
              <p>
                Enter inter-state invoices above Rs 2.5 lakhs issued to unregistered persons or
                consumers. These are reported with place of supply (state code) for proper tax
                classification.
              </p>

              <h3>Step 5: Add Credit and Debit Notes (Table 9)</h3>
              <p>
                If you issued any credit notes (for returns, discounts) or debit notes (for
                additional charges) during the period, enter them here with reference to the
                original invoice.
              </p>

              <h3>Step 6: Add Export Invoices (Table 6)</h3>
              <p>
                For exports, enter shipping bill number, port code, and whether the export is
                with payment of IGST or under bond/LUT. Export invoices are zero-rated.
              </p>

              <h3>Step 7: Add B2C Small (Table 7)</h3>
              <p>
                Enter aggregate state-wise summary of inter-state sales to unregistered persons
                where individual invoice value is Rs 2.5 lakhs or below. Intra-state B2C sales
                are reported rate-wise in Table 7B.
              </p>

              <h3>Step 8: Add Nil-Rated and Exempt Supplies (Table 8)</h3>
              <p>
                Report the value of nil-rated, exempt, and non-GST supplies made during the period.
              </p>

              <h3>Step 9: Add HSN Summary (Table 12)</h3>
              <p>
                Provide HSN-wise summary of all outward supplies. The level of HSN detail required
                depends on your turnover:
              </p>
              <ul>
                <li><strong>Up to Rs 5 crore:</strong> 4-digit HSN for B2B supplies</li>
                <li><strong>Above Rs 5 crore:</strong> 6-digit HSN mandatory for all supplies</li>
              </ul>
              <p>
                Use our <Link to="/hsn">HSN Code Finder</Link> to look up the correct codes.
              </p>

              <h3>Step 10: Preview, Submit, and File</h3>
              <p>
                Click <strong>Generate GSTR-1 Summary</strong> to preview. Verify all numbers
                match your books. Click <strong>Submit</strong> to freeze the data (no further
                changes after this). Then click <strong>File GSTR-1</strong> and authenticate
                with DSC or EVC. You will receive an ARN confirming successful filing.
              </p>
            </section>

            <section>
              <h2>Understanding GSTR-1 Tables</h2>
              <table className="blog-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Description</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>4A</td><td>B2B invoices (taxable)</td><td>Invoice-level details for registered buyers</td></tr>
                  <tr><td>4B</td><td>B2B invoices (reverse charge)</td><td>Supplies where buyer pays GST</td></tr>
                  <tr><td>5</td><td>B2C large invoices</td><td>Inter-state, value above Rs 2.5 lakhs</td></tr>
                  <tr><td>6</td><td>Export invoices</td><td>With IGST or under bond/LUT</td></tr>
                  <tr><td>7</td><td>B2C small</td><td>State-wise aggregate summary</td></tr>
                  <tr><td>8</td><td>Nil-rated / exempt</td><td>Non-taxable and exempt supplies</td></tr>
                  <tr><td>9</td><td>Credit / debit notes</td><td>Amendments to original invoices</td></tr>
                  <tr><td>10-11</td><td>Amendments</td><td>Corrections to prior period data</td></tr>
                  <tr><td>12</td><td>HSN summary</td><td>HSN-wise outward supply summary</td></tr>
                  <tr><td>13</td><td>Documents issued</td><td>Summary of document serial numbers used</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h2>Late Filing Penalties</h2>
              <ul>
                <li><strong>Late fee:</strong> Rs 50 per day (Rs 25 CGST + Rs 25 SGST), capped at Rs 10,000 per return</li>
                <li><strong>Nil return late fee:</strong> Rs 20 per day (Rs 10 + Rs 10), capped at Rs 500</li>
                <li><strong>Buyer ITC impact:</strong> Your buyers cannot claim ITC on your invoices until you file GSTR-1</li>
                <li><strong>Cascading block:</strong> If GSTR-1 is not filed, GSTR-3B filing is blocked</li>
              </ul>
            </section>

            <section>
              <h2>Common Mistakes to Avoid</h2>
              <ul>
                <li><strong>Wrong GSTIN:</strong> Double-check buyer GSTINs. A wrong GSTIN means your buyer&apos;s ITC is affected</li>
                <li><strong>Missing invoices:</strong> Include all invoices issued during the period, not just paid ones</li>
                <li><strong>Wrong place of supply:</strong> Inter-state vs intra-state determines IGST vs CGST+SGST</li>
                <li><strong>HSN code errors:</strong> Wrong HSN codes can trigger notices. Use our <Link to="/hsn">HSN Code Finder</Link></li>
                <li><strong>Not filing nil return:</strong> Even if there are no sales, you must file a nil GSTR-1</li>
                <li><strong>Mismatch with e-invoices:</strong> If you generate e-invoices, they auto-populate in GSTR-1. Do not duplicate them</li>
              </ul>
            </section>

            <section>
              <h2>How DoAide GST Helps with GSTR-1</h2>
              <p>
                DoAide GST simplifies GSTR-1 preparation by automatically organizing your sales invoices
                into the correct tables, validating GSTINs and HSN codes, and generating the HSN summary.
                Upload your invoices in any format and DoAide&apos;s AI extracts all the data you need.
              </p>
              <ul>
                <li>AI-powered invoice data extraction from PDFs and images</li>
                <li>Automatic GSTIN validation for all buyer entries</li>
                <li>HSN code verification and auto-classification</li>
                <li>GSTR-1 summary generation ready for the portal</li>
                <li>Deadline alerts so you never file late</li>
              </ul>
            </section>

            <FaqSection />

            <section className="compare-cta">
              <h2>Prepare Your GSTR-1 with DoAide GST</h2>
              <p>
                Upload your invoices and let DoAide prepare your GSTR-1 automatically.
                Free for up to 50 invoices/month.
              </p>
              <div className="compare-cta-buttons">
                <Link to="/" className="btn btn-primary">Create Free Account</Link>
                <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
              </div>
            </section>

            <ShareButtons
              path="/guides/how-to-file-gstr-1"
              text="How to file GSTR-1 — complete step-by-step guide on DoAide GST"
              label="Share this guide"
            />
            <section className="compare-links">
              <h2>Related Guides</h2>
              <div className="compare-links-grid">
                <Link to="/guides/how-to-file-gstr-3b">How to File GSTR-3B</Link>
                <Link to="/guides/gst-registration">GST Registration Guide</Link>
                <Link to="/guides">All GST Guides</Link>
                <Link to="/due-dates">GST Due Dates Calendar</Link>
                <Link to="/hsn">HSN Code Finder</Link>
                <Link to="/best-gst-software">Best GST Software India</Link>
              </div>
            </section>
          </article>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
