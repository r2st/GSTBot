const DOAIDE_TOOLS = [
  {
    icon: "\u{1F9FE}",
    name: "Invoicer",
    url: "https://invoicer.doaide.com",
    desc: "Create GST invoices in seconds",
  },
  {
    icon: "\u{1F4DD}",
    name: "Contracts",
    url: "https://contracts.doaide.com",
    desc: "Draft & manage business contracts",
  },
  {
    icon: "✅",
    name: "Comply",
    url: "https://comply.doaide.com",
    desc: "Track all compliance deadlines",
  },
  {
    icon: "\u{1F4B0}",
    name: "Salary",
    url: "https://salary.doaide.com",
    desc: "Payroll & salary slip generation",
  },
  {
    icon: "\u{1F522}",
    name: "Calculator",
    url: "https://fincalc.doaide.com",
    desc: "Financial calculators & tools",
  },
];

export default function DoAideFooter() {
  return (
    <footer className="doaide-footer" aria-label="More free tools from DoAide">
      <div className="doaide-footer-inner">
        <p className="doaide-footer-heading">More free tools from DoAide</p>
        <div className="doaide-footer-grid">
          {DOAIDE_TOOLS.map((tool) => (
            <a
              key={tool.url}
              href={tool.url}
              className="doaide-footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="doaide-footer-icon">{tool.icon}</span>
              <span>
                <strong>{tool.name}</strong>
                <span>{tool.desc}</span>
              </span>
            </a>
          ))}
        </div>
        <p className="doaide-footer-viewall">
          <a href="https://doaide.com" target="_blank" rel="noopener noreferrer">
            View all 40+ tools &rarr;
          </a>
        </p>
      </div>
    </footer>
  );
}
