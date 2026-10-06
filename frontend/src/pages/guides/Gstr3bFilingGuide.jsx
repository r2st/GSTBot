import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import ShareButtons from "../../components/ShareButtons";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FAQ_ITEMS = [
  {
    q: "What is GSTR-3B?",
    a: "GSTR-3B is a monthly self-declaration return where registered taxpayers summarize their output tax liability, claim Input Tax Credit (ITC), and pay the net GST due. Unlike GSTR-1 which has invoice-level detail, GSTR-3B reports aggregate figures.",
  },
  {
    q: "Can GSTR-3B be revised after filing?",
    a: "No. GSTR-3B cannot be revised once filed. Any errors in a filed GSTR-3B must be corrected in the next period's return. This is why it is critical to verify all figures, especially ITC claims, before filing.",
  },
  {
    q: "What happens if I miss the GSTR-3B deadline?",
    a: "Late filing attracts a penalty of Rs 50 per day (Rs 25 CGST + Rs 25 SGST), capped at Rs 5,000. For nil returns, the penalty is Rs 20 per day. Additionally, 18% annual interest is charged on unpaid tax from the due date. You cannot file the next period's returns until the current GSTR-3B is filed.",
  },
  {
    q: "How is ITC claimed in GSTR-3B?",
    a: "ITC is claimed in Table 4 of GSTR-3B. You should reconcile your purchase register with GSTR-2B before claiming ITC. Only eligible ITC that appears in your GSTR-2B should be claimed. Blocked credits under Section 17(5) must be excluded.",
  },
  {
    q: "What is the difference between GSTR-1 and GSTR-3B?",
    a: "GSTR-1 reports detailed outward supply data (each invoice separately). GSTR-3B is a summary return with aggregate output liability, ITC claim, and tax payment. GSTR-1 feeds your buyers' ITC. GSTR-3B is where you settle your own tax liability.",
  },
  {
    q: "Can I file GSTR-3B quarterly?",
    a: "Yes. Businesses with turnover up to Rs 5 crore can opt for the QRMP scheme and file GSTR-3B quarterly. Under QRMP, tax is still paid monthly through a challan, but the return is filed once per quarter.",
  },
];

