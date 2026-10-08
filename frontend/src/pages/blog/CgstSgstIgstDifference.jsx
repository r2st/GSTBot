import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function CgstSgstIgstDifference() {
  usePageTitle("Difference Between CGST, SGST and IGST — Explained with Examples");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Understand the difference between CGST, SGST and IGST in India's GST system. Learn when each tax applies, how rates are split, and see worked examples for interstate and intrastate supplies.";

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
        headline: "Difference Between CGST, SGST and IGST — Explained with Examples",
        description: "Complete guide to understanding CGST, SGST and IGST under India's GST system with examples, rates, and when each applies.",
        url: "https://gst.doaide.com/blog/difference-between-cgst-sgst-igst",
        datePublished: "2026-10-08",
        dateModified: "2026-10-08",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What is the difference between CGST, SGST, and IGST?", acceptedAnswer: { "@type": "Answer", text: "CGST (Central GST) and SGST (State GST) are charged together on intrastate supplies (within the same state). IGST (Integrated GST) is charged on interstate supplies (between different states). The total tax rate remains the same — for example, 18% GST means 9% CGST + 9% SGST intrastate, or 18% IGST interstate." } },
          { "@type": "Question", name: "When is IGST charged instead of CGST and SGST?", acceptedAnswer: { "@type": "Answer", text: "IGST is charged when the supplier and buyer are in different states or Union Territories (interstate supply). It is also charged on imports and supplies to SEZs." } },
          { "@type": "Question", name: "Can I claim ITC of IGST against CGST or SGST?", acceptedAnswer: { "@type": "Answer", text: "Yes. IGST credit can be used against IGST, CGST, or SGST liability. CGST credit can be used against CGST and IGST. SGST credit can be used against SGST and IGST. But CGST credit cannot be used against SGST and vice versa." } },
          { "@type": "Question", name: "Who collects CGST, SGST, and IGST?", acceptedAnswer: { "@type": "Answer", text: "CGST is collected by the Central Government. SGST is collected by the State Government. IGST is collected by the Central Government and later settled between Centre and the destination state." } },
          { "@type": "Question", name: "Is the total GST rate different for interstate vs intrastate supply?", acceptedAnswer: { "@type": "Answer", text: "No. The total GST rate remains the same. For example, if an item has 18% GST, the buyer pays 18% whether it is intrastate (9% CGST + 9% SGST) or interstate (18% IGST)." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  const thStyle = { textAlign: "left", padding: "0.75rem 0.5rem", borderBottom: "2px solid var(--line, #e2e8f0)" };
  const tdStyle = { padding: "0.75rem 0.5rem", borderBottom: "1px solid var(--line, #e2e8f0)" };

  return (
    <article className="blog-article">
      <h1>Difference Between CGST, SGST and IGST — Explained with Examples</h1>
      <p className="blog-meta">Updated October 2026 · 8 min read</p>

      <section>
        <h2>What Are CGST, SGST, and IGST?</h2>
        <p>
          India&rsquo;s GST replaced over a dozen central and state taxes with one unified system.
          But the revenue still needs to be shared between the Centre and states. That is why GST
          has three components:
        </p>
        <ul>
          <li><strong>CGST (Central Goods and Services Tax)</strong> — collected by the Central Government on intrastate supplies.</li>
          <li><strong>SGST (State Goods and Services Tax)</strong> — collected by the State Government on intrastate supplies. In Union Territories, this is called UTGST.</li>
          <li><strong>IGST (Integrated Goods and Services Tax)</strong> — collected by the Central Government on interstate supplies, imports, and supplies to SEZs.</li>
        </ul>
        <p>
          The total tax rate stays the same regardless of which component applies. If a product carries
          18% GST, the buyer pays 18% whether the supply is within the same state (9% CGST + 9% SGST)
          or across states (18% IGST).
        </p>
      </section>

      <section>
        <h2>When Does Each Tax Apply?</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Scenario</th>
                <th style={thStyle}>Tax Charged</th>
                <th style={thStyle}>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>Supplier and buyer in the <strong>same state</strong></td>
                <td style={tdStyle}>CGST + SGST</td>
                <td style={tdStyle}>Delhi seller → Delhi buyer</td>
              </tr>
              <tr>
                <td style={tdStyle}>Supplier and buyer in <strong>different states</strong></td>
                <td style={tdStyle}>IGST</td>
                <td style={tdStyle}>Delhi seller → Mumbai buyer</td>
              </tr>
              <tr>
                <td style={tdStyle}><strong>Import</strong> of goods or services</td>
                <td style={tdStyle}>IGST + Customs Duty</td>
                <td style={tdStyle}>US company → Indian buyer</td>
              </tr>
              <tr>
                <td style={tdStyle}>Supply to a <strong>SEZ</strong></td>
                <td style={tdStyle}>IGST (zero-rated)</td>
                <td style={tdStyle}>Mumbai seller → Noida SEZ</td>
              </tr>
              <tr>
                <td style={tdStyle}>Same state, <strong>Union Territory</strong></td>
                <td style={tdStyle}>CGST + UTGST</td>
                <td style={tdStyle}>Chandigarh seller → Chandigarh buyer</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "1rem" }}>
          The state is determined by the <strong>Place of Supply</strong> rules under IGST Act, not
          the physical location of goods. For services, the default place of supply is the recipient&rsquo;s
          location.
        </p>
      </section>

      <section>
        <h2>How GST Rate Splits Work — Worked Examples</h2>

        <h3>Example 1: Intrastate Supply (Same State)</h3>
        <p>
          A laptop seller in Mumbai (Maharashtra) sells to a buyer in Pune (Maharashtra). The laptop
          carries 18% GST.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Component</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Tax on ₹1,00,000</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>CGST</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>9%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>₹9,000</td>
              </tr>
              <tr>
                <td style={tdStyle}>SGST</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>9%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>₹9,000</td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td style={tdStyle}>Total GST</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>18%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>₹18,000</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Example 2: Interstate Supply (Different States)</h3>
        <p>
          The same laptop seller in Mumbai sells to a buyer in Bangalore (Karnataka). Same 18% GST rate.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Component</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Tax on ₹1,00,000</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>IGST</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>18%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>₹18,000</td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td style={tdStyle}>Total GST</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>18%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>₹18,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "1rem" }}>
          The buyer pays the same total amount. The difference is only in how the government
          distributes the revenue.
        </p>
        <p>
          <Link to="/calculator">Use our GST Calculator</Link> to see the CGST/SGST/IGST
          split for any amount instantly.
        </p>
      </section>

      <section>
        <h2>CGST vs SGST vs IGST — Key Differences</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Parameter</th>
                <th style={thStyle}>CGST</th>
                <th style={thStyle}>SGST / UTGST</th>
                <th style={thStyle}>IGST</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Full Form", "Central GST", "State GST", "Integrated GST"],
                ["Governing Act", "CGST Act, 2017", "Respective State GST Act", "IGST Act, 2017"],
                ["Collected By", "Central Govt", "State Govt", "Central Govt"],
                ["Applies To", "Intrastate supply", "Intrastate supply", "Interstate supply, imports, SEZ"],
                ["Rate", "Half of total GST rate", "Half of total GST rate", "Full GST rate"],
                ["Revenue Goes To", "Centre", "State", "Settled between Centre and destination state"],
                ["Return Filed In", "GSTR-1 and GSTR-3B", "GSTR-1 and GSTR-3B", "GSTR-1 and GSTR-3B"],
              ].map(([param, cgst, sgst, igst]) => (
                <tr key={param}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{param}</td>
                  <td style={tdStyle}>{cgst}</td>
                  <td style={tdStyle}>{sgst}</td>
                  <td style={tdStyle}>{igst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>How to Determine Interstate vs Intrastate</h2>
        <p>
          The Place of Supply under the IGST Act determines which component applies. For
          <strong> goods</strong>, it is generally where the goods are delivered. For <strong>services</strong>,
          it is the location of the recipient. Here&rsquo;s a simple way to check:
        </p>
        <ol>
          <li>Look at the first two digits of the supplier&rsquo;s GSTIN — this is the state code.</li>
          <li>Look at the first two digits of the buyer&rsquo;s GSTIN — this is their state code.</li>
          <li>If both state codes match → <strong>Intrastate</strong> (CGST + SGST).</li>
          <li>If state codes differ → <strong>Interstate</strong> (IGST).</li>
        </ol>
        <p>
          Our <Link to="/invoice-generator">GST Invoice Generator</Link> does this automatically — enter
          the GSTINs and it picks the right tax split.
        </p>
      </section>

      <section>
        <h2>Input Tax Credit (ITC) Set-Off Rules</h2>
        <p>
          Understanding which ITC credit can offset which liability is critical:
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>ITC Available</th>
                <th style={thStyle}>Can Set Off Against</th>
                <th style={thStyle}>Cannot Set Off Against</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>IGST Credit</td>
                <td style={tdStyle}>IGST → CGST → SGST (in that order)</td>
                <td style={tdStyle}>—</td>
              </tr>
              <tr>
                <td style={tdStyle}>CGST Credit</td>
                <td style={tdStyle}>CGST → IGST</td>
                <td style={{ ...tdStyle, color: "#ef4444" }}>Cannot set off against SGST</td>
              </tr>
              <tr>
                <td style={tdStyle}>SGST Credit</td>
                <td style={tdStyle}>SGST → IGST</td>
                <td style={{ ...tdStyle, color: "#ef4444" }}>Cannot set off against CGST</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "1rem" }}>
          The key rule: <strong>CGST and SGST credits cannot cross</strong> — you cannot use CGST credit
          to pay SGST or vice versa. Use our <Link to="/itc-calculator">ITC Calculator</Link> to
          compute your eligible credit set-off.
        </p>
      </section>

      <section>
        <h2>Common GST Rates with Tax Split</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Total GST Rate</th>
                <th style={{ ...thStyle, textAlign: "right" }}>CGST</th>
                <th style={{ ...thStyle, textAlign: "right" }}>SGST</th>
                <th style={{ ...thStyle, textAlign: "right" }}>IGST (if interstate)</th>
                <th style={thStyle}>Typical Items</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["5%", "2.5%", "2.5%", "5%", "Packaged food, footwear under ₹1000, economy transport"],
                ["12%", "6%", "6%", "12%", "Processed food, business class travel, cell phones"],
                ["18%", "9%", "9%", "18%", "Most services, electronics, computers, capital goods"],
                ["28%", "14%", "14%", "28%", "Luxury items, cars, tobacco, aerated drinks"],
              ].map(([total, cgst, sgst, igst, items]) => (
                <tr key={total}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{total}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{cgst}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{sgst}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{igst}</td>
                  <td style={tdStyle}>{items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: "1rem" }}>
          Look up the exact rate for any product using our <Link to="/hsn">HSN Code Finder</Link>.
        </p>
      </section>

      <section>
        <h2>Impact on GST Returns</h2>
        <p>
          All three components are reported in the same returns — <strong>GSTR-1</strong> (outward supply
          details) and <strong>GSTR-3B</strong> (summary return for tax payment). Each invoice line shows
          the CGST, SGST, and IGST amounts separately.
        </p>
        <p>
          When filing <Link to="/guides/how-to-file-gstr-1">GSTR-1</Link>, you classify each invoice
          as B2B or B2C, and the portal auto-categorises the tax component based on the Place of Supply
          you enter.
        </p>
        <p>
          In <Link to="/guides/how-to-file-gstr-3b">GSTR-3B</Link>, Table 3.1 shows your output tax
          split into IGST, CGST, and SGST. Table 4 shows the ITC available and utilised under each head.
        </p>
      </section>

      <section>
        <h2>Special Cases</h2>
        <h3>E-Commerce Sales</h3>
        <p>
          If you sell through Amazon or Flipkart, the platform deducts TCS (Tax Collected at Source)
          at 1% — split as 0.5% CGST + 0.5% SGST for intrastate, or 1% IGST for interstate.
        </p>

        <h3>Composition Scheme Dealers</h3>
        <p>
          Composition dealers pay a flat rate on turnover (0.5% CGST + 0.5% SGST for manufacturers,
          2.5% CGST + 2.5% SGST for restaurants). They cannot collect IGST — interstate sales are not
          permitted under the scheme. Check eligibility with our{" "}
          <Link to="/composition-scheme">Composition Scheme Tool</Link>.
        </p>

        <h3>Reverse Charge Mechanism (RCM)</h3>
        <p>
          Under RCM, the buyer pays GST instead of the seller. The same CGST/SGST vs IGST rule applies
          based on the place of supply. Check if RCM applies using our{" "}
          <Link to="/reverse-charge">Reverse Charge Checker</Link>.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>What is the difference between CGST, SGST, and IGST?</h3>
        <p>
          CGST and SGST are charged together on supplies within the same state (intrastate). IGST
          is charged on supplies between different states (interstate). The total GST rate is the
          same in both cases — only the split and the collecting government differ.
        </p>

        <h3>When is IGST charged instead of CGST and SGST?</h3>
        <p>
          IGST applies when the supplier and buyer are in different states, on imports into India,
          and on supplies to Special Economic Zones (SEZs).
        </p>

        <h3>Can I use CGST credit to pay SGST?</h3>
        <p>
          No. CGST credit can only be used against CGST or IGST liability. SGST credit can only
          be used against SGST or IGST liability. They cannot be used cross-ways.
        </p>

        <h3>Who collects IGST?</h3>
        <p>
          The Central Government collects IGST. After collection, the Centre settles the state&rsquo;s
          share with the destination state (the state where the goods or services are consumed).
        </p>

        <h3>Is the buyer paying more for interstate purchases?</h3>
        <p>
          No. The total GST amount is the same whether the supply is intrastate or interstate. An
          18% GST item costs 18% more in both cases — only the government accounting differs.
        </p>
      </section>

      <section className="blog-cta">
        <h2>Calculate Your GST Split Instantly</h2>
        <p>
          Use our free tools to get CGST, SGST, and IGST breakdowns for any transaction — no
          sign-up required.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <Link to="/calculator" className="btn btn-primary">GST Calculator</Link>
          <Link to="/invoice-generator" className="btn" style={{ border: "1px solid var(--border)", color: "var(--ink)" }}>Invoice Generator</Link>
          <Link to="/" className="btn" style={{ border: "1px solid var(--border)", color: "var(--ink)" }}>Try DoAide GST free →</Link>
        </div>
      </section>
    </article>
  );
}
