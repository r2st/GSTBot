import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function CompositionVsRegular() {
  usePageTitle("GST Composition Scheme vs Regular Scheme");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Compare GST Composition Scheme vs Regular Scheme. Eligibility, tax rates, ITC rules, return filing, and which scheme is better for your business in 2026.";

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
        headline: "GST Composition Scheme vs Regular Scheme",
        description: "Comprehensive comparison of Composition and Regular GST schemes — rates, ITC, compliance, and suitability.",
        url: "https://gst.doaide.com/blog/composition-scheme-vs-regular-scheme",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the GST Composition Scheme?", acceptedAnswer: { "@type": "Answer", text: "A simplified scheme for small businesses with turnover up to ₹1.5 crore. Lower tax rates but no ITC and no interstate supply." } },
          { "@type": "Question", name: "Can composition dealers claim Input Tax Credit?", acceptedAnswer: { "@type": "Answer", text: "No. Composition dealers cannot claim ITC on purchases. They also cannot issue tax invoices or collect tax from buyers." } },
          { "@type": "Question", name: "What is the turnover limit for composition scheme?", acceptedAnswer: { "@type": "Answer", text: "₹1.5 crore for manufacturers and traders. ₹75 lakh in special category states. ₹50 lakh for service providers." } },
          { "@type": "Question", name: "Can a composition dealer sell on e-commerce?", acceptedAnswer: { "@type": "Answer", text: "No. Composition dealers cannot supply goods through e-commerce operators. They also cannot make interstate supplies." } },
          { "@type": "Question", name: "How often do composition dealers file returns?", acceptedAnswer: { "@type": "Answer", text: "Quarterly CMP-08 (payment + statement) and one annual GSTR-4. Regular dealers file monthly GSTR-1 and GSTR-3B." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>GST Composition Scheme vs Regular Scheme</h1>
      <p className="blog-meta">Updated October 2026 · 9 min read</p>

      <section>
        <h2>Overview</h2>
        <p>
          The GST framework offers two schemes for taxpayers: the <strong>Composition Scheme</strong>,
          designed for small businesses seeking simpler compliance, and the <strong>Regular Scheme</strong>,
          which provides full ITC benefits and flexibility. Choosing the right scheme directly impacts
          your tax burden, compliance workload, and ability to expand.
        </p>
      </section>

      <section>
        <h2>Quick Comparison Table</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--line, #e2e8f0)" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>Parameter</th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>Composition Scheme</th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem" }}>Regular Scheme</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Turnover Limit", "₹1.5 crore (₹75L special states)", "No upper limit"],
                ["Tax Rates", "1%–6% (flat, on turnover)", "5%–40% (on transaction value)"],
                ["Input Tax Credit", "Not available", "Fully available"],
                ["Invoice Type", "Bill of Supply (no tax breakup)", "Tax Invoice (with CGST/SGST/IGST)"],
                ["Interstate Supply", "Not allowed", "Allowed"],
                ["E-commerce Supply", "Not allowed", "Allowed"],
                ["Return Filing", "Quarterly CMP-08 + Annual GSTR-4", "Monthly GSTR-1 + GSTR-3B"],
                ["Tax Collection", "Cannot collect tax from buyer", "Must collect and remit tax"],
                ["Compliance Burden", "Low", "Higher"],
              ].map(([param, comp, reg]) => (
                <tr key={param} style={{ borderBottom: "1px solid var(--line, #e2e8f0)" }}>
                  <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>{param}</td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>{comp}</td>
                  <td style={{ padding: "0.6rem 0.5rem" }}>{reg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Composition Scheme — Tax Rates</h2>
        <ul>
          <li><strong>Manufacturers:</strong> 1% (0.5% CGST + 0.5% SGST)</li>
          <li><strong>Traders:</strong> 1% (0.5% CGST + 0.5% SGST)</li>
          <li><strong>Restaurants (not serving alcohol):</strong> 5% (2.5% CGST + 2.5% SGST)</li>
          <li><strong>Service providers (Section 10(2A)):</strong> 6% (3% CGST + 3% SGST) — turnover limit ₹50 lakh</li>
        </ul>
        <p>
          These rates apply on total turnover, not individual transactions. The tax is paid by the
          dealer from their margin — they cannot add it to the customer&apos;s bill.
        </p>
      </section>

      <section>
        <h2>Who Cannot Opt for Composition Scheme?</h2>
        <ul>
          <li>Businesses making interstate outward supplies</li>
          <li>Suppliers of goods through e-commerce operators</li>
          <li>Manufacturers of ice cream, pan masala, tobacco, and aerated drinks</li>
          <li>Casual or non-resident taxable persons</li>
          <li>Businesses supplying goods through e-commerce platforms</li>
        </ul>
        <p>
          Check your eligibility instantly with our{" "}
          <Link to="/composition-scheme">Composition Scheme Eligibility Checker</Link>.
        </p>
      </section>

      <section>
        <h2>When to Choose Composition Scheme</h2>
        <p>The composition scheme works best when:</p>
        <ul>
          <li>Your turnover is below ₹1.5 crore and likely to stay there</li>
          <li>You sell only within your state (no interstate sales)</li>
          <li>Your customers are end consumers (not businesses that need tax invoices for ITC)</li>
          <li>Your input purchases don&apos;t have significant GST that you&apos;d want to claim back</li>
          <li>You want minimal compliance — just quarterly payments and one annual return</li>
        </ul>
      </section>

      <section>
        <h2>When to Choose Regular Scheme</h2>
        <p>The regular scheme is better when:</p>
        <ul>
          <li>You make interstate sales or plan to expand beyond your state</li>
          <li>Your customers are registered businesses who need tax invoices for ITC</li>
          <li>Your purchase GST (input tax) is high — claiming ITC reduces effective tax</li>
          <li>You sell on e-commerce platforms (Amazon, Flipkart, etc.)</li>
          <li>You deal in excluded categories (ice cream, tobacco, pan masala, aerated drinks)</li>
        </ul>
      </section>

      <section>
        <h2>Switching Between Schemes</h2>
        <p>
          You can switch from composition to regular at any time during the year by filing
          <strong> Form GST CMP-04</strong>. Switching from regular to composition is allowed only at the
          start of a financial year — file <strong>Form GST CMP-02</strong> before March 31.
          When switching to regular, you can claim ITC on stock held on the date of switch.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>
        <dl className="blog-faq">
          <dt>What is the GST Composition Scheme?</dt>
          <dd>A simplified scheme for small businesses (≤₹1.5 crore). Lower rates but no ITC or interstate supply.</dd>
          <dt>Can composition dealers claim ITC?</dt>
          <dd>No. They cannot claim ITC, issue tax invoices, or collect tax from buyers.</dd>
          <dt>What is the turnover limit?</dt>
          <dd>₹1.5 crore for goods. ₹75 lakh in special states. ₹50 lakh for service providers.</dd>
          <dt>Can a composition dealer sell on e-commerce?</dt>
          <dd>No. Composition dealers cannot supply through e-commerce or make interstate supplies.</dd>
          <dt>How often do composition dealers file returns?</dt>
          <dd>Quarterly CMP-08 and annual GSTR-4. Regular dealers file monthly GSTR-1 + GSTR-3B.</dd>
        </dl>
      </section>

      <section className="blog-cta">
        <p>
          <Link to="/">Try DoAide GST free</Link> — check your eligibility, calculate your
          tax under both schemes, and make an informed decision. No credit card required.
        </p>
      </section>
    </article>
  );
}