const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to File GSTR-3B",
  description: "Step-by-step guide to filing GSTR-3B summary return on the GST portal",
  totalTime: "PT30M",
  step: [
    { "@type": "HowToStep", name: "Login to GST Portal", text: "Go to gst.gov.in and log in with your credentials." },
    { "@type": "HowToStep", name: "Navigate to GSTR-3B", text: "Go to Returns > Returns Dashboard > Select period > GSTR-3B > Prepare Online." },
    { "@type": "HowToStep", name: "Fill Table 3.1 — Outward Supplies", text: "Enter total taxable value and tax for outward supplies, including reverse charge and e-commerce supplies." },
    { "@type": "HowToStep", name: "Fill Table 3.2 — Inter-State Supplies", text: "Enter inter-state supplies to unregistered persons and composition dealers." },
    { "@type": "HowToStep", name: "Fill Table 4 — Eligible ITC", text: "Enter ITC claimed, reversed, and net ITC. Reconcile with GSTR-2B." },
    { "@type": "HowToStep", name: "Fill Table 5 — Exempt Supplies", text: "Enter nil-rated, exempt, and non-GST outward supplies and inward supplies." },
    { "@type": "HowToStep", name: "Fill Table 6 — Payment of Tax", text: "Offset liability using ITC and pay remaining balance via electronic cash ledger." },
    { "@type": "HowToStep", name: "Preview and Submit", text: "Verify all figures, submit the return, and file with DSC or EVC." },
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
  { name: "How to File GSTR-3B" },
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

export default function Gstr3bFilingGuide() {
  usePageTitle("How to File GSTR-3B — Step-by-Step Guide 2026");

  return (
    <div className="tool-page">
      <SeoHead
        title="How to File GSTR-3B — Complete Step-by-Step Filing Guide 2026"
        description="Learn how to file GSTR-3B online step by step. Covers due dates, ITC claim, tax payment, common errors, and penalties. Updated for 2026."
        path="/guides/how-to-file-gstr-3b"
        jsonLd={[HOWTO_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <article className="blog-article">
            <h1>How to File GSTR-3B &mdash; Complete Step-by-Step Guide</h1>
            <p className="blog-meta">Updated October 2026 &middot; 12 min read</p>

            <section>
              <h2>What Is GSTR-3B?</h2>
              <p>
                GSTR-3B is a monthly self-declaration summary return filed by every regular registered
                taxpayer under GST. In this return, you declare your total output tax liability from
                sales, claim Input Tax Credit (ITC) on purchases, and pay the net tax due to the
                government.
              </p>
              <p>
                Unlike GSTR-1 which reports individual invoice details, GSTR-3B contains only aggregate
                numbers. It is the return through which actual tax payment happens. Once filed, GSTR-3B
                cannot be revised &mdash; any corrections must be made in a subsequent period&apos;s return.
                This makes it essential to verify all figures before filing.
              </p>
            </section>

            <section>
              <h2>Who Must File GSTR-3B?</h2>
              <p>
                All regular registered taxpayers must file GSTR-3B. The exceptions are composition
                scheme dealers (who file CMP-08 quarterly), Input Service Distributors (GSTR-6),
                non-resident taxable persons (GSTR-5), and TDS deductors (GSTR-7).
              </p>
              <p>
                Businesses under the QRMP scheme (turnover up to Rs 5 crore) file GSTR-3B quarterly
                instead of monthly. However, they must still pay tax monthly through a challan using
                either the fixed sum method or the self-assessment method.
              </p>
            </section>

            <section>
              <h2>GSTR-3B Due Dates</h2>
              <h3>Monthly Filers</h3>
              <table className="blog-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Due Date</th>
                    <th>States</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Category A</td>
                    <td>20th of following month</td>
                    <td>Chhattisgarh, Madhya Pradesh, Gujarat, Maharashtra, Karnataka, Goa, Kerala, Tamil Nadu, Telangana, Andhra Pradesh, Daman &amp; Diu, Dadra &amp; Nagar Haveli, Puducherry, Andaman &amp; Nicobar, Lakshadweep</td>
                  </tr>
                  <tr>
                    <td>Category B</td>
                    <td>22nd of following month</td>
                    <td>Himachal Pradesh, Punjab, Uttarakhand, Haryana, Rajasthan, Uttar Pradesh, Bihar, Sikkim, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, Meghalaya, Assam, West Bengal, Jharkhand, Odisha, Jammu &amp; Kashmir, Ladakh, Chandigarh, Delhi</td>
                  </tr>
                </tbody>
              </table>

              <h3>Quarterly Filers (QRMP Scheme)</h3>
              <p>
                QRMP filers must file GSTR-3B by the 22nd or 24th of the month following the quarter,
                depending on their state category. Tax payment is due monthly by the 25th of the
                following month.
              </p>
              <p>
                See our <Link to="/due-dates">GST Due Dates Calendar</Link> for exact dates
                for every month.
              </p>
            </section>

            <section>
              <h2>What You Need Before Filing GSTR-3B</h2>
              <ul>
                <li><strong>Sales register:</strong> Total output tax liability for the period</li>
                <li><strong>GSTR-2B statement:</strong> Your auto-generated ITC statement for reconciliation</li>
                <li><strong>Purchase register:</strong> Reconciled with GSTR-2B to determine eligible ITC</li>
                <li><strong>Previous GSTR-3B:</strong> For carried-forward ITC and liability figures</li>
                <li><strong>Reverse charge details:</strong> Any inward supplies on which you owe reverse charge GST</li>
                <li><strong>Electronic cash and credit ledger balances:</strong> To plan tax payment</li>
              </ul>
              <p>
                DoAide GST automatically reconciles your purchases with GSTR-2B and calculates your eligible
                ITC, so these figures are ready when you need them.
              </p>
            </section>

            <section>
              <h2>Step-by-Step GSTR-3B Filing Process</h2>

              <h3>Step 1: Login to the GST Portal</h3>
              <p>
                Go to <strong>gst.gov.in</strong> and log in. Navigate to{" "}
                <strong>Returns &gt; Returns Dashboard</strong>. Select the financial year
                and return period.
              </p>

              <h3>Step 2: Open GSTR-3B</h3>
              <p>
                Click <strong>Prepare Online</strong> under GSTR-3B. The system may auto-populate
                some figures from your GSTR-1 and GSTR-2B. Review these pre-filled values carefully
                before accepting them.
              </p>

              <h3>Step 3: Table 3.1 &mdash; Tax on Outward and Reverse Charge Supplies</h3>
              <p>
                Enter the taxable value and tax amounts for:
              </p>
              <ul>
                <li><strong>(a) Outward taxable supplies (other than zero-rated, nil-rated, and exempt):</strong> Your regular taxable sales</li>
                <li><strong>(b) Outward taxable supplies (zero-rated):</strong> Exports and SEZ supplies</li>
                <li><strong>(c) Other outward supplies (nil-rated, exempt):</strong> Non-taxable supplies</li>
                <li><strong>(d) Inward supplies on reverse charge:</strong> Purchases where you owe the GST instead of the supplier</li>
                <li><strong>(e) Non-GST outward supplies:</strong> Supplies outside the scope of GST (petroleum, alcohol for human consumption)</li>
              </ul>

              <h3>Step 4: Table 3.2 &mdash; Inter-State Supplies</h3>
              <p>
                Enter details of inter-state supplies made to unregistered persons, composition
                taxable persons, and UIN holders. Provide state-wise breakup with place of supply
                and taxable value.
              </p>

              <h3>Step 5: Table 4 &mdash; Eligible ITC</h3>
              <p>
                This is the most important table in GSTR-3B. Enter your Input Tax Credit claim:
              </p>
              <ul>
                <li><strong>(A) ITC Available:</strong> Import of goods, import of services, inward supplies liable to reverse charge, inward supplies from ISD, all other ITC</li>
                <li><strong>(B) ITC Reversed:</strong> As per Rules 42 &amp; 43 (apportioned for exempt use), blocked credits under Section 17(5)</li>
                <li><strong>(C) Net ITC = (A) minus (B):</strong> The ITC you actually claim</li>
                <li><strong>(D) Ineligible ITC:</strong> ITC on composition dealer supplies, non-GST supplies, personal consumption</li>
              </ul>
              <p>
                Reconcile your ITC claim with your GSTR-2B statement before filling this table.
                DoAide GST does this reconciliation automatically and shows you exactly how much
                ITC you can claim.
              </p>

              <h3>Step 6: Table 5 &mdash; Exempt, Nil-Rated, and Non-GST Supplies</h3>
              <p>
                Enter the value of exempt, nil-rated, and non-GST supplies for both outward
                (inter-state and intra-state) and inward supplies. This includes supplies to
                and from composition dealers, exempt supplies, and nil-rated goods.
              </p>

              <h3>Step 7: Table 5.1 &mdash; Interest and Late Fee</h3>
              <p>
                If you are filing late, the system calculates interest at 18% per annum on
                unpaid tax and adds the applicable late fee. Review these amounts.
              </p>

              <h3>Step 8: Table 6 &mdash; Payment of Tax</h3>
              <p>
                This is where you settle your tax liability. The system shows your total liability
                (output tax minus ITC). Follow this order for offsetting:
              </p>
              <ol>
                <li>IGST credit offsets IGST liability first</li>
                <li>Remaining IGST credit offsets CGST, then SGST liability</li>
                <li>CGST credit offsets CGST liability, then IGST liability</li>
                <li>SGST credit offsets SGST liability, then IGST liability</li>
                <li>Any remaining liability is paid from the electronic cash ledger (create a challan)</li>
              </ol>
              <p>
                Use our <Link to="/calculator">GST Calculator</Link> to verify your tax amounts.
              </p>

              <h3>Step 9: Preview and Verify</h3>
              <p>
                Click <strong>Preview</strong> to review the complete GSTR-3B summary. Verify
                that output liability, ITC claim, and net tax payable match your books. Check
                that the GSTR-1 figures are consistent with the GSTR-3B output liability.
              </p>

              <h3>Step 10: Submit and File</h3>
              <p>
                Click <strong>Submit</strong> to freeze the data. After submission, make the tax
                payment if any balance is due (create a challan and pay through net banking, NEFT/RTGS,
                or over the counter). Then click <strong>File GSTR-3B</strong> and authenticate
                with DSC or EVC. You will receive a confirmation with ARN.
              </p>
            </section>

            <section>
              <h2>Understanding GSTR-3B Tables</h2>
              <table className="blog-table">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Description</th>
                    <th>What to Report</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>3.1</td><td>Outward supplies and reverse charge</td><td>Total output tax liability</td></tr>
                  <tr><td>3.2</td><td>Inter-state supplies</td><td>Supplies to unregistered/composition persons</td></tr>
                  <tr><td>4</td><td>Eligible ITC</td><td>ITC available, reversed, and net claim</td></tr>
                  <tr><td>5</td><td>Exempt/nil-rated supplies</td><td>Value of non-taxable supplies</td></tr>
                  <tr><td>5.1</td><td>Interest and late fee</td><td>Auto-calculated for late filing</td></tr>
                  <tr><td>6</td><td>Payment of tax</td><td>Liability offset and cash payment</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h2>Late Filing Penalties</h2>
              <ul>
                <li><strong>Late fee:</strong> Rs 50 per day (Rs 25 CGST + Rs 25 SGST), capped at Rs 5,000 per return period</li>
                <li><strong>Nil return late fee:</strong> Rs 20 per day (Rs 10 CGST + Rs 10 SGST), capped at Rs 500</li>
                <li><strong>Interest:</strong> 18% per annum on the net tax liability from the due date until payment</li>
                <li><strong>Return blocking:</strong> You cannot file subsequent GSTR-1 or GSTR-3B until the current period is filed</li>
                <li><strong>ITC restriction:</strong> Your ITC claim may be restricted if returns are not filed for two consecutive periods</li>
              </ul>
            </section>

            <section>
              <h2>Common Mistakes to Avoid</h2>
              <ul>
                <li><strong>Not reconciling with GSTR-2B:</strong> Claiming ITC without checking GSTR-2B leads to mismatches and potential notices</li>
                <li><strong>Wrong period selection:</strong> Ensure you are filing for the correct month/quarter</li>
                <li><strong>GSTR-1 and GSTR-3B mismatch:</strong> Output liability in GSTR-3B should be consistent with GSTR-1 data</li>
                <li><strong>Wrong ITC offset order:</strong> IGST credit must be used first against IGST liability, then CGST, then SGST</li>
                <li><strong>Forgetting reverse charge:</strong> Inward supplies on reverse charge must be included in Table 3.1(d)</li>
                <li><strong>Claiming blocked credits:</strong> Credits under Section 17(5) (motor vehicles, food, personal expenses, etc.) are not eligible</li>
                <li><strong>Not paying before filing:</strong> Any cash liability must be paid through a challan before filing</li>
              </ul>
            </section>

            <section>
              <h2>How DoAide GST Helps with GSTR-3B</h2>
              <p>
                DoAide GST automates the most tedious part of GSTR-3B preparation:
              </p>
              <ul>
                <li><strong>Automatic GSTR-2B reconciliation:</strong> Matches your purchases against GSTR-2B and flags mismatches</li>
                <li><strong>Eligible ITC calculation:</strong> Identifies blocked credits and calculates only the ITC you can legally claim</li>
                <li><strong>GSTR-3B summary preparation:</strong> Generates the complete GSTR-3B summary ready for the portal</li>
                <li><strong>Deadline alerts:</strong> Get notified before each GSTR-3B due date</li>
                <li><strong>Supplier compliance tracking:</strong> Know which suppliers have filed their GSTR-1 so your ITC is secure</li>
              </ul>
              <p>
                Check your upcoming deadlines on our <Link to="/due-dates">GST Due Dates Calendar</Link>.
              </p>
            </section>

            <FaqSection />

            <section className="compare-cta">
              <h2>Try DoAide GST Free &mdash; Automate Your GSTR-3B Preparation</h2>
              <p>
                Auto-reconcile with GSTR-2B, calculate eligible ITC, and prepare GSTR-3B in minutes.
                Free for up to 50 invoices/month.
              </p>
              <div className="compare-cta-buttons">
                <Link to="/" className="btn btn-primary">Create Free Account</Link>
                <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
              </div>
            </section>

            <ShareButtons
              path="/guides/how-to-file-gstr-3b"
              text="How to file GSTR-3B — complete step-by-step guide on DoAide GST"
              label="Share this guide"
            />
            <section className="compare-links">
              <h2>Related Guides</h2>
              <div className="compare-links-grid">
                <Link to="/guides/how-to-file-gstr-1">How to File GSTR-1</Link>
                <Link to="/guides/gst-registration">GST Registration Guide</Link>
                <Link to="/guides">All GST Guides</Link>
                <Link to="/due-dates">GST Due Dates Calendar</Link>
                <Link to="/calculator">GST Calculator</Link>
                <Link to="/lookup">GSTIN Lookup</Link>
                <Link to="/best-gst-software">Best GST Software India</Link>
                <Link to="/compare/cleartax">DoAide GST vs ClearTax</Link>
              </div>
            </section>
          </article>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
