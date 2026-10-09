import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import SeoHead from "../../components/SeoHead";

export default function ReverseChargeGstGuide() {
  usePageTitle("Reverse Charge Mechanism Under GST — Complete Guide 2026");

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
        headline: "Reverse Charge Mechanism Under GST — Complete Guide 2026",
        description: "Complete guide to Reverse Charge Mechanism (RCM) under GST — which services attract RCM, how to calculate, ITC eligibility, and GSTR-3B reporting.",
        url: "https://gst.doaide.com/blog/reverse-charge-mechanism-gst-guide-2026",
        datePublished: "2026-10-10",
        dateModified: "2026-10-10",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is Reverse Charge Mechanism under GST?", acceptedAnswer: { "@type": "Answer", text: "Under RCM, the recipient of goods or services pays the GST instead of the supplier. This applies to specific services notified under Section 9(3) and supplies from unregistered persons under Section 9(4) of the CGST Act." } },
          { "@type": "Question", name: "Can I claim ITC on GST paid under reverse charge?", acceptedAnswer: { "@type": "Answer", text: "Yes, in most cases. RCM-paid GST can be claimed as ITC in the same return period. Residential property rent is excluded — no ITC on that. A valid tax invoice or self-invoice is required." } },
          { "@type": "Question", name: "Do composition dealers need to pay GST under reverse charge?", acceptedAnswer: { "@type": "Answer", text: "Yes. Composition dealers must pay GST under RCM on applicable supplies. However, they cannot claim ITC on RCM payments since composition dealers are not eligible for input tax credit." } },
          { "@type": "Question", name: "What is a self-invoice under RCM?", acceptedAnswer: { "@type": "Answer", text: "When you receive supplies from an unregistered person under Section 9(4), you must issue a self-invoice (also called a payment voucher) in your own name. This invoice is required to claim ITC on the RCM payment." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <SeoHead title="Reverse Charge Mechanism Under GST — Complete Guide 2026" description="Complete guide to Reverse Charge Mechanism (RCM) under GST — which services attract RCM, how to calculate, ITC rules, self-invoice, and GSTR-3B reporting." path="/blog/reverse-charge-mechanism-gst-guide-2026" />
      <h1>Reverse Charge Mechanism Under GST — Complete Guide 2026</h1>
      <p className="blog-meta">Published October 2026 · 9 min read</p>

      <section>
        <h2>What Is the Reverse Charge Mechanism?</h2>
        <p>
          Under normal GST, the supplier collects tax from the buyer and deposits it with
          the government. Under the Reverse Charge Mechanism (RCM), this responsibility
          shifts — the recipient pays the GST directly. This was introduced to bring
          unorganized sectors into the tax net and ensure compliance from suppliers who
          might otherwise evade registration.
        </p>
        <p>
          RCM is governed by two sections of the CGST Act, 2017:
        </p>
        <ul>
          <li>
            <strong>Section 9(3):</strong> The government notifies specific categories of
            goods and services where RCM always applies — regardless of whether the
            supplier is registered.
          </li>
          <li>
            <strong>Section 9(4):</strong> Purchases from unregistered persons in specified
            categories — the registered recipient pays GST.
          </li>
        </ul>
      </section>

      <section>
        <h2>Services That Attract Reverse Charge</h2>
        <p>The following services are notified under RCM (Notification 13/2017-CT Rate):</p>

        <div className="blog-table-wrapper">
          <table className="blog-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>GST Rate</th>
                <th>ITC</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Legal services by advocates</td><td>18%</td><td>Yes</td></tr>
              <tr><td>GTA — Goods Transport Agency (RCM option)</td><td>5%</td><td>Yes</td></tr>
              <tr><td>Sponsorship services</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Director fees / Sitting fees</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Insurance agent commission</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Recovery agent services</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Author / Music composer royalties</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Import of services</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Security services (from individual/HUF/firm)</td><td>18%</td><td>Yes</td></tr>
              <tr><td>Renting residential property (by registered person)</td><td>18%</td><td>No</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>How to Calculate GST Under RCM</h2>
        <p>
          The calculation depends on whether the supply is intra-state or inter-state:
        </p>
        <ul>
          <li><strong>Intra-state:</strong> Tax splits equally into CGST and SGST. For example, 18% = 9% CGST + 9% SGST.</li>
          <li><strong>Inter-state:</strong> Full amount charged as IGST. For example, 18% IGST.</li>
        </ul>

        <h3>Worked Example</h3>
        <p>
          A company in Mumbai hires an advocate in Delhi for Rs 1,00,000 (inter-state supply):
        </p>
        <ul>
          <li>Taxable value: Rs 1,00,000</li>
          <li>GST @ 18% under RCM: Rs 18,000 (full IGST since inter-state)</li>
          <li>Total payment to advocate: Rs 1,00,000 (no GST charged by supplier)</li>
          <li>RCM liability to deposit: Rs 18,000 IGST (in cash — cannot use ITC balance)</li>
          <li>ITC claimable: Rs 18,000 (in the same return period)</li>
          <li>Net cash impact: Rs 0 (liability and credit cancel out)</li>
        </ul>
        <p>
          Use our <Link to="/rcm-calculator">RCM calculator</Link> to compute RCM liability
          for multiple services at once.
        </p>
      </section>

      <section>
        <h2>ITC on RCM — What You Can and Cannot Claim</h2>
        <p>
          GST paid under reverse charge is eligible for ITC in most cases, subject to
          the general ITC conditions under Section 16:
        </p>
        <ul>
          <li>You must be a registered taxable person (not composition)</li>
          <li>The goods or services must be used for business purposes</li>
          <li>You must hold a valid tax invoice or self-invoice</li>
          <li>The supplier must have filed their return (for Section 9(3) supplies)</li>
        </ul>

        <h3>When ITC Is Blocked</h3>
        <ul>
          <li><strong>Residential rent:</strong> GST paid under RCM on renting a residential dwelling for personal use is blocked under Section 17(5)</li>
          <li><strong>Composition dealers:</strong> Cannot claim any ITC, including on RCM payments</li>
          <li><strong>Exempt supplies:</strong> If the input is used for exempt supplies, ITC must be reversed proportionally</li>
        </ul>
      </section>

      <section>
        <h2>Self-Invoice and Payment Voucher</h2>
        <p>
          When you receive supplies from an unregistered person under Section 9(4), you
          must issue a self-invoice in your own name. This document:
        </p>
        <ul>
          <li>Must contain all the details of a regular tax invoice</li>
          <li>Uses your own GSTIN as the supplier GSTIN</li>
          <li>Is required for claiming ITC on the RCM payment</li>
          <li>Must be issued at the time of payment or within 30 days</li>
        </ul>
      </section>

      <section>
        <h2>How to Report RCM in GST Returns</h2>
        <h3>GSTR-3B Reporting</h3>
        <ul>
          <li><strong>Table 3.1(d):</strong> Report the total RCM output tax liability</li>
          <li><strong>Table 4(A)(2):</strong> Claim ITC on import of services (IGST)</li>
          <li><strong>Table 4(A)(3):</strong> Claim ITC on domestic RCM (inward supplies)</li>
        </ul>

        <h3>GSTR-1 Reporting</h3>
        <p>
          No reporting needed in GSTR-1 for RCM transactions — you are the recipient,
          not the supplier. The outward supply return does not cover inward supplies.
        </p>

        <h3>GSTR-9 (Annual Return)</h3>
        <p>
          RCM transactions must be disclosed separately in the annual return in
          Table 4 (details of advances, inward supplies from unregistered persons,
          and inward supplies on which tax is payable under RCM).
        </p>
      </section>

      <section>
        <h2>Common Mistakes to Avoid</h2>
        <ol>
          <li>
            <strong>Using ITC balance to pay RCM:</strong> RCM liability must be paid in
            cash through the electronic cash ledger. You cannot set it off against your
            existing ITC balance.
          </li>
          <li>
            <strong>Forgetting director fees:</strong> Many companies overlook that
            director sitting fees and commissions attract 18% RCM. The amount paid to the
            director is exclusive of GST — the company pays GST separately.
          </li>
          <li>
            <strong>Not issuing self-invoices:</strong> Without a self-invoice for
            Section 9(4) supplies, you cannot claim ITC on the RCM payment.
          </li>
          <li>
            <strong>Confusing GTA forward and reverse charge:</strong> If a GTA opts for
            forward charge (12% with ITC or 5% without), RCM does not apply. Check the
            GTA&apos;s declaration before calculating.
          </li>
          <li>
            <strong>Claiming ITC on residential rent:</strong> Even though GST is payable
            under RCM on residential property rent by a registered person, ITC is blocked.
            This is a common audit finding.
          </li>
        </ol>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>What is Reverse Charge Mechanism under GST?</h3>
        <p>
          Under RCM, the recipient pays GST instead of the supplier. It applies to
          specific services notified by the government (Section 9(3)) and to purchases
          from unregistered persons in specified categories (Section 9(4)).
        </p>

        <h3>Can I claim ITC on GST paid under reverse charge?</h3>
        <p>
          Yes, in most cases. The ITC can be claimed in the same return period. The main
          exception is residential property rent — no ITC is available. You must hold a
          valid tax invoice or self-invoice.
        </p>

        <h3>Do composition dealers need to pay GST under reverse charge?</h3>
        <p>
          Yes, composition dealers must pay RCM on applicable supplies. However, they
          cannot claim ITC on these payments since the composition scheme does not allow
          input tax credit.
        </p>

        <h3>What is a self-invoice under RCM?</h3>
        <p>
          A self-invoice is a document you issue in your own name when receiving supplies
          from an unregistered person under Section 9(4). It serves as the tax invoice
          and is required for ITC claims.
        </p>
      </section>

      <section>
        <h2>Calculate Your RCM Liability</h2>
        <p>
          Use the <Link to="/rcm-calculator">DoAide RCM Calculator</Link> to compute your
          reverse charge liability across multiple services, check ITC eligibility, and get
          GSTR-3B reporting guidance.
          <Link to="/" style={{ marginLeft: "0.25rem" }}>Explore all DoAide GST tools →</Link>
        </p>
      </section>
    </article>
  );
}
