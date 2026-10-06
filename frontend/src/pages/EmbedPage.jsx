import { useState } from "react";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { copyToClipboard, widgetEmbedSnippet } from "../lib/share";
import { track } from "../lib/track";

const TOOLS = [
  { key: "calculator", label: "GST Calculator", desc: "Let visitors calculate GST on your website" },
  { key: "lookup", label: "GSTIN Lookup", desc: "Let visitors verify GSTIN numbers" },
  { key: "hsn", label: "HSN Code Finder", desc: "Let visitors search for HSN codes and GST rates" },
];

const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const RATES = [0, 5, 12, 18, 28];

export default function EmbedPage() {
  usePageTitle("Embed GST Tools on Your Website — Free Widget");
  const [tool, setTool] = useState("calculator");
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [rate, setRate] = useState(18);
  const [width, setWidth] = useState("");

  const snippet = widgetEmbedSnippet(tool, { theme, rate, width: width || undefined });

  const previewSrc = tool === "calculator"
    ? `${typeof window !== "undefined" ? window.location.origin : "https://gst.doaide.com"}/widget?theme=${theme}&rate=${rate}${width ? `&width=${width}` : ""}`
    : null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet);
    if (ok) {
      track("embed_copy", { tool, theme, rate });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container embed-container">
          <h1 className="tool-title">Embed GST Tools on Your Website</h1>
          <p className="tool-subtitle">
            Add a free GST calculator, GSTIN lookup, or HSN finder to your website with one
            line of code. No sign-up required.
          </p>

          <div className="calc-card">
            <div className="embed-tools" role="group" aria-label="Choose tool to embed">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  className={`embed-tool-btn${tool === t.key ? " active" : ""}`}
                  onClick={() => setTool(t.key)}
                >
                  <strong>{t.label}</strong>
                  <span>{t.desc}</span>
                </button>
              ))}
            </div>

            {tool === "calculator" && (
              <div className="embed-options">
                <h3 className="embed-options-heading">Customize</h3>
                <div className="embed-options-grid">
                  <label className="calc-label">
                    Theme
                    <select
                      className="calc-select"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      {THEMES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="calc-label">
                    Default GST rate
                    <select
                      className="calc-select"
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                    >
                      {RATES.map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </label>

                  <label className="calc-label">
                    Width (px)
                    <input
                      type="number"
                      className="calc-input"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="Auto (100%)"
                      min="280"
                      max="800"
                    />
                  </label>
                </div>
              </div>
            )}

            <label className="calc-label">
              Copy this code to your website
              <pre className="embed-code">{snippet}</pre>
            </label>

            <button onClick={handleCopy} className="btn btn-primary">
              {copied ? "Copied!" : "Copy embed code"}
            </button>
          </div>

          {previewSrc && (
            <div className="embed-preview-section">
              <h2 className="embed-preview-heading">Live Preview</h2>
              <div className="embed-preview-frame">
                <iframe
                  src={previewSrc}
                  width={width || "100%"}
                  height="460"
                  frameBorder="0"
                  style={{ border: "1px solid var(--line)", borderRadius: "8px", maxWidth: "100%" }}
                  title="Widget preview"
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
