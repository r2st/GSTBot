import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthForm from "../components/AuthForm";
import { usePageTitle } from "../hooks/usePageTitle";
import { copyToClipboard, fullUrl } from "../lib/share";
import { track } from "../lib/track";

const DOAIDE_PRODUCTS = [
  { name: "Desk", url: "https://desk.doaide.com" },
  { name: "Jobs", url: "https://job.doaide.com" },
  { name: "409A", url: "https://409a.doaide.com" },
  { name: "GST", url: "https://gst.doaide.com" },
  { name: "Pulse", url: "https://pulse.doaide.com" },
  { name: "Med", url: "https://med.doaide.com" },
  { name: "Realty", url: "https://realty.doaide.com" },
  { name: "Reach", url: "https://reach.doaide.com" },
  { name: "Trade", url: "https://trade.doaide.com" },
];

const TYPEWRITER_PHRASES = [
  "Free GST return filing online",
  "Automated GSTR-2B reconciliation",
  "Never miss a filing deadline",
  "ITC calculated in seconds",
];

function RobotFace({ size = 32, color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <line x1="16" y1="6" x2="16" y2="2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="1.5" r="1.5" fill={color} />
      <rect x="5" y="6" width="22" height="17" rx="5" fill={color} />
      <ellipse cx="11" cy="13" rx="2.5" ry="3" fill="#0A0A0B" />
      <ellipse cx="21" cy="13" rx="2.5" ry="3" fill="#0A0A0B" />
      <circle cx="11.5" cy="12.5" r="1" fill={color} opacity="0.6" />
      <circle cx="21.5" cy="12.5" r="1" fill={color} opacity="0.6" />
      <path d="M12 19Q16 22 20 19" stroke="#0A0A0B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <rect x="1" y="10" width="4" height="5" rx="2" fill={color} opacity="0.8" />
      <rect x="27" y="10" width="4" height="5" rx="2" fill={color} opacity="0.8" />
    </svg>
  );
}

function HeroRobot({ color }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" width="120" height="100" className="landing-hero-robot" aria-hidden="true">
      <line x1="60" y1="18" x2="60" y2="6" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="4" r="3" fill={color} className="landing-antenna-glow" />
      <rect x="25" y="18" width="70" height="55" rx="16" fill={color} />
      <ellipse cx="42" cy="40" rx="8" ry="10" fill="#0A0A0B" />
      <ellipse cx="78" cy="40" rx="8" ry="10" fill="#0A0A0B" />
      <circle cx="44" cy="38" r="3" fill={color} opacity="0.5" />
      <circle cx="80" cy="38" r="3" fill={color} opacity="0.5" />
      <path d="M45 60 Q60 72 75 60" stroke="#0A0A0B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="5" y="30" width="16" height="18" rx="6" fill={color} opacity="0.8" />
      <rect x="99" y="30" width="16" height="18" rx="6" fill={color} opacity="0.8" />
    </svg>
  );
}

function Typewriter({ phrases }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[index];
    let timeout;

    if (!deleting && text === phrase) {
      timeout = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % phrases.length);
    } else {
      const speed = deleting ? 30 : 60;
      timeout = setTimeout(() => {
        setText(deleting ? phrase.slice(0, text.length - 1) : phrase.slice(0, text.length + 1));
      }, speed);
    }

    return () => clearTimeout(timeout);
  }, [text, deleting, index, phrases]);

  return (
    <span className="landing-typewriter" aria-label={phrases[index]}>
      {text}
      <span className="landing-cursor" aria-hidden="true">|</span>
    </span>
  );
}

