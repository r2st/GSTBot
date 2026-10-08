const STORAGE_KEY = 'doaide_recent_tools';

export function trackToolVisit(name, path) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const filtered = stored.filter(t => t.path !== path);
    filtered.unshift({ name, path, ts: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch {}
}

export function getRecentTools(max = 5) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').slice(0, max);
  } catch {
    return [];
  }
}

export function getDailyCount(toolName) {
  const today = new Date().toISOString().slice(0, 10);
  const hash = [...(today + toolName)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return 500 + (hash % 2000);
}

export function getDailyRating(toolName) {
  const today = new Date().toISOString().slice(0, 10);
  const hash = [...(today + toolName + 'rating')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (4.6 + (hash % 4) * 0.1).toFixed(1);
}

export function getRatingCount(toolName) {
  const today = new Date().toISOString().slice(0, 10);
  const hash = [...(today + toolName + 'rcount')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return 200 + (hash % 800);
}

export const TOOL_MAP = {
  '/calculator': 'GST Calculator',
  '/penalty-calculator': 'Penalty Calculator',
  '/late-fee-calculator': 'Late Fee Calculator',
  '/interest-calculator': 'Interest Calculator',
  '/itc-calculator': 'ITC Calculator',
  '/rcm-calculator': 'RCM Calculator',
  '/lookup': 'GSTIN Lookup',
  '/hsn': 'HSN Code Finder',
  '/hsn-sac-finder': 'HSN/SAC Finder',
  '/gstin-validator': 'GSTIN Validator',
  '/registration-checker': 'Registration Checker',
  '/input-tax-credit': 'ITC Eligibility',
  '/eway-bill': 'E-Way Bill Checker',
  '/reverse-charge': 'Reverse Charge',
  '/itc-mismatch': 'ITC Mismatch',
  '/audit-checklist': 'Audit Checklist',
  '/gstr9-checklist': 'GSTR-9 Checklist',
  '/composition-scheme': 'Composition Scheme',
  '/scheme-comparison': 'Scheme Comparison',
  '/due-dates': 'Due Dates Calendar',
  '/return-calendar': 'Return Calendar',
  '/invoice-generator': 'Invoice Generator',
  '/payment-challan': 'Payment Challan',
  '/registration-type-advisor': 'Registration Advisor',
  '/turnover-limit': 'Turnover Limit',
  '/rate-comparison': 'GST 2.0 Rates',
  '/migration-checker': 'Migration Checker',
  '/insurance-savings': 'Insurance Savings',
};

export const TRENDING_TOOLS = [
  { name: 'Income Tax Calculator', url: 'https://tax.doaide.com/income-tax-calculator', product: 'TaxFile', icon: '🧮' },
  { name: 'Premium Calculator', url: 'https://insurekit.doaide.com/premium-calculator', product: 'InsureKit', icon: '₹' },
  { name: 'Resume Builder', url: 'https://resume.doaide.com', product: 'Resume', icon: '📝' },
  { name: 'Rent Receipt', url: 'https://docs.doaide.com/rent-receipt-generator', product: 'Docs', icon: '🏠' },
  { name: 'SIP Calculator', url: 'https://tax.doaide.com/sip-calculator', product: 'TaxFile', icon: '📈' },
  { name: 'Salary Slip', url: 'https://docs.doaide.com/salary-slip-generator', product: 'Docs', icon: '💰' },
  { name: 'EMI Calculator', url: 'https://tax.doaide.com/emi-calculator', product: 'TaxFile', icon: '🏠' },
  { name: 'Cover Letter', url: 'https://resume.doaide.com/cover-letter-generator', product: 'Resume', icon: '✉️' },
  { name: 'Plan Comparison', url: 'https://insurekit.doaide.com/compare-plans', product: 'InsureKit', icon: '⚖️' },
  { name: 'Invoice Generator', url: 'https://docs.doaide.com/invoice-generator', product: 'Docs', icon: '🧾' },
];
