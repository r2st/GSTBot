import { useMemo } from "react";
import { TRENDING_TOOLS } from "../lib/doaideViral";

const section = {
  margin: "3rem 0 2rem",
  padding: "1.5rem",
  background: "var(--surface, #1a1a1b)",
  border: "1px solid var(--border, #2a2a2b)",
  borderRadius: "12px",
};

const heading = {
  fontSize: "1.1rem",
  fontWeight: 700,
  marginBottom: "1rem",
  color: "var(--text, #e5e5e5)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "0.75rem",
};

const card = {
  display: "block",
  padding: "0.875rem 1rem",
  background: "rgba(240, 180, 41, 0.04)",
  border: "1px solid rgba(240, 180, 41, 0.1)",
  borderRadius: "10px",
  textDecoration: "none",
  color: "var(--text, #e5e5e5)",
  transition: "border-color 0.15s, transform 0.15s",
};

const cardName = {
  fontSize: "0.9rem",
  fontWeight: 600,
};

const cardProduct = {
  fontSize: "0.72rem",
  color: "var(--text-muted, #888)",
  marginTop: "0.25rem",
};

export default function TrendingTools() {
  const shown = useMemo(() => {
    const day = new Date().getDate();
    const shuffled = [...TRENDING_TOOLS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (day + i * 7) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 6);
  }, []);

  return (
    <div style={section}>
      <div style={heading}>
        <span role="img" aria-label="fire">🔥</span> Trending on DoAide
      </div>
      <div style={grid}>
        {shown.map((tool) => (
          <a
            key={tool.url}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            style={card}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(240,180,41,0.4)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(240,180,41,0.1)"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={cardName}>
              <span style={{ marginRight: "0.4rem" }}>{tool.icon}</span>
              {tool.name}
            </div>
            <div style={cardProduct}>on DoAide {tool.product}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