function PipelineGraphic() {
  return (
    <div className="landing-pipeline" aria-hidden="true">
      <svg viewBox="0 0 520 90" xmlns="http://www.w3.org/2000/svg">
        {/* Connecting lines */}
        <line x1="78" y1="36" x2="152" y2="36" stroke="rgba(240,180,41,0.2)" strokeWidth="2" />
        <line x1="218" y1="36" x2="302" y2="36" stroke="rgba(240,180,41,0.2)" strokeWidth="2" />
        <line x1="368" y1="36" x2="442" y2="36" stroke="rgba(240,180,41,0.2)" strokeWidth="2" />

        {/* Flowing particles along lines */}
        <circle r="3" fill="#F0B429" opacity="0.8">
          <animateMotion dur="2s" repeatCount="indefinite" path="M78,36 L152,36" />
        </circle>
        <circle r="2" fill="#F7CC5F" opacity="0.5">
          <animateMotion dur="2s" repeatCount="indefinite" begin="0.5s" path="M78,36 L152,36" />
        </circle>
        <circle r="3" fill="#F0B429" opacity="0.8">
          <animateMotion dur="2s" repeatCount="indefinite" begin="0.7s" path="M218,36 L302,36" />
        </circle>
        <circle r="2" fill="#F7CC5F" opacity="0.5">
          <animateMotion dur="2s" repeatCount="indefinite" begin="1.2s" path="M218,36 L302,36" />
        </circle>
        <circle r="3" fill="#F0B429" opacity="0.8">
          <animateMotion dur="2s" repeatCount="indefinite" begin="1.4s" path="M368,36 L442,36" />
        </circle>
        <circle r="2" fill="#F7CC5F" opacity="0.5">
          <animateMotion dur="2s" repeatCount="indefinite" begin="1.9s" path="M368,36 L442,36" />
        </circle>

        {/* Stage 1: Upload */}
        <circle cx="50" cy="36" r="28" fill="rgba(240,180,41,0.06)" stroke="rgba(240,180,41,0.25)" strokeWidth="1.5" />
        <path d="M44 42V30h8l4 4v8H44z" fill="none" stroke="#F0B429" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M52 30v4h4" fill="none" stroke="#F0B429" strokeWidth="1.3" strokeLinejoin="round" />
        <line x1="50" y1="40" x2="50" y2="35" stroke="#F0B429" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M47 37l3-3 3 3" fill="none" stroke="#F0B429" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="50" y="78" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="'IBM Plex Mono',monospace">Upload</text>

        {/* Stage 2: Match */}
        <circle cx="190" cy="36" r="28" fill="rgba(240,180,41,0.06)" stroke="rgba(240,180,41,0.25)" strokeWidth="1.5" />
        <rect x="179" y="26" width="10" height="13" rx="1.5" fill="none" stroke="#F0B429" strokeWidth="1.3" />
        <rect x="185" y="30" width="10" height="13" rx="1.5" fill="none" stroke="#F0B429" strokeWidth="1.3" />
        <circle cx="196" cy="42" r="4" fill="none" stroke="#F0B429" strokeWidth="1.3" />
        <line x1="199" y1="45" x2="202" y2="48" stroke="#F0B429" strokeWidth="1.3" strokeLinecap="round" />
        <text x="190" y="78" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="'IBM Plex Mono',monospace">Match</text>

        {/* Stage 3: Reconcile */}
        <circle cx="330" cy="36" r="28" fill="rgba(240,180,41,0.06)" stroke="rgba(240,180,41,0.25)" strokeWidth="1.5" />
        <circle cx="330" cy="35" r="10" fill="none" stroke="#F0B429" strokeWidth="1.3" />
        <path d="M325 35l3 4 7-9" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="330" y="78" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="'IBM Plex Mono',monospace">Reconcile</text>

        {/* Stage 4: File */}
        <circle cx="470" cy="36" r="28" fill="rgba(240,180,41,0.06)" stroke="rgba(240,180,41,0.25)" strokeWidth="1.5" />
        <path d="M462 42V28h10l4 4v10H462z" fill="none" stroke="#F0B429" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M472 28v4h4" fill="none" stroke="#F0B429" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M465 35h8M465 38h5" stroke="#F0B429" strokeWidth="1" strokeLinecap="round" />
        <circle cx="473" cy="44" r="3.5" fill="none" stroke="#F0B429" strokeWidth="1.2" />
        <path d="M471 44l1.5 1.5 3-3" fill="none" stroke="#F0B429" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <text x="470" y="78" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontFamily="'IBM Plex Mono',monospace">File</text>
      </svg>
    </div>
  );
}

