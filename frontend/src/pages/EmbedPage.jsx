import { useState } from "react";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { copyToClipboard, embedSnippet } from "../lib/share";

const TOOLS = [
  { key: "calculator", label: "GST Calculator", desc: "Let visitors calculate GST on your website" },
  { key: "lookup", label: "GSTIN Lookup", desc: "Let visitors verify GSTIN numbers" },
  { key: "hsn", label: "HSN Code Finder", desc: "Let visitors search for HSN codes and GST rates" },
];

export default function EmbedPage() {
  usePageTitle("Embed GST Tools on Your Website — Free Widget");
  const [tool, setTool] = useState("calculator");
  const [copied, setCopied] = useState(false);

  const snippet = embedSnippet(tool);

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
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

            <label className="calc-label">
              Copy this code to your website
              <pre className="embed-code">{snippet}</pre>
            </label>

            <button onClick={handleCopy} className="btn btn-primary">
              {copied ? "Copied!" : "Copy embed code"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
