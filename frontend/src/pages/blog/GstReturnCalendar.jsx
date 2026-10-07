import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function GstReturnCalendar() {
  usePageTitle("GST Return Filing Calendar 2026-27: All Due Dates");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Complete GST return filing calendar for FY 2026-27. Monthly due dates for GSTR-1, GSTR-3B, GSTR-4, GSTR-9, and CMP-08 with staggered deadlines by state.";

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
        headline: "GST Return Filing Calendar 2026-27: All Due Dates",
        description: "Complete GST return filing calendar for FY 2026-27 with monthly due dates for all return types.",
        url: "https://gst.doaide.com/blog/gst-return-filing-calendar-2026-27",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the due date for GSTR-1 filing?", acceptedAnswer: { "@type": "Answer", text: "GSTR-1 is due by the 11th of the following month for monthly filers. QRMP scheme taxpayers file quarterly by the 13th of the month after the quarter ends." } },
          { "@type": "Question", name: "Are GSTR-3B due dates same for all states?", acceptedAnswer: { "@type": "Answer", text: "No. GSTR-3B has staggered due dates: 20th for category A states and 22nd/24th for category B states. QRMP taxpayers file by the 22nd or 24th of the month after the quarter." } },
          { "@type": "Question", name: "When is GSTR-9 annual return due?", acceptedAnswer: { "@type": "Answer", text: "GSTR-9 annual return is due by 31st December of the following financial year. For FY 2026-27, the deadline is 31st December 2027." } },
          { "@type": "Question", name: "What happens if a due date falls on a holiday?", acceptedAnswer: { "@type": "Answer", text: "If a GST due date falls on a Sunday or public holiday, the government sometimes extends the deadline. Always check the GST portal for official notifications about extensions." } },
          { "@type": "Question", name: "Is there a penalty for late filing of nil returns?", acceptedAnswer: { "@type": "Answer", text: "Yes. Late fee for nil GSTR-3B is ₹20/day (₹10 CGST + ₹10 SGST). For nil GSTR-1, the late fee is also ₹20/day. Filing on time avoids these charges even when there is no tax liability." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>GST Return Filing Calendar 2026-27: All Due Dates</h1>
      <p className="blog-meta">Updated October 2026 · 12 min read</p>

      <section>
        <h2>Overview of GST Return Due Dates</h2>
        <p>
          Every GST-registered business in India must file returns on time to avoid late fees,
          interest charges, and compliance issues. This calendar covers all GST return due dates
          for Financial Year 2026-27 (April 2026 to March 2027), including GSTR-1, GSTR-3B,
          GSTR-4, GSTR-9, and CMP-08. Use our{" "}
          <Link to="/return-calendar">Return Due Date Calendar</Link> tool to get personalized
          reminders for your specific filing schedule.
        </p>
      </section>

      <section>
        <h2>Types of GST Returns and Filing Frequency</h2>
        <table>
          <thead>
            <tr>
              <th>Return</th>
              <th>Purpose</th>
              <th>Frequency</th>
              <th>Who Files</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>GSTR-1</td><td>Outward supplies (sales)</td><td>Monthly / Quarterly (QRMP)</td><td>Regular taxpayers</td></tr>
            <tr><td>GSTR-3B</td><td>Summary return + tax payment</td><td>Monthly / Quarterly (QRMP)</td><td>Regular taxpayers</td></tr>
            <tr><td>IFF</td><td>Invoice Furnishing Facility</td><td>Monthly (months 1 &amp; 2 of quarter)</td><td>QRMP taxpayers only</td></tr>
            <tr><td>CMP-08</td><td>Composition scheme statement</td><td>Quarterly</td><td>Composition dealers</td></tr>
            <tr><td>GSTR-4</td><td>Composition annual return</td><td>Annual</td><td>Composition dealers</td></tr>
            <tr><td>GSTR-5</td><td>Non-resident taxable person</td><td>Monthly</td><td>Non-resident taxpayers</td></tr>
            <tr><td>GSTR-6</td><td>Input Service Distributor</td><td>Monthly</td><td>ISDs</td></tr>
            <tr><td>GSTR-7</td><td>TDS return</td><td>Monthly</td><td>TDS deductors</td></tr>
            <tr><td>GSTR-8</td><td>TCS return</td><td>Monthly</td><td>E-commerce operators</td></tr>
            <tr><td>GSTR-9</td><td>Annual return</td><td>Annual</td><td>Regular taxpayers (&gt;₹2 Cr)</td></tr>
            <tr><td>GSTR-9C</td><td>Reconciliation statement</td><td>Annual</td><td>Taxpayers with turnover &gt;₹5 Cr</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>GSTR-3B Staggered Due Dates by State</h2>
        <p>
          GSTR-3B due dates vary by state category. The government divides states into two groups
          for staggered filing to reduce portal load:
        </p>
        <h3>Category A States — Due by 20th</h3>
        <p>
          Chhattisgarh, Madhya Pradesh, Gujarat, Maharashtra, Karnataka, Goa, Kerala,
          Tamil Nadu, Telangana, Andhra Pradesh, Daman &amp; Diu, Dadra &amp; Nagar Haveli,
          Puducherry, Andaman &amp; Nicobar, and Lakshadweep.
        </p>
        <h3>Category B States — Due by 22nd/24th</h3>
        <p>
          Himachal Pradesh, Punjab, Uttarakhand, Haryana, Rajasthan, Uttar Pradesh, Bihar,
          Sikkim, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, Meghalaya, Assam,
          West Bengal, Jharkhand, Odisha, Jammu &amp; Kashmir, Ladakh, Chandigarh, and Delhi.
        </p>
      </section>

      <section>
        <h2>Monthly Filing Calendar: April 2026 to March 2027</h2>

        <h3>April 2026 (Tax Period: March 2026)</h3>
        <ul>
          <li><strong>11th April</strong> — GSTR-1 (monthly filers) for March 2026</li>
          <li><strong>13th April</strong> — GSTR-1 (QRMP) for Jan-Mar 2026 quarter; IFF for March 2026</li>
          <li><strong>20th April</strong> — GSTR-3B (monthly, Category A) for March 2026</li>
          <li><strong>22nd April</strong> — GSTR-3B (monthly, Category B) for March 2026; GSTR-3B (QRMP, Category A) for Jan-Mar 2026</li>
          <li><strong>24th April</strong> — GSTR-3B (QRMP, Category B) for Jan-Mar 2026</li>
          <li><strong>18th April</strong> — CMP-08 for Jan-Mar 2026 quarter</li>
        </ul>

        <h3>May 2026 (Tax Period: April 2026)</h3>
        <ul>
          <li><strong>11th May</strong> — GSTR-1 (monthly) for April 2026</li>
          <li><strong>13th May</strong> — IFF (QRMP) for April 2026</li>
          <li><strong>20th May</strong> — GSTR-3B (monthly, Category A) for April 2026</li>
          <li><strong>22nd May</strong> — GSTR-3B (monthly, Category B) for April 2026</li>
        </ul>

        <h3>June 2026 (Tax Period: May 2026)</h3>
        <ul>
          <li><strong>11th June</strong> — GSTR-1 (monthly) for May 2026</li>
          <li><strong>13th June</strong> — IFF (QRMP) for May 2026</li>
          <li><strong>20th June</strong> — GSTR-3B (monthly, Category A) for May 2026</li>
          <li><strong>22nd June</strong> — GSTR-3B (monthly, Category B) for May 2026</li>
        </ul>

        <h3>July 2026 (Tax Period: June 2026 / Q1)</h3>
        <ul>
          <li><strong>11th July</strong> — GSTR-1 (monthly) for June 2026</li>
          <li><strong>13th July</strong> — GSTR-1 (QRMP) for Apr-Jun 2026 quarter; IFF for June 2026</li>
          <li><strong>18th July</strong> — CMP-08 for Apr-Jun 2026 quarter</li>
          <li><strong>20th July</strong> — GSTR-3B (monthly, Category A) for June 2026</li>
          <li><strong>22nd July</strong> — GSTR-3B (monthly, Category B) for June 2026; GSTR-3B (QRMP, Category A) for Apr-Jun 2026</li>
          <li><strong>24th July</strong> — GSTR-3B (QRMP, Category B) for Apr-Jun 2026</li>
        </ul>

        <h3>August 2026 (Tax Period: July 2026)</h3>
        <ul>
          <li><strong>11th August</strong> — GSTR-1 (monthly) for July 2026</li>
          <li><strong>13th August</strong> — IFF (QRMP) for July 2026</li>
          <li><strong>20th August</strong> — GSTR-3B (monthly, Category A) for July 2026</li>
          <li><strong>22nd August</strong> — GSTR-3B (monthly, Category B) for July 2026</li>
        </ul>

        <h3>September 2026 (Tax Period: August 2026)</h3>
        <ul>
          <li><strong>11th September</strong> — GSTR-1 (monthly) for August 2026</li>
          <li><strong>13th September</strong> — IFF (QRMP) for August 2026</li>
          <li><strong>20th September</strong> — GSTR-3B (monthly, Category A) for August 2026</li>
          <li><strong>22nd September</strong> — GSTR-3B (monthly, Category B) for August 2026</li>
        </ul>

        <h3>October 2026 (Tax Period: September 2026 / Q2)</h3>
        <ul>
          <li><strong>11th October</strong> — GSTR-1 (monthly) for September 2026</li>
          <li><strong>13th October</strong> — GSTR-1 (QRMP) for Jul-Sep 2026 quarter; IFF for September 2026</li>
          <li><strong>18th October</strong> — CMP-08 for Jul-Sep 2026 quarter</li>
          <li><strong>20th October</strong> — GSTR-3B (monthly, Category A) for September 2026</li>
          <li><strong>22nd October</strong> — GSTR-3B (monthly, Category B) for September 2026; GSTR-3B (QRMP, Category A) for Jul-Sep 2026</li>
          <li><strong>24th October</strong> — GSTR-3B (QRMP, Category B) for Jul-Sep 2026</li>
        </ul>

        <h3>November 2026 (Tax Period: October 2026)</h3>
        <ul>
          <li><strong>11th November</strong> — GSTR-1 (monthly) for October 2026</li>
          <li><strong>13th November</strong> — IFF (QRMP) for October 2026</li>
          <li><strong>20th November</strong> — GSTR-3B (monthly, Category A) for October 2026</li>
          <li><strong>22nd November</strong> — GSTR-3B (monthly, Category B) for October 2026</li>
        </ul>

        <h3>December 2026 (Tax Period: November 2026)</h3>
        <ul>
          <li><strong>11th December</strong> — GSTR-1 (monthly) for November 2026</li>
          <li><strong>13th December</strong> — IFF (QRMP) for November 2026</li>
          <li><strong>20th December</strong> — GSTR-3B (monthly, Category A) for November 2026</li>
          <li><strong>22nd December</strong> — GSTR-3B (monthly, Category B) for November 2026</li>
          <li><strong>31st December</strong> — GSTR-9 (annual return) for FY 2025-26; GSTR-9C for FY 2025-26</li>
        </ul>

        <h3>January 2027 (Tax Period: December 2026 / Q3)</h3>
        <ul>
          <li><strong>11th January</strong> — GSTR-1 (monthly) for December 2026</li>
          <li><strong>13th January</strong> — GSTR-1 (QRMP) for Oct-Dec 2026 quarter; IFF for December 2026</li>
          <li><strong>18th January</strong> — CMP-08 for Oct-Dec 2026 quarter</li>
          <li><strong>20th January</strong> — GSTR-3B (monthly, Category A) for December 2026</li>
          <li><strong>22nd January</strong> — GSTR-3B (monthly, Category B) for December 2026; GSTR-3B (QRMP, Category A) for Oct-Dec 2026</li>
          <li><strong>24th January</strong> — GSTR-3B (QRMP, Category B) for Oct-Dec 2026</li>
        </ul>

        <h3>February 2027 (Tax Period: January 2027)</h3>
        <ul>
          <li><strong>11th February</strong> — GSTR-1 (monthly) for January 2027</li>
          <li><strong>13th February</strong> — IFF (QRMP) for January 2027</li>
          <li><strong>20th February</strong> — GSTR-3B (monthly, Category A) for January 2027</li>
          <li><strong>22nd February</strong> — GSTR-3B (monthly, Category B) for January 2027</li>
        </ul>

        <h3>March 2027 (Tax Period: February 2027)</h3>
        <ul>
          <li><strong>11th March</strong> — GSTR-1 (monthly) for February 2027</li>
          <li><strong>13th March</strong> — IFF (QRMP) for February 2027</li>
          <li><strong>20th March</strong> — GSTR-3B (monthly, Category A) for February 2027</li>
          <li><strong>22nd March</strong> — GSTR-3B (monthly, Category B) for February 2027</li>
        </ul>
      </section>

      <section>
        <h2>Key Annual Deadlines for FY 2026-27</h2>
        <table>
          <thead>
            <tr>
              <th>Return / Action</th>
              <th>Due Date</th>
              <th>Applicable To</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>GSTR-4 (Composition Annual)</td><td>30th April 2027</td><td>Composition scheme dealers</td></tr>
            <tr><td>GSTR-9 (Annual Return)</td><td>31st December 2027</td><td>Regular taxpayers (turnover &gt;₹2 Cr)</td></tr>
            <tr><td>GSTR-9C (Reconciliation)</td><td>31st December 2027</td><td>Taxpayers with turnover &gt;₹5 Cr</td></tr>
            <tr><td>ITC Reversal (Rule 42/43)</td><td>With September GSTR-3B</td><td>All claiming ITC on common inputs</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Late Fee Structure for GST Returns</h2>
        <table>
          <thead>
            <tr>
              <th>Return</th>
              <th>Late Fee (per day)</th>
              <th>Maximum Cap</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>GSTR-1</td><td>₹50 (₹25 CGST + ₹25 SGST)</td><td>₹5,000</td></tr>
            <tr><td>GSTR-1 (nil)</td><td>₹20 (₹10 CGST + ₹10 SGST)</td><td>₹500</td></tr>
            <tr><td>GSTR-3B</td><td>₹50 (₹25 CGST + ₹25 SGST)</td><td>₹5,000</td></tr>
            <tr><td>GSTR-3B (nil)</td><td>₹20 (₹10 CGST + ₹10 SGST)</td><td>₹500</td></tr>
            <tr><td>GSTR-9</td><td>₹200 (₹100 CGST + ₹100 SGST)</td><td>0.50% of turnover</td></tr>
          </tbody>
        </table>
        <p>
          In addition to late fees, interest at 18% per annum applies on the outstanding tax amount
          from the due date until the date of payment. Use our{" "}
          <Link to="/interest-calculator">Interest Calculator</Link> to estimate your interest
          liability for delayed payments.
        </p>
      </section>

      <section>
        <h2>QRMP Scheme: Quarterly Filing Option</h2>
        <p>
          The Quarterly Return Monthly Payment (QRMP) scheme is available to taxpayers with
          aggregate turnover up to ₹5 crore in the previous financial year. Under QRMP:
        </p>
        <ul>
          <li>GSTR-1 and GSTR-3B are filed quarterly instead of monthly</li>
          <li>Tax must still be paid monthly using PMT-06 challan (by 25th of the following month)</li>
          <li>IFF (Invoice Furnishing Facility) allows uploading B2B invoices in months 1 and 2 of the quarter</li>
          <li>Opt-in or opt-out on the GST portal from the 1st to 25th of the month preceding the quarter</li>
        </ul>
        <p>
          Check the <Link to="/return-calendar">Return Calendar</Link> tool to see your specific
          filing schedule based on your scheme and state.
        </p>
      </section>

      <section>
        <h2>Tips for Timely GST Filing</h2>
        <ul>
          <li>Set calendar reminders at least 5 days before each due date</li>
          <li>Reconcile your books with GSTR-2B by the 14th of every month</li>
          <li>File GSTR-1 before GSTR-3B — your GSTR-1 data feeds your buyers&apos; ITC</li>
          <li>Keep digital copies of all invoices organized by tax period</li>
          <li>Use the <Link to="/calculator">GST Calculator</Link> to verify tax amounts before filing</li>
          <li>For QRMP taxpayers, don&apos;t forget monthly tax payments via PMT-06 even though returns are quarterly</li>
          <li>File nil returns on time — they attract late fees too</li>
        </ul>
      </section>

      <section>
        <h2>How DoAide GST Helps with Filing Deadlines</h2>
        <p>
          DoAide GST tracks all your filing deadlines automatically based on your registration type,
          turnover, and state. Get email and dashboard reminders before each due date, auto-reconcile
          your GSTR-2B, and prepare your returns in minutes instead of hours.
        </p>
        <p>
          <Link to="/">Try DoAide GST free →</Link>
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>What is the due date for GSTR-1 filing?</h3>
        <p>
          GSTR-1 is due by the 11th of the following month for monthly filers. Quarterly filers
          under QRMP scheme must file by the 13th of the month after the quarter ends. For example,
          GSTR-1 for the April-June 2026 quarter is due by 13th July 2026.
        </p>

        <h3>Are GSTR-3B due dates same for all states?</h3>
        <p>
          No. GSTR-3B has staggered due dates based on state classification. Category A states
          (including Maharashtra, Karnataka, Tamil Nadu, Gujarat) file by the 20th, while
          Category B states (including Delhi, UP, Bihar, Punjab) file by the 22nd or 24th.
        </p>

        <h3>When is GSTR-9 annual return due?</h3>
        <p>
          GSTR-9 is due by 31st December of the following financial year. So for FY 2026-27,
          the GSTR-9 must be filed by 31st December 2027. This applies to taxpayers with
          aggregate turnover exceeding ₹2 crore.
        </p>

        <h3>What happens if a due date falls on a holiday?</h3>
        <p>
          If a GST due date falls on a Sunday or gazetted holiday, the government may issue a
          notification extending the deadline. However, this is not automatic — always check
          the GST portal or CBIC notifications for official extensions.
        </p>

        <h3>Is there a penalty for late filing of nil returns?</h3>
        <p>
          Yes. Even nil returns attract late fees — ₹20 per day (₹10 CGST + ₹10 SGST) for
          GSTR-3B and GSTR-1, capped at ₹500. Filing on time avoids these charges regardless
          of whether you had any transactions in the period.
        </p>
      </section>
    </article>
  );
}
