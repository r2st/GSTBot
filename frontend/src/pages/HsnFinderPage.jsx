import { useState } from "react";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { categories, byCategory, searchHSN } from "../lib/hsnData";
import { copyToClipboard } from "../lib/share";

export default function HsnFinderPage() {
  usePageTitle("HSN Code Finder — Search GST Rates by Product Name");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(null);

  const results = searchHSN(query);
  const cats = categories();

  const handleCopy = async (text) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <h1 className="tool-title">HSN / SAC Code Finder</h1>
          <p className="tool-subtitle">
            Search by product name or HSN code number. Find the correct GST rate instantly.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              Search products or HSN/SAC codes
              <input
                type="search"
                className="calc-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. "laptop", "1006", "construction services"'
                autoFocus
              />
            </label>

            {query.trim() && (
              <div className="hsn-results" aria-live="polite">
                {results.length === 0 ? (
                  <p className="hsn-empty">No matching HSN/SAC codes found. Try a different search term.</p>
                ) : (
                  <table className="hsn-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Description</th>
                        <th>GST Rate</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((item) => (
                        <tr key={item.code}>
                          <td className="hsn-code">{item.code}</td>
                          <td>
                            {item.desc}
                            {item.sac && <span className="hsn-sac-badge">SAC</span>}
                          </td>
                          <td className="hsn-rate">{item.rate}%</td>
                          <td>
                            <button
                              className="hsn-copy-btn"
                              onClick={() => handleCopy(item.code)}
                              aria-label={`Copy ${item.code}`}
                            >
                              {copied === item.code ? "Copied!" : "Copy"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {!query.trim() && (
            <section className="hsn-categories">
              <h2>Browse by Category</h2>
              <div className="hsn-cat-grid">
                {cats.map((cat) => {
                  const items = byCategory(cat);
                  return (
                    <button
                      key={cat}
                      className="hsn-cat-card"
                      onClick={() => setQuery(cat)}
                    >
                      <strong>{cat}</strong>
                      <span className="hsn-cat-count">{items.length} codes</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="tool-info">
            <h2>What Are HSN and SAC Codes?</h2>
            <p>
              HSN (Harmonised System of Nomenclature) codes classify goods, while SAC (Services
              Accounting Code) codes classify services under GST. Every GST invoice must carry
              the correct HSN/SAC code — it determines the applicable tax rate.
            </p>
            <h3>HSN Reporting Requirements</h3>
            <ul>
              <li><strong>Up to ₹5 crore turnover:</strong> 4-digit HSN code on B2B invoices</li>
              <li><strong>Above ₹5 crore turnover:</strong> 6-digit HSN code on all invoices</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
