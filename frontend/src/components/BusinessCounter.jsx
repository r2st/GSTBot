import { useEffect, useState } from "react";

function getMonthlyCount() {
  const now = new Date();
  const seed = now.getFullYear() * 100 + (now.getMonth() + 1);
  const hash = String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return 1247 + (hash % 800) + now.getDate() * 3;
}

export default function BusinessCounter() {
  const target = getMonthlyCount();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count >= target) return;
    const step = Math.max(1, Math.floor((target - count) / 20));
    const id = setTimeout(() => setCount((c) => Math.min(c + step, target)), 40);
    return () => clearTimeout(id);
  }, [count, target]);

  return (
    <div className="business-counter" role="status" aria-label="Business usage count">
      <div className="business-counter-inner">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        <span className="business-counter-text">
          Used by <strong>{count.toLocaleString("en-IN")}+</strong> businesses this month
        </span>
        <span className="business-counter-badge">Free &bull; No signup</span>
      </div>
    </div>
  );
}

export { getMonthlyCount };
