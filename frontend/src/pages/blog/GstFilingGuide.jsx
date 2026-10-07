import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function GstFilingGuide() {
  usePageTitle("Complete Guide to GST Filing in India 2026");

  useEffect(() => {
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
        headline: "Complete Guide to GST Filing in India 2026",
        description: "Step-by-step guide to filing GST returns — GSTR-1, GSTR-3B, and GSTR-2B reconciliation explained for Indian businesses.",
        url: "https://gst.doaide.com/blog/gst-filing-guide-india-2026",
        datePublished: "2026-10-01",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What happens if I miss the GST filing deadline?", acceptedAnswer: { "@type": "Answer", text: "Late filing of GSTR-3B attracts ₹50/day (₹20 for nil), capped at ₹5,000. Interest at 18% p.a. applies on unpaid tax. Subsequent returns are blocked until pending ones are filed." } },
          { "@type": "Question", name: "Can I revise a filed GST return?", acceptedAnswer: { "@type": "Answer", text: "GSTR-3B cannot be revised once filed. Errors must be corrected in next period's return. GSTR-1 allows amendments in subsequent month's filing." } },
          { "@type": "Question", name: "Is GSTR-2B mandatory for ITC claims?", acceptedAnswer: { "@type": "Answer", text: "GSTR-2B is auto-generated and is the authoritative document for ITC eligibility under Rule 36(4). Claims exceeding GSTR-2B amounts face scrutiny." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>Complete Guide to GST Filing in India 2026</h1>
      <p className="blog-meta">Updated October 2026 · 10 min read</p>

      <section>
        <h2>What Is GST Filing?</h2>
        <p>
          GST filing is the process of submitting your tax returns to the Goods and Services Tax
          Network (GSTN). Every registered business in India must file GST returns periodically —
          monthly or quarterly depending on turnover and scheme. The key returns are GSTR-1
          (outward supplies), GSTR-3B (summary return with tax payment), and GSTR-2B (auto-generated
          input tax credit statement).
        </p>
      </section>

      <section>
        <h2>Who Needs to File GST Returns?</h2>
        <p>
          Any business or individual with a GST registration must file returns, regardless of whether
          there was business activity during the period. This includes:
        </p>
        <ul>
          <li>Regular taxpayers with turnover above ₹40 lakhs (₹20 lakhs for services)</li>
          <li>Composition scheme dealers (quarterly GSTR-4)</li>
          <li>E-commerce operators and TDS/TCS deductors</li>
          <li>Non-resident taxable persons</li>
          <li>Input Service Distributors (ISDs)</li>
        </ul>
      </section>

      <section>
        <h2>Key GST Returns and Their Due Dates</h2>

        <h3>GSTR-1 — Outward Supplies</h3>
        <p>
          Filed monthly (by the 11th) or quarterly under QRMP scheme. Lists all sales invoices,
          credit/debit notes, and export invoices issued during the period. Accurate GSTR-1 filing
          is critical because your buyers&apos; GSTR-2B is generated from your GSTR-1 data.
        </p>

        <h3>GSTR-3B — Summary Return</h3>
        <p>
          Filed monthly by the 20th (or staggered dates for certain states). This is where you
          declare your output tax liability, claim Input Tax Credit (ITC), and pay the net tax.
          GSTR-3B cannot be revised once filed, so accuracy matters.
        </p>

        <h3>GSTR-2B — Auto-Generated ITC Statement</h3>
        <p>
          Generated on the 14th of every month based on your suppliers&apos; GSTR-1 and GSTR-5 filings.
          GSTR-2B is your definitive reference for ITC claims — reconcile your purchase register
          against it before filing GSTR-3B.
        </p>
      </section>

      <section>
        <h2>Step-by-Step: How to File GST Returns</h2>
        <ol>
          <li>
            <strong>Gather your invoices</strong> — Collect all sales and purchase invoices for the
            period. Ensure supplier GSTINs are correct.
          </li>
          <li>
            <strong>Prepare GSTR-1</strong> — Enter or upload your outward supply details. Classify
            invoices by B2B, B2C, exports, and amendments.
          </li>
          <li>
            <strong>Download GSTR-2B</strong> — After the 14th, download your auto-generated ITC
            statement from the GST portal.
          </li>
          <li>
            <strong>Reconcile purchases with GSTR-2B</strong> — Match your purchase register
            against GSTR-2B. Flag mismatches: missing invoices, amount differences, and GSTIN errors.
          </li>
          <li>
            <strong>Calculate ITC</strong> — Determine eligible ITC based on matched invoices.
            Exclude blocked credits under Section 17(5) and reverse charges.
          </li>
          <li>
            <strong>File GSTR-3B</strong> — Enter your output liability, claim verified ITC, and
            pay the net tax through the GST portal.
          </li>
          <li>
            <strong>Verify and submit</strong> — Double-check all figures. Once submitted with DSC
            or EVC, GSTR-3B cannot be changed.
          </li>
        </ol>
      </section>

      <section>
        <h2>Common GST Filing Mistakes to Avoid</h2>
        <ul>
          <li>Claiming ITC on invoices not reflected in GSTR-2B</li>
          <li>Incorrect HSN codes leading to wrong tax rates</li>
          <li>Missing the filing deadline and incurring late fees (₹50/day for GSTR-3B)</li>
          <li>Not reconciling GSTR-2B before filing GSTR-3B</li>
          <li>Forgetting to report credit/debit notes</li>
          <li>Misclassifying inter-state and intra-state supplies</li>
        </ul>
      </section>

      <section>
        <h2>How DoAide GST Simplifies Filing</h2>
        <p>
          DoAide GST automates the most time-consuming parts of GST compliance. Upload your
          invoices, and the software automatically reconciles them with your GSTR-2B, calculates
          eligible ITC, and prepares your GSTR-1 and GSTR-3B returns — all in minutes instead of
          hours. The free plan supports up to 50 invoices per month.
        </p>
        <p>
          <Link to="/">Try DoAide GST free →</Link>
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>What happens if I miss the GST filing deadline?</h3>
        <p>
          Late filing of GSTR-3B attracts a late fee of ₹50/day (₹20/day for nil returns), capped
          at ₹5,000. You also lose the ability to file subsequent returns until the pending one is
          completed. Interest at 18% per annum applies on unpaid tax.
        </p>

        <h3>Can I revise a filed GST return?</h3>
        <p>
          GSTR-3B cannot be revised once filed. Errors must be corrected in the next period&apos;s return
          through amendments. GSTR-1 allows amendments in the subsequent month&apos;s filing.
        </p>

        <h3>Is GSTR-2B mandatory for ITC claims?</h3>
        <p>
          While GSTR-2B is auto-generated and not filed, it is the authoritative document for ITC
          eligibility under Rule 36(4). ITC claims exceeding the GSTR-2B amount are subject to
          scrutiny and potential reversal.
        </p>
      </section>
    </article>
  );
}
