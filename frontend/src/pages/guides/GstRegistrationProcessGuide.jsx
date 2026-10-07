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

const FAQ_ITEMS = [
  {
    q: "What is the GST registration turnover limit for 2026?",
    a: "For goods, the limit is ₹40 lakh (₹20 lakh in special states). For services, it is ₹20 lakh (₹10 lakh in special states). These apply to aggregate turnover across all states.",
  },
  {
    q: "How long does the GST registration process take?",
    a: "The application takes 30-60 minutes. Approval typically comes within 3-7 working days. If a query is raised, you get 7 days to respond.",
  },
  {
    q: "Is GST registration free of charge?",
    a: "Yes, GST registration on the official portal (gst.gov.in) is completely free. There is no government fee. Beware of third-party websites that charge for registration.",
  },
  {
    q: "Can I apply for GST registration online?",
    a: "Yes, GST registration is entirely online through gst.gov.in. You need a PAN, mobile number, email, and supporting documents. The process uses Aadhaar OTP or Digital Signature Certificate for verification.",
  },
  {
    q: "What happens after GST registration is approved?",
    a: "You receive your 15-digit GSTIN, must display it on signboards and invoices, start filing returns (GSTR-1, GSTR-3B), and can begin collecting GST and claiming ITC.",
  },
];

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "GST Registration Process Step by Step 2026",
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
  { name: "GST Registration Process" },
];

