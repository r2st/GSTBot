import { useState } from "react";
import { Link } from "react-router-dom";
import Breadcrumb from "../../components/Breadcrumb";
import CrossProductLinks from "../../components/CrossProductLinks";
import DoAideFooter from "../../components/DoAideFooter";
import EmailCapture from "../../components/EmailCapture";
import RelatedTools from "../../components/RelatedTools";
import SeoHead from "../../components/SeoHead";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const SERVICE_RATES = [
  { service: "Restaurant (without AC, non-alcohol)", rate: "5%" },
  { service: "Restaurant (with AC or licensed to serve alcohol)", rate: "5% (no ITC)" },
  { service: "Outdoor catering", rate: "5% (no ITC)" },
  { service: "Hotel room (up to ₹1,000/night)", rate: "0%" },
  { service: "Hotel room (₹1,001 - ₹7,500/night)", rate: "18%" },
  { service: "Hotel room (above ₹7,500/night)", rate: "18%" },
  { service: "Transport of goods by road", rate: "5% (no ITC) / 18%" },
  { service: "Transport of passengers (AC bus, railways)", rate: "5% (no ITC)" },
  { service: "Air travel (economy)", rate: "5% (no ITC)" },
  { service: "Air travel (business class)", rate: "18%" },
  { service: "IT and software services", rate: "18%" },
  { service: "Professional services (CA, lawyer, consultant)", rate: "18%" },
  { service: "Financial services (banking)", rate: "18%" },
  { service: "Health insurance", rate: "0% (GST 2.0)" },
  { service: "Life insurance", rate: "0% (GST 2.0)" },
  { service: "Construction (affordable housing)", rate: "1% (no ITC)" },
  { service: "Construction (other residential)", rate: "5% (no ITC)" },
  { service: "Construction (commercial)", rate: "18%" },
  { service: "Works contract (government)", rate: "18%" },
  { service: "Telecom services", rate: "18%" },
  { service: "Renting of commercial property", rate: "18%" },
  { service: "Renting of residential property (to registered person)", rate: "18% (RCM)" },
];

const FAQ_ITEMS = [
  {
    q: "How many GST rate slabs are there in India under GST 2.0?",
    a: "Under GST 2.0, India has 3 slabs plus Nil: 0% (essentials, insurance), 5% (necessities), 18% (most goods and services), and 40% (tobacco, luxury). Special rates for diamonds, gold, and jewellery continue.",
  },
  {
    q: "How do I find the GST rate for my product?",
    a: "Every product has an HSN code that determines its GST rate. Use our HSN Code Finder to search by name or code. The rate is tied to the HSN code, not the product name.",
  },
  {
    q: "What happened to the 12% and 28% GST slabs?",
    a: "The 12% and 28% slabs are abolished under GST 2.0. Items at 12% moved to 5% or 18%; items at 28% moved to 18% or 40%. This simplifies the structure from 5 slabs to 3 plus Nil.",
  },
  {
    q: "What is the GST rate on food items?",
    a: "Fresh foods (milk, fruits, vegetables, grains, eggs) are exempt at 0%. Processed foods are mostly 5% or 18%. Restaurant food is 5% without ITC since the 2019 simplification.",
  },
  {
    q: "Is GST still applicable on insurance under GST 2.0?",
    a: "No. Under GST 2.0, health insurance and life insurance have been moved to 0% (Nil). This was one of the major changes in the GST 2.0 rationalization, providing significant relief to policyholders.",
  },
  {
    q: "How often do GST rates change?",
    a: "The GST Council meets roughly quarterly. Rate changes come via CBIC notifications from a specified date. Major rate rationalization like GST 2.0 happens based on Council recommendations.",
  },
];

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "GST Rates List by Product Category 2026",
  author: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  publisher: { "@type": "Organization", name: "DoAide", url: "https://doaide.com" },
  datePublished: "2026-10-07",
  dateModified: "2026-10-07",
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
  { name: "GST Rates List 2026" },
];

