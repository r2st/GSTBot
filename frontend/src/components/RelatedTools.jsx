import { Link } from "react-router-dom";

const ALL_TOOLS = [
  { path: "/calculator", label: "GST Calculator", desc: "Calculate CGST, SGST, IGST instantly" },
  { path: "/lookup", label: "GSTIN Verification", desc: "Verify any GST number" },
  { path: "/hsn", label: "HSN Code Search", desc: "Find HSN/SAC codes & GST rates" },
  { path: "/due-dates", label: "Due Dates Calendar", desc: "GST filing deadlines" },
  { path: "/penalty-calculator", label: "Penalty Calculator", desc: "Late filing penalties & interest" },
  { path: "/eway-bill", label: "E-Way Bill Checker", desc: "Check if e-way bill is needed" },
  { path: "/input-tax-credit", label: "ITC Eligibility", desc: "Check Input Tax Credit eligibility" },
  { path: "/composition-scheme", label: "Composition Scheme", desc: "Check eligibility & tax rates" },
  { path: "/invoice-generator", label: "Invoice Generator", desc: "Create & download GST invoices" },
  { path: "/reverse-charge", label: "Reverse Charge", desc: "Calculate RCM liability" },
  { path: "/itc-mismatch", label: "ITC Mismatch", desc: "GSTR-2A vs Books reconciliation" },
  { path: "/resources", label: "All GST Tools", desc: "Complete tools & guides hub" },
  { path: "/best-gst-software", label: "Best GST Software", desc: "Top 10 GST tools compared" },
  { path: "/guides", label: "GST Guides", desc: "Step-by-step filing tutorials" },
];

export default function RelatedTools({ current }) {
  const others = ALL_TOOLS.filter((t) => t.path !== current);

  return (
    <nav className="related-tools" aria-label="Related GST tools">
      <h2 className="related-tools-heading">More Free GST Tools</h2>
      <div className="related-tools-grid">
        {others.map((t) => (
          <Link key={t.path} to={t.path} className="related-tools-link">
            <strong>{t.label}</strong>
            <span>{t.desc}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
