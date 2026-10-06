const CROSS_LINKS = {
  calculator: [
    {
      href: "https://invoice.doaide.com",
      label: "Free Invoice Generator",
      text: "Need to generate a GST invoice? Try our free Invoice Generator",
    },
    {
      href: "https://fincalc.doaide.com",
      label: "Financial Calculators",
      text: "Explore more financial calculators — EMI, SIP, FD & more",
    },
  ],
  gstin: [
    {
      href: "https://comply.doaide.com",
      label: "Compliance Tracker",
      text: "Track your GST compliance status with automated deadline alerts",
    },
    {
      href: "https://contracts.doaide.com",
      label: "Contract Generator",
      text: "Generate vendor & supplier contracts with built-in GST clauses",
    },
  ],
  "due-dates": [
    {
      href: "https://comply.doaide.com",
      label: "Compliance Tracker",
      text: "Never miss a deadline — set up automated compliance reminders",
    },
    {
      href: "https://invoice.doaide.com",
      label: "Invoice Generator",
      text: "Generate GST-compliant invoices before your filing deadline",
    },
  ],
  hsn: [
    {
      href: "/calculator",
      label: "GST Calculator",
      text: "Calculate GST for this product — get instant CGST, SGST, IGST breakdown",
      internal: true,
    },
    {
      href: "https://invoice.doaide.com",
      label: "Invoice Generator",
      text: "Create invoices with the correct HSN code and GST rate applied",
    },
  ],
  lookup: [
    {
      href: "https://comply.doaide.com",
      label: "Compliance Tracker",
      text: "Monitor GST compliance status for all your suppliers",
    },
    {
      href: "https://contracts.doaide.com",
      label: "Contract Generator",
      text: "Draft vendor agreements with verified GSTIN details",
    },
  ],
};

export default function CrossProductLinks({ page }) {
  const links = CROSS_LINKS[page];
  if (!links) return null;

  return (
    <aside className="cross-product-links" aria-label="Explore more DoAide tools">
      <h3 className="cross-product-heading">Explore More Tools</h3>
      <div className="cross-product-grid">
        {links.map((link) =>
          link.internal ? (
            <a key={link.href} href={link.href} className="cross-product-card">
              <strong>{link.label}</strong>
              <span>{link.text}</span>
            </a>
          ) : (
            <a
              key={link.href}
              href={link.href}
              className="cross-product-card"
              target="_blank"
              rel="noopener noreferrer"
            >
              <strong>{link.label}</strong>
              <span>{link.text}</span>
              <span className="cross-product-external" aria-hidden="true">↗</span>
            </a>
          )
        )}
      </div>
    </aside>
  );
}
