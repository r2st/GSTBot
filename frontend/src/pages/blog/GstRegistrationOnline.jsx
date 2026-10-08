import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";
import SeoHead from "../../components/SeoHead";

export default function GstRegistrationOnline() {
  usePageTitle("GST Registration Online: Complete Step-by-Step Guide 2026");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Step-by-step guide to GST registration online in India 2026. Documents required, portal walkthrough, timeline, common rejection reasons, and voluntary registration benefits.";

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
        headline: "GST Registration Online: Complete Step-by-Step Guide 2026",
        description: "Step-by-step guide to GST registration online in India 2026. Documents required, portal walkthrough, timeline, and common rejection reasons.",
        url: "https://gst.doaide.com/blog/gst-registration-online-guide",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "How much does GST registration cost?", acceptedAnswer: { "@type": "Answer", text: "GST registration is completely free on the GST portal (gst.gov.in). There is no government fee. If you use a CA or tax professional, they may charge ₹1,000-3,000 for assistance." } },
          { "@type": "Question", name: "How long does GST registration take?", acceptedAnswer: { "@type": "Answer", text: "Normal processing takes 3-7 working days after submitting the application. If the officer raises a query (SCN), you get 7 days to respond, and it may take up to 30 days total." } },
          { "@type": "Question", name: "Can I cancel my GST registration?", acceptedAnswer: { "@type": "Answer", text: "Yes, apply for cancellation via Form GST REG-16 if turnover falls below the threshold or business closes. File a final return (GSTR-10) within 3 months." } },
          { "@type": "Question", name: "What is the format of a GSTIN number?", acceptedAnswer: { "@type": "Answer", text: "GSTIN is a 15-digit alphanumeric number: first 2 digits are state code, next 10 are PAN, 13th is entity number, 14th is 'Z' by default, and 15th is a check digit. Example: 27AAPFU0939F1ZV." } },
          { "@type": "Question", name: "Is GST registration mandatory for freelancers?", acceptedAnswer: { "@type": "Answer", text: "GST registration is mandatory for freelancers/service providers if annual turnover exceeds ₹20 lakhs (₹10 lakhs for NE states). Below this threshold, registration is voluntary but can help claim ITC." } },
        ],
      },
    ]);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  return (
    <article className="blog-article">
      <SeoHead title="GST Registration Online: Step-by-Step Guide 2026" description="Register for GST online in India — documents required, portal walkthrough, processing timeline, and how to avoid common rejection reasons." path="/blog/gst-registration-online-guide" />
      <h1>GST Registration Online: Complete Step-by-Step Guide 2026</h1>
      <p className="blog-meta">Updated October 2026 · 12 min read</p>

      <section>
        <h2>Who Needs GST Registration?</h2>
        <p>
          GST registration is mandatory for businesses and individuals whose aggregate turnover exceeds
          the prescribed threshold limits. The current thresholds are:
        </p>
        <ul>
          <li><strong>₹40 lakhs</strong> — for suppliers of goods (in most states)</li>
          <li><strong>₹20 lakhs</strong> — for suppliers of services (all states)</li>
          <li><strong>₹10 lakhs</strong> — for businesses in North-Eastern and special category states</li>
        </ul>
        <p>
          Regardless of turnover, registration is <strong>mandatory</strong> for:
        </p>
        <ul>
          <li>Inter-state suppliers (selling goods/services to another state)</li>
          <li>E-commerce operators and sellers on e-commerce platforms</li>
          <li>Persons liable to pay tax under reverse charge</li>
          <li>Casual taxable persons and non-resident taxable persons</li>
          <li>Input Service Distributors (ISDs)</li>
          <li>TDS/TCS deductors under GST</li>
        </ul>
        <p>
          Not sure if your turnover requires registration? Use our{" "}
          <Link to="/turnover-limit">Turnover Limit Checker</Link> to find out instantly.
        </p>
      </section>

      <section>
        <h2>Documents Required for GST Registration</h2>
        <p>Keep these documents ready before starting the application:</p>
        <ul>
          <li><strong>PAN Card</strong> — of the business entity or proprietor</li>
          <li><strong>Aadhaar Card</strong> — of the authorized signatory (for Aadhaar authentication)</li>
          <li><strong>Proof of Business Address</strong> — electricity bill, rent agreement, property tax receipt, or NOC from owner</li>
          <li><strong>Bank Account Statement</strong> — first page or cancelled cheque showing account holder name, account number, and IFSC</li>
          <li><strong>Business Registration Proof</strong> — Certificate of Incorporation (company), Partnership Deed (firm), or Shop and Establishment certificate</li>
          <li><strong>Photograph</strong> — of the proprietor/partners/directors</li>
          <li><strong>Digital Signature Certificate (DSC)</strong> — mandatory for companies and LLPs, optional for others (EVC can be used instead)</li>
          <li><strong>Authorization Letter</strong> — if the application is filed by an authorized representative</li>
        </ul>
      </section>

      <section>
        <h2>Step-by-Step GST Registration Process</h2>

        <h3>Step 1: Generate TRN (Part A)</h3>
        <p>
          Visit <strong>gst.gov.in</strong> → Services → Registration → New Registration. Enter your
          PAN, mobile number, and email address. You&apos;ll receive OTPs on both. After verification,
          you&apos;ll get a Temporary Reference Number (TRN) — save this, you&apos;ll need it to continue.
        </p>

        <h3>Step 2: Fill Application (Part B)</h3>
        <p>
          Log in with your TRN. The application has multiple tabs to fill:
        </p>
        <ol>
          <li><strong>Business Details</strong> — legal name, trade name, constitution (proprietorship/partnership/company), date of commencement</li>
          <li><strong>Promoter/Partner Details</strong> — name, DIN (for directors), address, Aadhaar, mobile, photo</li>
          <li><strong>Authorized Signatory</strong> — person authorized to file returns and sign documents</li>
          <li><strong>Principal Place of Business</strong> — address with proof documents</li>
          <li><strong>Additional Places of Business</strong> — branches, warehouses, godowns (if any)</li>
          <li><strong>Goods and Services</strong> — top 5 goods (HSN codes) and services (SAC codes) you deal in</li>
          <li><strong>Bank Account Details</strong> — can be added within 45 days of registration</li>
          <li><strong>Verification</strong> — select authorized signatory and submit via DSC or EVC</li>
        </ol>
        <p>
          Need help finding the right HSN code? Use our <Link to="/hsn-sac-finder">HSN/SAC Finder</Link>.
        </p>

        <h3>Step 3: Upload Documents</h3>
        <p>
          Upload the required documents in PDF or JPEG format. Each file must be under 1 MB. Ensure
          documents are clear, recent, and match the details entered in the application.
        </p>

        <h3>Step 4: Verification and Submission</h3>
        <p>
          Verify all details carefully — errors cause delays. Submit using:
        </p>
        <ul>
          <li><strong>DSC</strong> — Digital Signature Certificate (mandatory for companies/LLPs)</li>
          <li><strong>EVC</strong> — Electronic Verification Code sent to registered Aadhaar-linked mobile</li>
        </ul>
        <p>
          After submission, you&apos;ll receive an Application Reference Number (ARN). Track your
          application status using this ARN on the GST portal.
        </p>

        <h3>Step 5: Receive GSTIN</h3>
        <p>
          If the application is in order, the officer approves it within 3-7 working days. Your GSTIN
          (15-digit GST Identification Number) and Registration Certificate are generated and sent
          to your registered email. You can verify any GSTIN using our{" "}
          <Link to="/gstin-validator">GSTIN Validator</Link>.
        </p>
      </section>

      <section>
        <h2>Timeline for GST Registration</h2>
        <ul>
          <li><strong>Normal cases:</strong> 3-7 working days from submission</li>
          <li><strong>If query raised:</strong> officer issues SCN within 7 days → you respond within 7 days → decision within 7 days. Total: up to 30 days</li>
          <li><strong>Aadhaar authentication:</strong> if opted, biometric verification may take an additional 1-3 days</li>
          <li><strong>Deemed approval:</strong> if no action is taken within 21 days (for non-risky applicants), registration is deemed approved</li>
        </ul>
      </section>

      <section>
        <h2>Common Rejection Reasons and How to Avoid Them</h2>
        <ul>
          <li><strong>Mismatch in PAN details</strong> — ensure the name on PAN exactly matches the business registration documents</li>
          <li><strong>Insufficient address proof</strong> — electricity bill should be in the name of the business or owner; if in another name, attach an NOC</li>
          <li><strong>Blurry or expired documents</strong> — upload clear, legible scans; address proof should be recent (within 2 months)</li>
          <li><strong>Incomplete HSN/SAC codes</strong> — provide at least the top goods/services you deal in with correct codes</li>
          <li><strong>Bank details mismatch</strong> — bank account should be in the name of the registered business or proprietor</li>
          <li><strong>Aadhaar not linked to mobile</strong> — EVC requires the mobile linked to your Aadhaar; update at the nearest enrolment centre if needed</li>
        </ul>
      </section>

      <section>
        <h2>Benefits of Voluntary GST Registration</h2>
        <p>
          Even if your turnover is below the threshold, voluntary registration can be beneficial:
        </p>
        <ul>
          <li><strong>Claim Input Tax Credit (ITC)</strong> — recover GST paid on purchases against output tax</li>
          <li><strong>Sell on e-commerce platforms</strong> — Amazon, Flipkart, and Meesho require GSTIN</li>
          <li><strong>Inter-state sales</strong> — sell to customers in other states without restrictions</li>
          <li><strong>Business credibility</strong> — GSTIN adds legitimacy and trust for B2B transactions</li>
          <li><strong>Government tenders</strong> — many tenders require GST registration as eligibility criteria</li>
        </ul>
        <p>
          Use our <Link to="/calculator">GST Calculator</Link> to understand the tax impact on your products and services.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>

        <h3>How much does GST registration cost?</h3>
        <p>
          GST registration is completely free on the GST portal. There is no government fee. If you
          hire a CA or tax professional, they typically charge ₹1,000-3,000 for assistance with the
          application.
        </p>

        <h3>How long does GST registration take?</h3>
        <p>
          Normal processing takes 3-7 working days. If the officer raises a query, it can take up
          to 30 days. Deemed approval kicks in after 21 days for non-risky applicants if no action
          is taken.
        </p>

        <h3>Can I cancel my GST registration?</h3>
        <p>
          Yes, you can apply for cancellation if your turnover falls below the threshold, you close
          your business, or it&apos;s transferred. File Form GST REG-16 and submit a final return
          (GSTR-10) within 3 months of cancellation.
        </p>

        <h3>What is the format of a GSTIN number?</h3>
        <p>
          GSTIN is a 15-digit alphanumeric number: first 2 digits are state code, next 10 are PAN,
          13th is entity number, 14th is &apos;Z&apos; by default, and 15th is a check digit. Use our{" "}
          <Link to="/gstin-validator">GSTIN Validator</Link> to verify any GSTIN instantly.
        </p>

        <h3>Is GST registration mandatory for freelancers?</h3>
        <p>
          Registration is mandatory if annual turnover exceeds ₹20 lakhs (₹10 lakhs for NE states).
          Below this threshold, registration is voluntary but can help you claim ITC and work with
          larger businesses that prefer registered vendors.
        </p>
      </section>

      <section>
        <h2>Useful Tools</h2>
        <p>
          DoAide GST provides free tools to help with GST registration and compliance:
        </p>
        <ul>
          <li><Link to="/gstin-validator">GSTIN Validator</Link> — verify any GSTIN format and checksum</li>
          <li><Link to="/registration-checker">Registration Checker</Link> — check GST registration status</li>
          <li><Link to="/turnover-limit">Turnover Limit Checker</Link> — check if you need registration</li>
          <li><Link to="/calculator">GST Calculator</Link> — calculate GST on your products</li>
        </ul>
        <p>
          <Link to="/">Try DoAide GST free →</Link>
        </p>
      </section>
    </article>
  );
}
