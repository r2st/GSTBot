import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function GstComplianceChecklist() {
  usePageTitle("GST Compliance Checklist for Small Businesses");

  return (
    <article className="blog-article">
      <h1>GST Compliance Checklist for Small Businesses</h1>
      <p className="blog-meta">Updated October 2026 · 7 min read</p>

      <section>
        <h2>Why GST Compliance Matters for Small Businesses</h2>
        <p>
          Non-compliance with GST regulations can result in penalties, interest charges, and even
          cancellation of your GST registration. For small businesses, the impact is
          disproportionate — a single missed deadline can trigger cascading issues. This checklist
          helps you stay on track.
        </p>
      </section>

      <section>
        <h2>Registration and Setup</h2>
        <ul className="blog-checklist">
          <li>Obtain GST registration if turnover exceeds ₹40 lakhs (₹20 lakhs for services, ₹10 lakhs for NE states)</li>
          <li>Display GSTIN prominently at your place of business</li>
          <li>Update GST registration within 15 days of any business changes (address, bank account, partners)</li>
          <li>Evaluate whether the Composition Scheme suits your business (turnover under ₹1.5 crore for goods)</li>
          <li>Set up a proper invoicing system with mandatory fields: GSTIN, HSN/SAC codes, tax breakup</li>
        </ul>
      </section>

      <section>
        <h2>Monthly Compliance</h2>
        <ul className="blog-checklist">
          <li>Issue GST-compliant invoices for every taxable supply</li>
          <li>Maintain a sales register and purchase register</li>
          <li>File GSTR-1 by the 11th of the following month (outward supplies)</li>
          <li>Download and review GSTR-2B after the 14th (auto-generated ITC statement)</li>
          <li>Reconcile your purchase register with GSTR-2B before filing GSTR-3B</li>
          <li>File GSTR-3B by the 20th and pay any net tax due</li>
          <li>Generate e-way bills for goods movement above ₹50,000</li>
        </ul>
      </section>

      <section>
        <h2>Quarterly Compliance (QRMP Scheme)</h2>
        <p>
          Businesses with turnover up to ₹5 crore can opt for the QRMP (Quarterly Return Monthly
          Payment) scheme. Under QRMP:
        </p>
        <ul className="blog-checklist">
          <li>File GSTR-1 quarterly instead of monthly</li>
          <li>Use IFF (Invoice Furnishing Facility) to report B2B invoices in the first two months of the quarter</li>
          <li>Pay tax monthly using the fixed-sum or self-assessment method via PMT-06</li>
          <li>File GSTR-3B quarterly by the 22nd or 24th (depending on state)</li>
        </ul>
      </section>

      <section>
        <h2>Annual Compliance</h2>
        <ul className="blog-checklist">
          <li>File GSTR-9 (annual return) by 31st December of the following financial year</li>
          <li>Reconcile annual figures: total turnover, tax paid, and ITC claimed against books</li>
          <li>File GSTR-9C (reconciliation statement) if turnover exceeds ₹5 crore — requires CA certification</li>
          <li>Review and reverse any ineligible ITC claimed during the year</li>
          <li>Ensure all credit/debit notes are reported by 30th November</li>
        </ul>
      </section>

      <section>
        <h2>Input Tax Credit Best Practices</h2>
        <ul className="blog-checklist">
          <li>Claim ITC only on invoices reflected in your GSTR-2B</li>
          <li>Verify supplier GSTIN status before large purchases — suspended or cancelled GSTINs mean no ITC</li>
          <li>Reverse ITC for payments not made within 180 days of the invoice date</li>
          <li>Do not claim ITC on blocked credits (Section 17(5)): food, beverages, club memberships, personal vehicles</li>
          <li>Maintain documentary evidence for ITC claims: tax invoice, debit note, or bill of entry</li>
        </ul>
      </section>

      <section>
        <h2>Record Keeping</h2>
        <p>
          GST law requires businesses to maintain records for at least 6 years (72 months) from the
          due date of filing the annual return. Records to maintain include:
        </p>
        <ul>
          <li>All invoices issued and received</li>
          <li>Purchase and sales registers</li>
          <li>Stock register</li>
          <li>Input tax credit availed and reversed</li>
          <li>Output tax liability and payment records</li>
          <li>E-way bills generated</li>
        </ul>
      </section>

      <section>
        <h2>Penalties for Non-Compliance</h2>
        <table className="blog-table">
          <thead>
            <tr>
              <th>Offence</th>
              <th>Penalty</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Late filing of GSTR-3B</td><td>₹50/day (₹20 for nil), max ₹5,000</td></tr>
            <tr><td>Late filing of GSTR-1</td><td>₹50/day (₹20 for nil), max ₹5,000</td></tr>
            <tr><td>Non-filing for 6+ months</td><td>GST registration cancellation</td></tr>
            <tr><td>Incorrect ITC claim</td><td>ITC reversal + 18% interest</td></tr>
            <tr><td>Missing e-way bill</td><td>₹10,000 or tax evaded, whichever is greater</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Automate Your GST Compliance</h2>
        <p>
          Manual GST compliance is error-prone and time-consuming, especially for small businesses
          without a dedicated accounts team. DoAide GST automates invoice management, GSTR-2B
          reconciliation, ITC calculation, and return preparation — helping you stay compliant
          without the overhead.
        </p>
        <p>
          <Link to="/">Get started with DoAide GST — free forever for up to 50 invoices/month →</Link>
        </p>
      </section>
    </article>
  );
}
