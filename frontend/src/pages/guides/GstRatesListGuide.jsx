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
  { service: "Hotel room (₹1,001 - ₹7,500/night)", rate: "12%" },
  { service: "Hotel room (above ₹7,500/night)", rate: "18%" },
  { service: "Transport of goods by road", rate: "5% (no ITC) / 12%" },
  { service: "Transport of passengers (AC bus, railways)", rate: "5% (no ITC)" },
  { service: "Air travel (economy)", rate: "5% (no ITC)" },
  { service: "Air travel (business class)", rate: "12%" },
  { service: "IT and software services", rate: "18%" },
  { service: "Professional services (CA, lawyer, consultant)", rate: "18%" },
  { service: "Financial services (banking, insurance)", rate: "18%" },
  { service: "Construction (affordable housing)", rate: "1% (no ITC)" },
  { service: "Construction (other residential)", rate: "5% (no ITC)" },
  { service: "Construction (commercial)", rate: "12%" },
  { service: "Works contract (government)", rate: "12%" },
  { service: "Telecom services", rate: "18%" },
  { service: "Renting of commercial property", rate: "18%" },
  { service: "Renting of residential property (to registered person)", rate: "18% (RCM)" },
];

const FAQ_ITEMS = [
  {
    q: "How many GST rate slabs are there in India?",
    a: "India has 5 main slabs: 0%, 5%, 12%, 18%, and 28%. Special rates of 0.25%, 1.5%, and 3% apply to diamonds, gold, and jewellery. A compensation cess applies on top of 28% for luxury goods.",
  },
  {
    q: "How do I find the GST rate for my product?",
    a: "Every product has an HSN code that determines its GST rate. Use our HSN Code Finder to search by name or code. The rate is tied to the HSN code, not the product name.",
  },
  {
    q: "What is the GST rate on food items?",
    a: "Fresh foods (milk, fruits, vegetables, grains, eggs) are exempt at 0%. Processed foods are mostly 5-12%. Restaurant food is 5% without ITC since the 2019 simplification.",
  },
  {
    q: "Are there any goods exempt from GST?",
    a: "Yes. Exempt items include fresh milk, fruits, vegetables, bread, salt, honey, eggs, books, newspapers, and hearing aids. Healthcare and education are also exempt.",
  },
  {
    q: "How often do GST rates change?",
    a: "The GST Council meets roughly quarterly. Rate changes come via CBIC notifications from a specified date. Major rate rationalization happens 1-2 times per year.",
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
        description="Complete GST rates list for India 2026. All GST rate slabs (0%, 5%, 12%, 18%, 28%) with product categories, HSN codes, and service rates. Updated with latest council changes."
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
            <h2>GST Rate Slabs Overview</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="comparison-table">
                <thead>
                  <tr><th>Rate</th><th>Category</th><th>Examples</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>0%</strong></td><td>Exempt / Essential</td><td>Fresh food, milk, bread, books, healthcare</td></tr>
                  <tr><td><strong>0.25%</strong></td><td>Precious stones</td><td>Rough diamonds</td></tr>
                  <tr><td><strong>1.5%</strong></td><td>Precious metals</td><td>Gold bars, silver bars</td></tr>
                  <tr><td><strong>3%</strong></td><td>Jewellery</td><td>Gold jewellery, silver articles</td></tr>
                  <tr><td><strong>5%</strong></td><td>Common necessities</td><td>Sugar, tea, spices, transport, economy hotels</td></tr>
                  <tr><td><strong>12%</strong></td><td>Standard goods</td><td>Processed food, medicines, smartphones</td></tr>
                  <tr><td><strong>18%</strong></td><td>Most goods &amp; services</td><td>Electronics, furniture, IT, financial services</td></tr>
                  <tr><td><strong>28%</strong></td><td>Luxury &amp; sin goods</td><td>Cars, AC, cement, soft drinks, tobacco</td></tr>
                  <tr><td><strong>28% + Cess</strong></td><td>Demerit goods</td><td>Aerated drinks, luxury cars, tobacco products</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="tool-info">
            <h2>0% GST — Exempt Goods</h2>
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
              <li>Small restaurants (₹5% without ITC)</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>12% GST Items</h2>
            <ul>
              <li>Processed food (frozen, preserved)</li>
              <li>Medicines and pharmaceutical preparations</li>
              <li>Smartphones and mobile phones</li>
              <li>Sewing machines</li>
              <li>Apparel above ₹1,000</li>
              <li>Umbrella</li>
              <li>Diagnostic kits and reagents</li>
              <li>Business class air travel</li>
              <li>Hotel rooms ₹1,001-₹7,500/night</li>
              <li>Works contract (government)</li>
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
              <li>Financial services, insurance</li>
              <li>Telecom services</li>
              <li>Hotel rooms above ₹7,500/night</li>
              <li>Renting of commercial property</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>28% GST Items + Cess</h2>
            <ul>
              <li>Motor cars, SUVs, luxury vehicles (+ cess 1-22%)</li>
              <li>Air conditioners</li>
              <li>Cement</li>
              <li>Aerated drinks and energy drinks (+ 12% cess)</li>
              <li>Tobacco products — cigarettes, gutka, pan masala (+ cess up to 290%)</li>
              <li>Luxury goods — yachts, aircraft for personal use</li>
              <li>Gambling, betting, lottery</li>
              <li>Movie tickets above ₹100</li>
            </ul>
            <p>
              Compensation Cess is levied on top of 28% GST on luxury and sin goods to
              compensate states for revenue loss during the GST transition.
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
            <h2>Recent GST Rate Changes 2026</h2>
            <ul>
              <li>The GST Council continues to meet quarterly to review and rationalize rates</li>
              <li>Rate changes are published via CBIC notifications on cbic.gov.in</li>
              <li>All rates on this page are updated to reflect the latest notifications as of October 2026</li>
              <li>Subscribe below to get notified when rates change</li>
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
