import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import SeoHead from "../../components/SeoHead";

export default function HsnCodeLookup() {
  usePageTitle("HSN Code Lookup: Everything You Need to Know");

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
        headline: "HSN Code Lookup: Everything You Need to Know",
        description: "Understand HSN codes, how to find the right code for your goods, and why accurate HSN classification matters for GST compliance.",
        url: "https://gst.doaide.com/blog/hsn-code-lookup",
        datePublished: "2026-10-01",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is an HSN code?", acceptedAnswer: { "@type": "Answer", text: "HSN (Harmonised System of Nomenclature) is a globally standardised system to classify goods. Under India's GST, HSN codes determine the applicable tax rate." } },
          { "@type": "Question", name: "How many digits are required for HSN codes?", acceptedAnswer: { "@type": "Answer", text: "Turnover up to ₹5 crore: 4-digit HSN on B2B invoices. Above ₹5 crore: 6-digit HSN on all invoices. Since April 2021, HSN is mandatory on all GST invoices." } },
          { "@type": "Question", name: "What is the difference between HSN and SAC codes?", acceptedAnswer: { "@type": "Answer", text: "HSN codes classify goods; SAC (Services Accounting Code) classifies services. Both follow a hierarchical structure and are reported in GSTR-1." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <SeoHead title="HSN Code Lookup: Find GST Rates by Product Code" description="How to find the right HSN code for any product. Search HSN codes, understand the classification system, and get correct GST rates for your goods." path="/blog/hsn-code-lookup" />
      <h1>HSN Code Lookup: Everything You Need to Know</h1>
      <p className="blog-meta">Updated October 2026 · 8 min read</p>

      <section>
        <h2>What Are HSN Codes?</h2>
        <p>
          HSN stands for Harmonised System of Nomenclature — a globally standardised system of
          names and numbers to classify traded goods. Developed by the World Customs Organization
          (WCO), HSN codes are used by over 200 countries. Under India&apos;s GST regime, HSN codes
          determine the applicable tax rate for goods, making accurate classification essential
          for compliance.
        </p>
      </section>

      <section>
        <h2>HSN Code Structure</h2>
        <p>HSN codes follow a hierarchical structure:</p>
        <ul>
          <li><strong>2-digit</strong> — Chapter (broad category, e.g., 09 = Coffee, Tea, Spices)</li>
          <li><strong>4-digit</strong> — Heading (more specific, e.g., 0902 = Tea)</li>
          <li><strong>6-digit</strong> — Subheading (internationally standardised, e.g., 090210 = Green tea)</li>
          <li><strong>8-digit</strong> — India-specific tariff item (e.g., 09021010 = Green tea, leaf)</li>
        </ul>
      </section>

      <section>
        <h2>Who Needs to Report HSN Codes?</h2>
        <p>HSN code reporting requirements depend on your annual turnover:</p>
        <ul>
          <li><strong>Up to ₹5 crore</strong> — 4-digit HSN code mandatory on B2B invoices</li>
          <li><strong>Above ₹5 crore</strong> — 6-digit HSN code mandatory on all invoices</li>
        </ul>
        <p>
          Since April 2021, HSN codes are mandatory on all GST invoices. GSTR-1 requires
          HSN-wise summary of outward supplies in Table 12, and errors here can trigger notices
          from the tax department.
        </p>
      </section>

      <section>
        <h2>How to Find the Right HSN Code</h2>
        <ol>
          <li>
            <strong>Identify your product precisely</strong> — Know the exact material, composition,
            and use of the goods.
          </li>
          <li>
            <strong>Search the GST HSN directory</strong> — Use the official GST portal&apos;s HSN search
            or the CBIC tariff lookup at cbic-gst.gov.in.
          </li>
          <li>
            <strong>Match at the most specific level</strong> — Start with the chapter, narrow to
            heading, then subheading. Use 4 or 6 digits as required by your turnover slab.
          </li>
          <li>
            <strong>Verify the tax rate</strong> — Each HSN code maps to a GST rate (0%, 5%,
            18%, or 40% under GST 2.0). Confirm the rate matches your product.
          </li>
          <li>
            <strong>Check for notifications</strong> — The government periodically reclassifies
            goods. Verify against the latest notification for rate changes.
          </li>
        </ol>
      </section>

      <section>
        <h2>Common HSN Code Categories for Indian Businesses</h2>
        <table className="blog-table">
          <thead>
            <tr>
              <th>Chapter</th>
              <th>Description</th>
              <th>Common GST Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>01–05</td><td>Live animals, animal products</td><td>0–5%</td></tr>
            <tr><td>06–14</td><td>Vegetable products</td><td>0–5%</td></tr>
            <tr><td>15–24</td><td>Food products, beverages, tobacco</td><td>5–40%</td></tr>
            <tr><td>25–27</td><td>Mineral products</td><td>5–18%</td></tr>
            <tr><td>28–38</td><td>Chemical products</td><td>5–18%</td></tr>
            <tr><td>39–40</td><td>Plastics and rubber</td><td>18%</td></tr>
            <tr><td>50–63</td><td>Textiles and garments</td><td>5–18%</td></tr>
            <tr><td>72–83</td><td>Iron, steel, and metal articles</td><td>18%</td></tr>
            <tr><td>84–85</td><td>Machinery and electronics</td><td>18%</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>HSN Code Mistakes That Cost Businesses</h2>
        <ul>
          <li>
            <strong>Wrong rate applied</strong> — An incorrect HSN code means wrong tax collection.
            Under-collection creates a liability; over-collection leads to refund complications.
          </li>
          <li>
            <strong>ITC mismatches</strong> — If your supplier uses a different HSN code for the same
            goods, the GSTR-2B reconciliation may flag discrepancies.
          </li>
          <li>
            <strong>Notices and audits</strong> — Systematic HSN errors attract scrutiny from the
            GST department, especially during annual audits.
          </li>
          <li>
            <strong>E-way bill issues</strong> — HSN codes on e-way bills must match the invoice.
            Mismatches can result in goods detention during transit.
          </li>
        </ul>
      </section>

      <section>
        <h2>SAC Codes for Services</h2>
        <p>
          Services use SAC (Services Accounting Code) instead of HSN. SAC codes also follow a
          hierarchical structure and are reported the same way in GST returns. Common SAC codes
          include 9971 (financial services), 9983 (IT services), and 9973 (leasing/rental).
        </p>
      </section>

      <section>
        <h2>Automate HSN Classification with DoAide GST</h2>
        <p>
          DoAide GST&apos;s AI-powered invoice parser automatically extracts and validates HSN codes from
          your invoices. When codes are missing or potentially incorrect, the system flags them for
          review — so you catch errors before they become compliance issues.
        </p>
        <p>
          <Link to="/">Start using DoAide GST free →</Link>
        </p>
      </section>
    </article>
  );
}
