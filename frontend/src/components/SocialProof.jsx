import { useMemo } from "react";

export default function SocialProof({ toolName = "this tool" }) {
  const count = useMemo(() => {
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const hash = toolName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return 1200 + ((seed * hash) % 3800);
  }, [toolName]);

  return (
    <div className="social-proof no-print">
      <span className="social-proof-counter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        {count.toLocaleString("en-IN")} people used {toolName} today
      </span>
      <span className="social-proof-badges">
        Free forever &bull; No login required &bull; Made in India &#127470;&#127475;
      </span>
    </div>
  );
}