export default function GstRegistrationProcessGuide() {
  usePageTitle("GST Registration Process Step by Step 2026 — Complete Guide");
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Registration Process Step by Step 2026 — Complete Guide"
        description="Complete step-by-step guide to GST registration in India 2026. Documents required, eligibility criteria, online process on gst.gov.in, timelines, and common mistakes to avoid."
        path="/guides/gst-registration-process"
        jsonLd={[ARTICLE_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container" style={{ maxWidth: 800 }}>
          <Breadcrumb />
          <h1 className="tool-title">GST Registration Process Step by Step 2026</h1>
          <p className="tool-subtitle">
            Complete guide to registering for GST in India — eligibility, documents,
            step-by-step portal walkthrough, and what to do after registration.
          </p>

          <section className="tool-info">
            <h2>Who Needs GST Registration?</h2>
            <h3>Mandatory Registration</h3>
            <ul>
              <li>Businesses with annual turnover above <strong>₹40 lakh</strong> for goods (₹20 lakh for special category states)</li>
              <li>Service providers with turnover above <strong>₹20 lakh</strong> (₹10 lakh for special states)</li>
              <li>Persons making <strong>interstate supplies</strong> (regardless of turnover)</li>
              <li>E-commerce operators and suppliers through e-commerce platforms</li>
              <li>Casual taxable persons and non-resident taxable persons</li>
              <li>Agents of a supplier and Input Service Distributors</li>
              <li>Persons required to pay tax under reverse charge</li>
              <li>Persons supplying online information and database access services from outside India</li>
            </ul>
            <h3>Voluntary Registration</h3>
            <p>
              Any business below the threshold can register voluntarily. Benefits include
              claiming <Link to="/input-tax-credit">Input Tax Credit</Link> on purchases,
              supplying to other registered businesses (who need GST invoices for their ITC),
              and operating on e-commerce platforms.
            </p>
          </section>

          <section className="tool-info">
            <h2>Documents Required for GST Registration</h2>
            <ul>
              <li><strong>PAN card</strong> of the business or proprietor</li>
              <li><strong>Aadhaar card</strong> of all promoters/partners</li>
              <li><strong>Business address proof:</strong> electricity bill (last 2 months), rent agreement, or property tax receipt</li>
              <li><strong>Bank account details:</strong> cancelled cheque or first page of passbook/statement</li>
              <li><strong>Passport-size photographs</strong> of promoters/partners</li>
              <li><strong>Incorporation certificate</strong> (for companies and LLPs)</li>
              <li><strong>Partnership deed</strong> (for partnership firms)</li>
              <li><strong>Board resolution / authorization letter</strong> naming the authorized signatory</li>
              <li><strong>Digital Signature Certificate (DSC)</strong> — required for companies and LLPs, optional for others (Aadhaar OTP can be used instead)</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Step-by-Step Registration Process on GST Portal</h2>

            <h3>Step 1: Visit the GST Portal</h3>
            <p>
              Go to <strong>gst.gov.in</strong> → Services → Registration → New Registration.
              Select &ldquo;Taxpayer&rdquo; as the type of registration.
            </p>

            <h3>Step 2: Fill Part A — Get Your TRN</h3>
            <p>
              Enter your state, PAN, email, and mobile number. Verify both with OTP.
              You receive a <strong>TRN (Temporary Reference Number)</strong> — save this.
              The TRN is valid for 15 days.
            </p>

            <h3>Step 3: Log In with TRN and Fill Part B</h3>
            <p>
              Log in using the TRN and OTP. Part B has 10 tabs to fill:
            </p>
            <ol>
              <li><strong>Business Details:</strong> trade name, constitution (proprietor/partnership/company), date of commencement</li>
              <li><strong>Promoter/Partner Details:</strong> name, PAN, Aadhaar, address, photo for each promoter</li>
              <li><strong>Authorized Signatory:</strong> person authorized to sign returns and documents</li>
              <li><strong>Principal Place of Business:</strong> address, nature of possession (owned/rented/leased), address proof</li>
              <li><strong>Additional Places of Business:</strong> branches, warehouses, godowns</li>
              <li><strong>Goods and Services:</strong> select top 5 <Link to="/hsn-sac-finder">HSN/SAC codes</Link> for your products/services</li>
              <li><strong>Bank Account:</strong> account number, IFSC, bank name (can be added within 45 days of registration)</li>
              <li><strong>State-specific Information:</strong> professional tax number (if applicable)</li>
              <li><strong>Aadhaar Authentication:</strong> choose Aadhaar OTP verification</li>
              <li><strong>Verification:</strong> submit using DSC or e-sign</li>
            </ol>

            <h3>Step 4: Upload Documents and Submit</h3>
            <p>
              Upload all required documents in PDF or JPEG format (max 1 MB each).
              Submit the application. You receive an <strong>ARN (Application Reference Number)</strong> via
              email and SMS.
            </p>

            <h3>Step 5: Application Review (3-7 Working Days)</h3>
            <p>
              The tax officer reviews your application. They may raise a query (SCN) if
              documents are unclear — you get 7 days to respond via the portal.
            </p>

            <h3>Step 6: Receive Your GSTIN</h3>
            <p>
              On approval, your <strong>GSTIN</strong> is generated. Download the registration
              certificate from the portal. You can <Link to="/gstin-validator">validate your GSTIN format</Link> to
              confirm it is correct.
            </p>
          </section>

          <section className="tool-info">
            <h2>After Registration — What&apos;s Next?</h2>
            <ul>
              <li>Display GSTIN on your signboard and all invoices</li>
              <li>Start issuing <Link to="/invoice-generator">GST-compliant invoices</Link></li>
              <li>File <Link to="/due-dates">GSTR-1 and GSTR-3B returns</Link> on time every month/quarter</li>
              <li>Use the <Link to="/calculator">GST Calculator</Link> for accurate tax computation</li>
              <li>Maintain proper books of accounts for at least 6 years</li>
              <li>Apply for <Link to="/composition-scheme">Composition Scheme</Link> if eligible and beneficial</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Common Registration Mistakes to Avoid</h2>
            <ul>
              <li>Using a personal PAN instead of the business PAN (for companies/LLPs)</li>
              <li>Uploading blurry or expired documents</li>
              <li>Not mentioning all business premises — each state needs a separate registration</li>
              <li>Choosing wrong HSN/SAC codes for your products</li>
              <li>Not responding to officer queries within 7 days (application gets rejected)</li>
              <li>Forgetting to add bank account details within 45 days of registration</li>
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
            source="gst-registration-guide"
            heading="Get GST compliance updates"
            subtext="Free email alerts for GST rule changes, filing deadlines, and compliance tips."
            buttonLabel="Subscribe"
            compact
          />

          <RelatedTools current="/guides/gst-registration-process" />
          <CrossProductLinks page="guides" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
