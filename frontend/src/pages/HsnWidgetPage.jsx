import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { searchHSN } from "../lib/hsnData";
import { track } from "../lib/track";

export default function HsnWidgetPage() {
  const [params] = useSearchParams();
  const theme = params.get("theme");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  }, [theme]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchHSN(query, { limit: 20 });
  }, [query]);

  useEffect(() => {
    if (results.length > 0) {
      track("widget_hsn_search", { query, count: results.length });
    }
  }, [results, query]);

  function handleSearch(e) {
    setQuery(e.target.value);
    setSearched(true);
  }

  return (
    <div className="widget-page">
      <div className="widget-header">
        <strong>HSN / SAC Code Finder</strong>
      </div>

      <div className="widget-body">
        <label className="calc-label">
          Search product or service
          <input
            type="text"
            className="calc-input"
            value={query}
            onChange={handleSearch}
            placeholder="e.g. rice, laptop, accounting"
            autoComplete="off"
          />
        </label>

        {results.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: ".5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8125rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-border, rgba(255,255,255,.08))" }}>
                  <th style={{ textAlign: "left", padding: ".375rem .5rem", fontWeight: 600 }}>Code</th>
                  <th style={{ textAlign: "left", padding: ".375rem .5rem", fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: "right", padding: ".375rem .5rem", fontWeight: 600 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.code + item.desc} style={{ borderBottom: "1px solid var(--c-border, rgba(255,255,255,.04))" }}>
                    <td style={{ padding: ".375rem .5rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>{item.code}</td>
                    <td style={{ padding: ".375rem .5rem", lineHeight: 1.3 }}>{item.desc}</td>
                    <td style={{ padding: ".375rem .5rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{item.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {searched && query.trim() && results.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--c-text-muted, #888)", padding: "1rem 0", fontSize: ".875rem" }}>
            No HSN/SAC codes found for &ldquo;{query}&rdquo;
          </p>
        )}
      </div>

      <a
        className="widget-powered"
        href="https://gst.doaide.com/hsn?ref=widget"
        target="_blank"
        rel="noopener noreferrer"
      >
        Powered by <strong>DoAide GST</strong> — Try all our free tools
      </a>
    </div>
  );
}
