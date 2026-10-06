import { useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../../components/SeoHead";
import DoAideFooter from "../../components/DoAideFooter";
import ToolsNav from "../../components/ToolsNav";
import { usePageTitle } from "../../hooks/usePageTitle";

const FAQ_ITEMS = [
  {
    q: "What is the GST registration threshold in India?",
    a: "The GST registration threshold is Rs 40 lakhs annual turnover for goods and Rs 20 lakhs for services. For special category states (northeastern and hill states), the threshold is Rs 20 lakhs for goods and Rs 10 lakhs for services.",
  },
  {
    q: "How long does GST registration take?",
    a: "GST registration typically takes 3 to 7 working days after submitting the application. If the officer requests additional documents, it may take up to 30 days. The TRN (Temporary Reference Number) is generated immediately upon submitting Part A.",
  },
  {
    q: "Is GST registration free?",
    a: "Yes. GST registration on the GST portal (gst.gov.in) is completely free. There is no government fee for registration. Be wary of third-party services that charge for registration.",
  },
  {
    q: "Can I register for GST voluntarily below the threshold?",
    a: "Yes. Any business can register for GST voluntarily even if turnover is below the threshold. This is useful if you want to claim Input Tax Credit on purchases or if your customers require GST invoices.",
  },
  {
    q: "What documents are needed for GST registration?",
    a: "You need PAN card, Aadhaar card, proof of business registration (partnership deed, incorporation certificate, etc.), address proof of business premises (electricity bill, rent agreement), bank account details with cancelled cheque or statement, and passport-size photographs of promoters.",
  },
  {
    q: "Can I have multiple GST registrations?",
    a: "Yes. You need a separate GST registration for each state where you have a place of business. Within the same state, you can also opt for multiple registrations for different business verticals.",
  },
];

const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Register for GST in India",
  description: "Step-by-step guide to registering for GST on the GST portal (gst.gov.in)",
  totalTime: "PT30M",
  step: [
    { "@type": "HowToStep", name: "Visit the GST Portal", text: "Go to gst.gov.in and click Services > Registration > New Registration." },
    { "@type": "HowToStep", name: "Fill Part A", text: "Enter your PAN, mobile number, and email address. Verify with OTP to get your TRN." },
    { "@type": "HowToStep", name: "Log in with TRN", text: "Use the TRN to log in and start filling Part B of the application." },
    { "@type": "HowToStep", name: "Enter Business Details", text: "Fill in trade name, constitution of business, and state of registration." },
    { "@type": "HowToStep", name: "Add Promoter Details", text: "Enter personal details and identity documents for all promoters or partners." },
    { "@type": "HowToStep", name: "Add Principal Place of Business", text: "Enter business address and upload proof of address (electricity bill, rent agreement, or ownership document)." },
    { "@type": "HowToStep", name: "Add Bank Account Details", text: "Enter your business bank account number, IFSC code, and upload a cancelled cheque or bank statement." },
    { "@type": "HowToStep", name: "Select Goods and Services", text: "Choose the HSN codes for goods and SAC codes for services you deal in." },
    { "@type": "HowToStep", name: "Verify with Aadhaar or DSC", text: "Choose Aadhaar-based verification (OTP) or sign with a Digital Signature Certificate (DSC)." },
    { "@type": "HowToStep", name: "Submit and Track", text: "Submit the application and track status using your ARN (Application Reference Number)." },
  ],
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
  { name: "GST Registration" },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading">Frequently Asked Questions</h2>
      <dl className="compare-faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="compare-faq-item">
            <dt>
              <button
                className="compare-faq-q"
                aria-expanded={openIndex === i}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {item.q}
                <span aria-hidden="true">{openIndex === i ? "−" : "+"}</span>
              </button>
            </dt>
            {openIndex === i && <dd className="compare-faq-a">{item.a}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function GstRegistrationGuide() {
  usePageTitle("How to Register for GST in India — Step-by-Step Guide 2026");

  return (
    <div className="tool-page">
      <SeoHead
        title="How to Register for GST in India — Complete Step-by-Step Guide 2026"
        description="Learn how to register for GST in India step by step. Covers eligibility, documents required, online registration process, timelines, and common mistakes. Updated for 2026."
        path="/guides/gst-registration"
        jsonLd={[HOWTO_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="compare-container">
          <article className="blog-article">
            <h1>How to Register for GST in India &mdash; Complete Step-by-Step Guide</h1>
            <p className="blog-meta">Updated October 2026 &middot; 10 min read</p>

            <section>
              <h2>What Is GST Registration?</h2>
              <p>
                GST registration is the process of obtaining a unique 15-digit GSTIN (Goods and Services
                Tax Identification Number) from the government. This number is required for collecting GST
                from customers, claiming Input Tax Credit (ITC) on purchases, and filing GST returns.
                Registration is done online through the GST portal at gst.gov.in and is completely free.
              </p>
              <p>
                Once registered, you are legally required to charge GST on your supplies, issue GST-compliant
                invoices, file periodic returns (GSTR-1 and GSTR-3B), and maintain proper records.
              </p>
            </section>

            <section>
              <h2>Who Needs to Register for GST?</h2>
              <p>GST registration is mandatory for the following:</p>
              <ul>
                <li><strong>Turnover threshold:</strong> Businesses with annual turnover exceeding Rs 40 lakhs for goods (Rs 20 lakhs in special category states) or Rs 20 lakhs for services (Rs 10 lakhs in special category states)</li>
                <li><strong>Inter-state suppliers:</strong> Anyone making taxable supplies across state borders, regardless of turnover</li>
                <li><strong>E-commerce sellers:</strong> All sellers on e-commerce platforms must register regardless of turnover</li>
                <li><strong>E-commerce operators:</strong> Platforms like Amazon, Flipkart that facilitate supply</li>
                <li><strong>Casual taxable persons:</strong> Businesses operating temporarily in a state where they have no fixed place of business</li>
                <li><strong>Non-resident taxable persons:</strong> Foreign businesses making taxable supplies in India</li>
                <li><strong>TDS/TCS deductors:</strong> Government departments and e-commerce operators required to deduct/collect tax at source</li>
                <li><strong>Input Service Distributors (ISDs):</strong> Offices that receive invoices and distribute credit to branches</li>
                <li><strong>Agents:</strong> Persons making taxable supplies on behalf of other registered persons</li>
              </ul>
              <p>
                Even if you fall below the threshold, you can register voluntarily. This is beneficial if
                your customers are registered businesses who need GST invoices to claim ITC, or if you want
                to claim ITC on your own purchases.
              </p>
            </section>

            <section>
              <h2>Documents Required for GST Registration</h2>
              <p>Keep the following documents ready before starting your application:</p>

              <h3>For All Applicants</h3>
              <ul>
                <li>PAN card of the business or proprietor</li>
                <li>Aadhaar card of the primary authorized signatory</li>
                <li>Passport-size photograph of the promoter(s)/partner(s)</li>
                <li>Proof of business address &mdash; electricity bill (not older than 2 months), municipal khata, or property tax receipt</li>
                <li>If rented premises &mdash; rent agreement and a No Objection Certificate (NOC) from the owner</li>
                <li>Bank account details &mdash; cancelled cheque, bank statement, or passbook first page</li>
              </ul>

              <h3>Additional Documents by Business Type</h3>
              <ul>
                <li><strong>Proprietorship:</strong> PAN and Aadhaar of the proprietor</li>
                <li><strong>Partnership:</strong> Partnership deed, PAN of the firm</li>
                <li><strong>LLP:</strong> LLP agreement, certificate of incorporation, PAN of the LLP</li>
                <li><strong>Private Limited / Public Limited:</strong> Certificate of incorporation, MOA/AOA, board resolution, PAN of the company</li>
                <li><strong>HUF:</strong> HUF deed, PAN of the HUF</li>
              </ul>
            </section>

            <section>
              <h2>Step-by-Step GST Registration Process</h2>

              <h3>Step 1: Visit the GST Portal</h3>
              <p>
                Go to <strong>gst.gov.in</strong> and click on <strong>Services &gt; Registration &gt; New Registration</strong>.
                Select &ldquo;Taxpayer&rdquo; as the type of applicant.
              </p>

              <h3>Step 2: Fill Part A of the Application</h3>
              <p>
                Enter your state, district, PAN number, legal name of business, email address, and
                mobile number. You will receive OTPs on both email and mobile for verification. After
                verification, you receive a Temporary Reference Number (TRN).
              </p>

              <h3>Step 3: Log In with TRN</h3>
              <p>
                Go to Services &gt; Registration &gt; New Registration, select the TRN tab, and enter
                your TRN and the OTP sent to your registered mobile and email. This opens Part B
                of the application.
              </p>

              <h3>Step 4: Enter Business Details</h3>
              <p>
                Fill in your trade name (the name your business is known by), constitution of business
                (proprietorship, partnership, company, etc.), and the state/UT where you are registering.
                If you have an existing registration under VAT, Service Tax, or Excise, enter those details.
              </p>

              <h3>Step 5: Add Promoter/Partner Details</h3>
              <p>
                Enter personal details for all promoters, partners, or directors including name, date
                of birth, PAN, Aadhaar, mobile number, email, and residential address. Upload passport-size
                photographs. At least one person must be designated as the Primary Authorized Signatory.
              </p>

              <h3>Step 6: Add Principal Place of Business</h3>
              <p>
                Enter the complete address of your principal place of business. Upload proof of address
                such as an electricity bill, rent agreement with NOC, or municipal khata copy. If you
                have additional places of business in the same state, add them here.
              </p>

              <h3>Step 7: Add Bank Account Details</h3>
              <p>
                Enter your business bank account number, account holder name, IFSC code, and bank name.
                Upload a scanned copy of the cancelled cheque or first page of the bank passbook. You
                can add multiple bank accounts.
              </p>

              <h3>Step 8: Select Goods and Services</h3>
              <p>
                Choose the top 5 goods (by HSN code) and services (by SAC code) that your business deals in.
                Use our <Link to="/hsn">HSN Code Finder</Link> to look up the correct codes for your
                products and services.
              </p>

              <h3>Step 9: Verification</h3>
              <p>
                Choose your verification method. You can verify using Aadhaar-based authentication (OTP
                sent to your Aadhaar-linked mobile), Digital Signature Certificate (DSC) for companies
                and LLPs, or Electronic Verification Code (EVC) for proprietorships and partnerships.
              </p>

              <h3>Step 10: Submit and Track</h3>
              <p>
                Review all details, check the declaration box, and submit. You will receive an
                Application Reference Number (ARN) via email and SMS. Use this ARN to track the status
                of your application on the GST portal under Services &gt; Registration &gt; Track
                Application Status.
              </p>
            </section>

            <section>
              <h2>Types of GST Registration</h2>
              <ul>
                <li><strong>Regular Registration:</strong> Standard registration for businesses above the turnover threshold. File monthly or quarterly returns.</li>
                <li><strong>Composition Scheme:</strong> For businesses with turnover up to Rs 1.5 crore (Rs 75 lakhs for services). Pay tax at a fixed rate (1% for manufacturers, 5% for restaurants, 6% for services) and file quarterly returns. Cannot claim ITC or collect tax from customers.</li>
                <li><strong>Casual Taxable Person:</strong> For temporary business activities in a state. Valid for 90 days, extendable by another 90 days. Requires advance tax deposit.</li>
                <li><strong>Non-Resident Taxable Person:</strong> For foreign businesses making taxable supplies in India. Valid for 90 days with advance tax deposit.</li>
                <li><strong>Input Service Distributor (ISD):</strong> For offices that receive tax invoices for services and distribute ITC to branches.</li>
              </ul>
            </section>

            <section>
              <h2>Registration Timeline</h2>
              <ul>
                <li><strong>TRN generation:</strong> Immediate upon completing Part A</li>
                <li><strong>Application processing:</strong> 3 to 7 working days</li>
                <li><strong>Clarification request:</strong> Officer may request additional documents within 7 days</li>
                <li><strong>Response deadline:</strong> You must respond to clarification within 7 working days</li>
                <li><strong>Maximum timeline:</strong> 30 days from submission if clarification is sought</li>
                <li><strong>GSTIN issuance:</strong> Within 3 working days of approval</li>
              </ul>
            </section>

            <section>
              <h2>Common Mistakes to Avoid</h2>
              <ul>
                <li><strong>Wrong PAN type:</strong> Use the business entity PAN, not the individual PAN (except for proprietorships where they are the same)</li>
                <li><strong>Address mismatch:</strong> The address on your proof document must match the address you enter in the application</li>
                <li><strong>Blurry documents:</strong> Upload clear, readable scans. Blurry documents are the most common reason for rejection</li>
                <li><strong>Old electricity bill:</strong> The electricity bill must not be older than 2 months</li>
                <li><strong>Missing NOC:</strong> If the premises are rented, a NOC from the landlord is mandatory alongside the rent agreement</li>
                <li><strong>Wrong HSN/SAC codes:</strong> Use our <Link to="/hsn">HSN Code Finder</Link> to get the correct codes</li>
                <li><strong>Not adding all partners:</strong> All partners or directors must be listed, not just the authorized signatory</li>
              </ul>
            </section>

            <section>
              <h2>After Registration: What Next?</h2>
              <p>Once your GSTIN is issued, you need to:</p>
              <ul>
                <li>Start issuing GST-compliant invoices with your GSTIN, HSN/SAC codes, and tax breakup</li>
                <li>File GSTR-1 (outward supplies) by the 11th of the following month</li>
                <li>File GSTR-3B (summary return with tax payment) by the 20th of the following month</li>
                <li>Reconcile your purchases with GSTR-2B for accurate ITC claims</li>
                <li>Maintain proper records of all invoices and returns</li>
              </ul>
              <p>
                DoAide GST can help you with all of this. Use our free{" "}
                <Link to="/calculator">GST Calculator</Link> for tax calculations,{" "}
                <Link to="/lookup">GSTIN Lookup</Link> to verify suppliers, and{" "}
                <Link to="/due-dates">Due Dates Calendar</Link> to never miss a filing deadline.
              </p>
            </section>

            <FaqSection />

            <section className="compare-cta">
              <h2>Start Using DoAide GST After Registration</h2>
              <p>
                Once you have your GSTIN, use DoAide GST to manage your GST compliance for free.
                Calculate GST, reconcile with GSTR-2B, and prepare returns in minutes.
              </p>
              <div className="compare-cta-buttons">
                <Link to="/" className="btn btn-primary">Create Free Account</Link>
                <Link to="/calculator" className="btn compare-cta-secondary">Try GST Calculator</Link>
              </div>
            </section>

            <section className="compare-links">
              <h2>Related Guides</h2>
              <div className="compare-links-grid">
                <Link to="/guides/how-to-file-gstr-1">How to File GSTR-1</Link>
                <Link to="/guides/how-to-file-gstr-3b">How to File GSTR-3B</Link>
                <Link to="/guides">All GST Guides</Link>
                <Link to="/best-gst-software">Best GST Software India</Link>
                <Link to="/compare/cleartax">DoAide GST vs ClearTax</Link>
              </div>
            </section>
          </article>
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
