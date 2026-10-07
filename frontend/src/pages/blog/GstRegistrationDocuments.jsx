import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../hooks/usePageTitle";

export default function GstRegistrationDocuments() {
  usePageTitle("GST Registration Documents Required 2026");

  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "Complete list of documents required for GST registration in 2026. PAN, Aadhaar, address proof, bank details, and photos needed for proprietorship, partnership, and company.";

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
        headline: "GST Registration Documents Required 2026",
        description: "Complete checklist of documents needed for GST registration in India, 2026.",
        url: "https://gst.doaide.com/blog/gst-registration-documents-required-2026",
        datePublished: "2026-10-07",
        dateModified: "2026-10-07",
        publisher: { "@type": "Organization", name: "DoAide" },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          { "@type": "Question", name: "What documents are needed for GST registration?", acceptedAnswer: { "@type": "Answer", text: "PAN card, Aadhaar card, address proof of business, bank account details, photograph of promoter, and constitution documents." } },
          { "@type": "Question", name: "Is Aadhaar mandatory for GST registration?", acceptedAnswer: { "@type": "Answer", text: "Yes, Aadhaar authentication is mandatory. Without it, physical verification of business premises is required." } },
          { "@type": "Question", name: "How long does GST registration take?", acceptedAnswer: { "@type": "Answer", text: "With Aadhaar authentication: 3-7 working days. Without Aadhaar: up to 30 days due to physical verification." } },
          { "@type": "Question", name: "Can I register for GST without a physical office?", acceptedAnswer: { "@type": "Answer", text: "Yes, you can use a rented or shared office. Provide the rental agreement and an NOC from the property owner." } },
          { "@type": "Question", name: "What is the GST registration turnover limit?", acceptedAnswer: { "@type": "Answer", text: "₹40 lakh for goods, ₹20 lakh for services (₹20L/₹10L in special category states). Voluntary registration is allowed." } },
        ],
      },
    ]);
    return () => { script?.remove(); };
  }, []);

  return (
    <article className="blog-article">
      <h1>GST Registration Documents Required 2026</h1>
      <p className="blog-meta">Updated October 2026 · 8 min read</p>

      <section>
        <h2>Who Needs GST Registration?</h2>
        <p>
          GST registration is mandatory if your aggregate annual turnover exceeds ₹40 lakh for goods
          or ₹20 lakh for services (₹20 lakh and ₹10 lakh respectively in special category states).
          It is also mandatory for interstate suppliers, e-commerce sellers, TDS/TCS deductors,
          casual taxable persons, and input service distributors — regardless of turnover.
        </p>
      </section>

      <section>
        <h2>Common Documents for All Business Types</h2>
        <ol>
          <li><strong>PAN Card</strong> — of the business (for companies/LLPs) or the proprietor (for sole proprietorships)</li>
          <li><strong>Aadhaar Card</strong> — of the primary authorized signatory; required for Aadhaar authentication</li>
          <li><strong>Photograph</strong> — passport-size photo of the promoter/partners/directors (JPEG, max 100 KB)</li>
          <li><strong>Mobile Number & Email</strong> — linked to Aadhaar for OTP verification</li>
          <li><strong>Bank Account Proof</strong> — cancelled cheque, bank statement first page, or passbook first page showing account holder name, account number, and IFSC</li>
        </ol>
      </section>

      <section>
        <h2>Business Address Proof</h2>
        <p>You need proof of your principal place of business. Accepted documents depend on ownership:</p>
        <ul>
          <li><strong>Own property:</strong> Electricity bill, property tax receipt, or municipal khata copy (not older than 2 months)</li>
          <li><strong>Rented property:</strong> Rent agreement + NOC (No Objection Certificate) from the landlord</li>
          <li><strong>Shared/co-working:</strong> Consent letter from the premises owner along with their ownership proof</li>
        </ul>
      </section>

      <section>
        <h2>Documents by Business Type</h2>

        <h3>Sole Proprietorship</h3>
        <ul>
          <li>PAN and Aadhaar of the proprietor</li>
          <li>Any two: trade licence, bank statement in business name, Udyam registration, GST registration in same PAN</li>
        </ul>

        <h3>Partnership Firm</h3>
        <ul>
          <li>Partnership deed</li>
          <li>PAN of the firm and all partners</li>
          <li>Aadhaar, photo, and authorisation letter of the authorised signatory</li>
        </ul>

        <h3>LLP (Limited Liability Partnership)</h3>
        <ul>
          <li>LLP agreement</li>
          <li>Certificate of incorporation from MCA</li>
          <li>PAN of the LLP</li>
          <li>Designated partners&apos; PAN, Aadhaar, and photos</li>
        </ul>

        <h3>Private/Public Limited Company</h3>
        <ul>
          <li>Certificate of incorporation</li>
          <li>MOA (Memorandum of Association) and AOA (Articles of Association)</li>
          <li>PAN of the company</li>
          <li>Board resolution appointing the authorised signatory</li>
          <li>Directors&apos; PAN, Aadhaar, DIN, and photos</li>
        </ul>
      </section>

      <section>
        <h2>Step-by-Step Registration Process</h2>
        <ol>
          <li>Visit <strong>gst.gov.in</strong> → click <strong>Register Now</strong> under Taxpayers</li>
          <li>Fill Part A: enter PAN, mobile, and email → receive OTP on both</li>
          <li>You get a TRN (Temporary Reference Number) — use it to continue in Part B</li>
          <li>Fill Part B: business details, promoter/partner details, authorised signatory, place of business</li>
          <li>Upload all required documents (PDF/JPEG, max file sizes apply)</li>
          <li>Verify with DSC (companies/LLPs) or Aadhaar-based EVC</li>
          <li>Track your application using the ARN on the GST portal</li>
        </ol>
      </section>

      <section>
        <h2>Common Rejection Reasons</h2>
        <ul>
          <li>PAN not matching with business name or applicant details</li>
          <li>Address proof older than 2 months or name mismatch</li>
          <li>Blurred or unreadable document uploads</li>
          <li>Missing NOC for rented premises</li>
          <li>Bank account not in the name of the business/proprietor</li>
        </ul>
        <p>
          After registration, use our{" "}
          <Link to="/lookup">GSTIN Lookup tool</Link> to verify your GSTIN details are correct on the portal.
        </p>
      </section>

      <section>
        <h2>Frequently Asked Questions</h2>
        <dl className="blog-faq">
          <dt>What documents are needed for GST registration?</dt>
          <dd>PAN, Aadhaar, address proof, bank details, photograph, and business constitution documents.</dd>
          <dt>Is Aadhaar mandatory for GST registration?</dt>
          <dd>Yes, Aadhaar authentication is mandatory. Without it, physical verification is required.</dd>
          <dt>How long does GST registration take?</dt>
          <dd>3-7 working days with Aadhaar. Up to 30 days without Aadhaar (physical verification).</dd>
          <dt>Can I register without a physical office?</dt>
          <dd>Yes, provide a rental agreement and NOC from the property owner for rented/shared space.</dd>
          <dt>What is the registration turnover limit?</dt>
          <dd>₹40 lakh for goods, ₹20 lakh for services. Lower thresholds apply in special category states.</dd>
        </dl>
      </section>

      <section className="blog-cta">
        <p>
          <Link to="/">Try DoAide GST free</Link> — verify your GSTIN, calculate GST,
          and manage your returns. No credit card required.
        </p>
      </section>
    </article>
  );
}
