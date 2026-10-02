import { useNavigate } from "react-router-dom";
import { usePageTitle } from "../hooks/usePageTitle";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "Invoice ingestion",
    desc: "Upload invoices in any format. AI extracts every field — GSTIN, amounts, tax splits — so you don't type them twice.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "GSTR-2B reconciliation",
    desc: "Match your purchase register against the government's 2B data. Mismatches surface before the return is due.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
    title: "ITC tracking",
    desc: "See exactly how much input tax credit you can claim, broken down by eligible, ineligible, and at-risk amounts.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: "Deadline alerts",
    desc: "Never miss a filing window. Alerts fire before each due date, and escalate when the deadline is close.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    title: "Filing preparation",
    desc: "GSTR-1 and GSTR-3B assembled from your data, reviewed for errors, and ready to file on the portal.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="landing-feature-icon">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: "Multi-business",
    desc: "CAs and accountants switch between client books without logging out. Each business stays isolated.",
  },
];

export default function LandingPage() {
  usePageTitle("GST compliance on autopilot");
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />

      <header className="landing-header">
        <div className="landing-brand">
          <svg viewBox="0 0 400 320" className="landing-robot" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F0B429" /><stop offset="100%" stopColor="#D4A017" /></linearGradient></defs>
            <line x1="200" y1="45" x2="200" y2="20" stroke="#F0B429" strokeWidth="6" strokeLinecap="round" />
            <circle cx="200" cy="14" r="10" fill="#F0B429" /><circle cx="200" cy="14" r="5" fill="#F7CC5F" />
            <rect x="110" y="50" width="180" height="140" rx="35" fill="url(#lg)" />
            <rect x="130" y="68" width="140" height="105" rx="25" fill="#D4A017" opacity="0.4" />
            <ellipse cx="165" cy="115" rx="18" ry="20" fill="#0A0A0B" /><ellipse cx="235" cy="115" rx="18" ry="20" fill="#0A0A0B" />
            <circle cx="170" cy="113" r="8" fill="#F7CC5F" /><circle cx="240" cy="113" r="8" fill="#F7CC5F" />
            <circle cx="174" cy="109" r="3" fill="white" opacity="0.7" /><circle cx="244" cy="109" r="3" fill="white" opacity="0.7" />
            <path d="M170 155Q200 178 230 155" stroke="#0A0A0B" strokeWidth="4" fill="none" strokeLinecap="round" />
            <rect x="92" y="95" width="22" height="45" rx="8" fill="#D4A017" /><rect x="286" y="95" width="22" height="45" rx="8" fill="#D4A017" />
            <rect x="175" y="190" width="50" height="14" rx="5" fill="#D4A017" />
            <rect x="145" y="204" width="110" height="55" rx="18" fill="url(#lg)" />
            <circle cx="200" cy="228" r="7" fill="#0A0A0B" /><circle cx="200" cy="228" r="3.5" fill="#0A0A0B" />
            <path d="M145 218Q118 223 113 240Q108 257 120 262" stroke="#D4A017" strokeWidth="9" fill="none" strokeLinecap="round" /><circle cx="120" cy="265" r="7" fill="#D4A017" />
            <path d="M255 218Q282 223 287 240Q292 257 280 262" stroke="#D4A017" strokeWidth="9" fill="none" strokeLinecap="round" /><circle cx="280" cy="265" r="7" fill="#D4A017" />
          </svg>
          <span className="landing-brand-text">
            DoAide <span className="landing-brand-accent">GST</span>
          </span>
        </div>
        <div className="landing-header-actions">
          <button className="landing-btn-ghost" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <h1 className="landing-h1">
          <span className="landing-h1-line">GST compliance,</span>
          <span className="landing-h1-line landing-h1-accent">on autopilot.</span>
        </h1>
        <p className="landing-lead">
          Upload invoices, reconcile against GSTR-2B, track ITC, and prepare
          filings — all from one place. Built for Indian SMBs and their
          accountants.
        </p>
        <div className="landing-cta">
          <button className="landing-btn-primary" onClick={() => navigate("/login", { state: { mode: "register" } })}>
            Get started free
          </button>
          <button className="landing-btn-outline" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </div>
      </section>

      <section className="landing-features" aria-label="Features">
        <h2 className="landing-section-title">Everything you need for GST</h2>
        <div className="landing-feature-grid">
          {FEATURES.map((f) => (
            <div className="landing-feature-card" key={f.title}>
              <div className="landing-feature-icon-wrap">{f.icon}</div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-bottom-cta">
        <h2 className="landing-bottom-heading">
          Stop chasing spreadsheets.
        </h2>
        <p className="landing-bottom-sub">
          Create a free account and file your first return in minutes.
        </p>
        <button className="landing-btn-primary" onClick={() => navigate("/login", { state: { mode: "register" } })}>
          Get started free
        </button>
      </section>

      <footer className="landing-footer">
        <span className="landing-footer-text">
          DoAide GST by Apprend Technologies
        </span>
      </footer>
    </div>
  );
}