const PARTICLES = [
  { left: "8%", top: "15%", size: 3, delay: 0, dur: 18 },
  { left: "22%", top: "65%", size: 2, delay: 3, dur: 22 },
  { left: "35%", top: "30%", size: 4, delay: 7, dur: 15 },
  { left: "50%", top: "80%", size: 2, delay: 1, dur: 20 },
  { left: "65%", top: "20%", size: 3, delay: 5, dur: 17 },
  { left: "78%", top: "55%", size: 2, delay: 9, dur: 23 },
  { left: "90%", top: "35%", size: 3, delay: 2, dur: 19 },
  { left: "15%", top: "85%", size: 2, delay: 6, dur: 21 },
  { left: "42%", top: "45%", size: 3, delay: 4, dur: 16 },
  { left: "72%", top: "75%", size: 2, delay: 8, dur: 24 },
  { left: "88%", top: "10%", size: 4, delay: 10, dur: 14 },
  { left: "5%", top: "50%", size: 2, delay: 11, dur: 25 },
];

function ParticleField() {
  return (
    <div className="landing-particles" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="landing-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

const FEATURES = [
  {
    title: "GSTR-2B Reconciliation",
    desc: "Auto-match your purchase invoices against the GSTR-2B statement. Flag mismatches instantly.",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="8" height="10" rx="1.5" />
        <rect x="8" y="7" width="8" height="10" rx="1.5" />
        <circle cx="19" cy="17" r="3.5" />
        <line x1="21.5" y1="19.5" x2="23" y2="21" />
      </svg>
    ),
  },
  {
    title: "ITC Calculator",
    desc: "Calculate eligible Input Tax Credit automatically. Exclude blocked credits under Section 17(5).",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="12" y2="14" />
        <path d="M14 16l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "GST Return Filing",
    desc: "Prepare GSTR-1 and GSTR-3B returns in minutes. Export-ready for the GST portal.",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    title: "Deadline Alerts",
    desc: "Never miss a filing deadline. Get notified before GSTR-1 and GSTR-3B due dates.",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 106 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    title: "Supplier Tracking",
    desc: "Monitor supplier compliance scores. Know which suppliers file on time and which put your ITC at risk.",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: "AI Invoice Parsing",
    desc: "Upload invoices in any format. AI extracts GSTIN, amounts, HSN codes, and tax breakup automatically.",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Upload invoices", desc: "Upload your sales and purchase invoices in any format — PDF, Excel, or structured data — or enter them manually." },
  { step: "2", title: "Auto-reconcile", desc: "DoAide matches your invoices against GSTR-2B, flags mismatches, and calculates eligible ITC." },
  { step: "3", title: "File returns", desc: "Download your prepared GSTR-1 and GSTR-3B, ready to submit on the GST portal." },
];

const TESTIMONIALS = [
  { name: "Priya S.", role: "CA, Mumbai", quote: "DoAide GST cut our reconciliation time from 2 days to 20 minutes. The GSTR-2B matching is spot-on." },
  { name: "Rahul M.", role: "Founder, textile exports", quote: "We were missing ITC on mismatched invoices every month. DoAide caught them all in the first run." },
  { name: "Anita K.", role: "Accountant, retail chain", quote: "The free plan handles our monthly volume perfectly. Filing GSTR-3B used to be stressful — now it takes minutes." },
];

const FAQ_ITEMS = [
  {
    q: "What is GST and who needs to file GST returns?",
    a: "GST is India’s indirect tax on goods and services. Every registered business must file GSTR-1 and GSTR-3B. Registration is mandatory above ₹40 lakhs turnover for goods.",
  },
  {
    q: "How does GSTR-2B reconciliation work?",
    a: "GSTR-2B lists your eligible ITC based on suppliers’ filings. Reconciliation matches your purchase invoices against it. DoAide automates this so you claim the right amount.",
  },
  {
    q: "What is Input Tax Credit (ITC) and how is it calculated?",
    a: "ITC lets you offset tax paid on purchases against your output liability. DoAide reconciles invoices with GSTR-2B and excludes blocked credits to calculate your eligible ITC.",
  },
  {
    q: "Is DoAide GST really free?",
    a: "Yes. All features are included free for up to 50 invoices per month — no credit card required. Paid plans start at ₹499/month for higher volumes.",
  },
  {
    q: "What are HSN codes and why do they matter for GST?",
    a: "HSN codes classify goods for tax purposes and determine the GST rate. Wrong codes cause tax and ITC mismatches. DoAide validates HSN codes on your invoices automatically.",
  },
  {
    q: "What happens if I miss a GST filing deadline?",
    a: "Late filing attracts ₹50/day penalty (capped at ₹5,000) plus 18% interest on unpaid tax. DoAide sends alerts before each deadline so you never miss one.",
  },
  {
    q: "Can DoAide GST help with GST compliance for small businesses?",
    a: "Yes. DoAide handles invoices, GSTR-2B reconciliation, ITC calculation, and return prep — built for Indian SMBs. The free plan covers most small businesses.",
  },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section className="landing-faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="landing-section-title">Frequently Asked Questions</h2>
      <dl className="landing-faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="landing-faq-item">
            <dt>
              <button
                className="landing-faq-q"
                aria-expanded={openIndex === i}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {item.q}
                <span className="landing-faq-chevron" aria-hidden="true">{openIndex === i ? "−" : "+"}</span>
              </button>
            </dt>
            {openIndex === i && <dd className="landing-faq-a">{item.a}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

const INSTANT_TOOLS = [
  {
    to: "/calculator",
    title: "GST Calculator",
    desc: "Calculate CGST, SGST, IGST breakdown instantly",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="10" y2="14" /><line x1="14" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="16" y2="18" />
      </svg>
    ),
  },
  {
    to: "/lookup",
    title: "GSTIN Lookup",
    desc: "Verify any GST number — check validity & state",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    to: "/hsn",
    title: "HSN Code Finder",
    desc: "Search HSN/SAC codes & GST rates by product name",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    to: "/due-dates",
    title: "Due Dates Calendar",
    desc: "Never miss a GST filing deadline — full calendar",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
];

function InstantLookup() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;
    if (/^\d{2}[A-Z]{5}\d{4}[A-Z]\w/.test(q)) {
      navigate(`/gstin/${q}`);
    } else {
      navigate(`/lookup?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <section className="landing-instant">
      <form onSubmit={handleSubmit} className="landing-search-box">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter any GSTIN to verify instantly — no sign-up needed"
          className="landing-search-input"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary landing-search-btn">
          Verify
        </button>
      </form>
      <div className="landing-trust-bar">
        <div className="landing-trust-item">
          <strong>12,000+</strong>
          <span>Businesses</span>
        </div>
        <div className="landing-trust-sep" aria-hidden="true" />
        <div className="landing-trust-item">
          <strong>50,000+</strong>
          <span>Invoices processed</span>
        </div>
        <div className="landing-trust-sep" aria-hidden="true" />
        <div className="landing-trust-item">
          <strong>100%</strong>
          <span>Free to start</span>
        </div>
      </div>
      <div className="landing-tool-cards">
        {INSTANT_TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="landing-tool-card">
            <div className="landing-tool-icon">{t.icon}</div>
            <strong>{t.title}</strong>
            <span>{t.desc}</span>
            <span className="landing-tool-free">No signup needed</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ReferralBanner() {
  const [copied, setCopied] = useState(false);
  const url = fullUrl("/?ref=invite");
  const handleCopy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <section className="landing-referral">
      <h2>Invite Your CA or Accountant</h2>
      <p>Share DoAide GST with your chartered accountant — they can manage all your GST filings in one place.</p>
      <div className="landing-referral-actions">
        <a
          href={`https://wa.me/?text=${encodeURIComponent("Check out DoAide GST — free GST compliance tool for Indian businesses: " + url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Share on WhatsApp
        </a>
        <button onClick={handleCopy} className="btn landing-copy-btn">
          {copied ? "Link copied!" : "Copy invite link"}
        </button>
      </div>
    </section>
  );
}

export default function LandingPage() {
  usePageTitle("Free GST Calculator India | GSTIN Verification & HSN Code Search");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const vis = visible ? "landing-visible" : "";

  return (
    <div className="landing-root">
      <ParticleField />

      <header className={`landing-header ${vis}`}>
        <a href="https://doaide.com" className="landing-brand">
          <RobotFace size={28} color="#F0B429" />
          <span className="landing-brand-text">
            DoAide <em>GST</em>
          </span>
        </a>
      </header>

      <main>
        <InstantLookup />

        <div className={`landing-split ${vis}`}>
          <div className="landing-left">
            <div className="landing-hero-robot-wrap">
              <HeroRobot color="#F0B429" />
            </div>
            <h1 className="landing-headline">Free GST Calculator, GSTIN Verification &amp; HSN Code Search for India</h1>
            <p className="landing-subtitle">
              Calculate GST instantly, verify any GSTIN number, search HSN codes &amp; rates,
              and auto-reconcile with GSTR-2B — GSTR-1 and GSTR-3B returns prepared in
              minutes. The free GST compliance tool for Indian businesses.
            </p>
            <div className="landing-typewriter-wrap">
              <Typewriter phrases={TYPEWRITER_PHRASES} />
            </div>
            <PipelineGraphic />
            <div className="landing-features">
              <div className="landing-feature">
                <strong>Free forever</strong>
                <span>50 invoices/month, full GST compliance</span>
              </div>
              <div className="landing-feature">
                <strong>From ₹499/mo</strong>
                <span>500+ invoices, priority support</span>
              </div>
            </div>
            <Link to="/pricing" className="landing-pricing-link">View all plans →</Link>
          </div>

          <div className="landing-right">
            <AuthForm />
          </div>
        </div>

        <section className="landing-section" aria-labelledby="features-heading">
          <h2 id="features-heading" className="landing-section-title">Everything You Need for GST Compliance</h2>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="landing-section-title">How It Works</h2>
          <div className="landing-steps">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="landing-step">
                <div className="landing-step-num">{s.step}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="testimonials-heading">
          <h2 id="testimonials-heading" className="landing-section-title">Trusted by Indian Businesses</h2>
          <div className="landing-testimonials">
            {TESTIMONIALS.map((t) => (
              <blockquote key={t.name} className="landing-testimonial">
                <p>&ldquo;{t.quote}&rdquo;</p>
                <footer>
                  <strong>{t.name}</strong>
                  <span>{t.role}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <FaqSection />

        <ReferralBanner />

        <section className="landing-cta">
          <h2>Start Filing GST Returns in Minutes</h2>
          <p>Free forever for up to 50 invoices/month. No credit card required.</p>
          <div className="landing-cta-actions">
            <a href="#root" className="btn btn-primary landing-cta-btn" onClick={(e) => { e.preventDefault(); track("signup_click"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Create Free Account
            </a>
            <Link to="/calculator" className="btn landing-cta-secondary">
              Try GST Calculator →
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-nav">
          <div className="landing-footer-col">
            <h4>Free Tools</h4>
            <Link to="/calculator">GST Calculator</Link>
            <Link to="/lookup">GSTIN Lookup</Link>
            <Link to="/hsn">HSN Code Finder</Link>
            <Link to="/due-dates">Due Dates Calendar</Link>
            <Link to="/embed">Embed Widget</Link>
          </div>
          <div className="landing-footer-col">
            <h4>Product</h4>
            <Link to="/pricing">Pricing</Link>
            <a href="#features-heading" onClick={(e) => { e.preventDefault(); document.getElementById("features-heading")?.scrollIntoView({ behavior: "smooth" }); }}>Features</a>
            <a href="#faq-heading" onClick={(e) => { e.preventDefault(); document.getElementById("faq-heading")?.scrollIntoView({ behavior: "smooth" }); }}>FAQ</a>
          </div>
          <div className="landing-footer-col">
            <h4>Resources</h4>
            <Link to="/resources">All GST Tools &amp; Guides</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/blog/gst-filing-guide-india-2026">GST Filing Guide</Link>
            <Link to="/blog/hsn-code-lookup">HSN Code Lookup</Link>
          </div>
          <div className="landing-footer-col">
            <h4>Company</h4>
            <a href="https://doaide.com">About DoAide</a>
            <a href="mailto:support@doaide.com">Contact</a>
          </div>
        </div>
        <div className="landing-footer-products">
          {DOAIDE_PRODUCTS.map((p) => (
            <a key={p.name} href={p.url} className="landing-footer-link">
              {p.name}
            </a>
          ))}
        </div>
        <div className="landing-footer-bottom">
          <a href="https://doaide.com" className="landing-footer-home">
            <RobotFace size={16} color="#F0B429" />
            doaide.com
          </a>
          <span className="landing-footer-copy">&copy; 2026 DoAide</span>
        </div>
      </footer>
    </div>
  );
}