export default function GstRatesListGuide() {
  usePageTitle("GST Rates List by Product Category 2026 — Complete Guide");
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Rates List by Product Category 2026 — Complete Guide"
        description="Complete GST 2.0 rates list for India 2026. All GST rate slabs (0%, 5%, 18%, 40%) with product categories, HSN codes, and service rates. Old 12% and 28% slabs abolished. Updated with latest council changes."
        path="/guides/gst-rates-list-2026"
        jsonLd={[ARTICLE_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container" style={{ maxWidth: 800 }}>
          <Breadcrumb />
          <h1 className="tool-title">GST Rates List by Product Category 2026</h1>
          <p className="tool-subtitle">
            Complete list of GST rates for goods and services in India. Find the
            rate for any product or service by category.
          </p>

          <section className="tool-info">
            <h2>GST 2.0 Rate Slabs Overview</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr><th>Rate</th><th>Category</th><th>Examples</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>0% (Nil)</strong></td><td>Exempt / Essential</td><td>Fresh food, milk, bread, books, healthcare, insurance (health &amp; life)</td></tr>
                  <tr><td><strong>0.25%</strong></td><td>Precious stones</td><td>Rough diamonds</td></tr>
                  <tr><td><strong>1.5%</strong></td><td>Precious metals</td><td>Gold bars, silver bars</td></tr>
                  <tr><td><strong>3%</strong></td><td>Jewellery</td><td>Gold jewellery, silver articles</td></tr>
                  <tr><td><strong>5%</strong></td><td>Common necessities</td><td>Sugar, tea, spices, transport, cancer drugs</td></tr>
                  <tr><td><strong>18%</strong></td><td>Most goods &amp; services</td><td>Electronics, furniture, IT, financial services, cement, processed food, smartphones</td></tr>
                  <tr><td><strong>40%</strong></td><td>Premium &amp; demerit goods</td><td>Tobacco, aerated drinks, vehicles above ₹20L, bikes above 350cc, luxury goods</td></tr>
                </tbody>
              </table>
            </div>
            <p><em>The old 12% and 28% slabs have been abolished under GST 2.0. Items previously at 12% moved to 5% or 18%; items at 28% moved to 18% or 40%. Compensation cess on tobacco eliminated from Feb 2026.</em></p>
          </section>

          <section className="tool-info">
            <h2>0% GST — Exempt Goods &amp; Services</h2>
            <ul>
              <li>Fresh fruits and vegetables</li>
              <li>Milk (unprocessed), curd, lassi, buttermilk</li>
              <li>Eggs, fresh meat, fresh fish</li>
              <li>Bread (plain, not pre-packaged branded)</li>
              <li>Salt, natural honey</li>
              <li>Grains, cereals, pulses (not pre-packaged branded)</li>
              <li>Handloom products</li>
              <li>Books, newspapers, periodicals</li>
              <li>Hearing aids</li>
              <li>Educational services, healthcare services</li>
              <li><strong>Health insurance (GST 2.0)</strong></li>
              <li><strong>Life insurance (GST 2.0)</strong></li>
              <li><strong>33 life-saving medicines (GST 2.0)</strong></li>
            </ul>
            <p>
              Note: Since July 2022, pre-packaged and labelled food items (cereals, pulses,
              flour, curd, paneer) attract 5% GST when sold in packages of up to 25 kg.
            </p>
          </section>

          <section className="tool-info">
            <h2>5% GST Items</h2>
            <ul>
              <li>Sugar, tea, coffee (not instant)</li>
              <li>Edible oils, spices</li>
              <li>Branded cereals and pulses (pre-packaged)</li>
              <li>Coal, lignite</li>
              <li>Footwear up to ₹1,000</li>
              <li>Apparel up to ₹1,000</li>
              <li>Fertilizers</li>
              <li>Transport services (passenger)</li>
              <li>Economy air travel</li>
              <li>Small restaurants (5% without ITC)</li>
              <li><strong>Cancer drugs (moved from 12% under GST 2.0)</strong></li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>18% GST Items</h2>
            <ul>
              <li>Electronics — computers, monitors, printers, cameras</li>
              <li>Furniture — desks, chairs, beds</li>
              <li>Home appliances — refrigerators, washing machines, water heaters</li>
              <li>Instant coffee, pasta, cornflakes, soups</li>
              <li>Detergent, shampoo, cosmetics</li>
              <li>IT services, consulting, professional services</li>
              <li>Financial services (banking)</li>
              <li>Telecom services</li>
              <li>Hotel rooms above ₹1,000/night</li>
              <li>Renting of commercial property</li>
              <li><strong>Processed food, medicines, smartphones (moved from 12% under GST 2.0)</strong></li>
              <li><strong>Cement, air conditioners (moved from 28% under GST 2.0)</strong></li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>40% GST — Premium &amp; Demerit Goods (GST 2.0)</h2>
            <ul>
              <li>Tobacco products — cigarettes, gutka, pan masala</li>
              <li>Aerated drinks and energy drinks</li>
              <li>Motor vehicles above ₹20 lakh</li>
              <li>Motorcycles above 350cc</li>
              <li>Luxury goods — yachts, aircraft for personal use</li>
              <li>Gambling, betting, lottery</li>
            </ul>
            <p>
              Under GST 2.0, the old 28% slab has been abolished. Most items moved to 18%, while
              premium and demerit goods now attract 40% GST. Compensation cess on tobacco was
              eliminated from February 2026.
            </p>
          </section>

          <section className="tool-info">
            <h2>GST Rates on Services</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr><th>Service</th><th>GST Rate</th></tr>
                </thead>
                <tbody>
                  {SERVICE_RATES.map((s) => (
                    <tr key={s.service}>
                      <td>{s.service}</td>
                      <td>{s.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tool-info">
            <h2>How to Find the GST Rate for Your Product</h2>
            <p>
              Every product is classified under an HSN code and every service under a SAC
              code. The GST rate is determined by the code, not the product name. Two
              products with similar names can have different rates if their HSN codes differ.
            </p>
            <ul>
              <li>Use the <Link to="/hsn-sac-finder">HSN/SAC Code Finder</Link> to search by product or service name</li>
              <li>Use the <Link to="/hsn">HSN Code Search</Link> to look up a specific code</li>
              <li>Use the <Link to="/calculator">GST Calculator</Link> to compute tax at any rate</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>GST 2.0 Rate Changes 2026</h2>
            <ul>
              <li><strong>12% slab abolished</strong> — items moved to 5% or 18%</li>
              <li><strong>28% slab abolished</strong> — items moved to 18% or 40%</li>
              <li><strong>New 40% slab</strong> — tobacco, aerated drinks, vehicles above ₹20L, bikes above 350cc</li>
              <li><strong>Insurance at 0%</strong> — health and life insurance moved from 18% to Nil</li>
              <li><strong>Cancer drugs at 5%</strong> — reduced from 12%</li>
              <li><strong>33 life-saving medicines</strong> — moved to Nil rate</li>
              <li><strong>Compensation cess on tobacco</strong> — eliminated from February 2026</li>
              <li><strong>Leasing without operator</strong> — same rate as underlying goods</li>
              <li>All rates on this page are updated to reflect GST 2.0 as of October 2026</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>
            <dl className="landing-faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="landing-faq-item">
                  <dt>
                    <button
                      className="landing-faq-q"
                      aria-expanded={openFaq === i}
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      {item.q}
                      <span className="landing-faq-chevron" aria-hidden="true">{openFaq === i ? "−" : "+"}</span>
                    </button>
                  </dt>
                  {openFaq === i && <dd className="landing-faq-a">{item.a}</dd>}
                </div>
              ))}
            </dl>
          </section>

          <EmailCapture
            source="gst-rates-guide"
            heading="Get notified about GST rate changes"
            subtext="Free email alerts when GST rates change for your products."
            buttonLabel="Notify Me"
            compact
          />

          <RelatedTools current="/guides/gst-rates-list-2026" />
          <CrossProductLinks page="guides" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
