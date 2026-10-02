import { useEffect, useState } from "react";
import AuthForm from "../components/AuthForm";
import { usePageTitle } from "../hooks/usePageTitle";

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
  "Smart invoice matching",
  "Automated GST returns",
  "Real-time reconciliation",
  "AI-powered compliance",
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

export default function LandingPage() {
  usePageTitle("GST compliance on autopilot");
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
            Do<em>Aide</em> GST
          </span>
        </a>
      </header>

      <main className={`landing-split ${vis}`}>
        <div className="landing-left">
          <div className="landing-hero-robot-wrap">
            <HeroRobot color="#F0B429" />
          </div>
          <h1 className="landing-headline">GST compliance, automated.</h1>
          <p className="landing-subtitle">
            AI-powered GST filing, invoice matching, and reconciliation for Indian businesses.
          </p>
          <div className="landing-typewriter-wrap">
            <Typewriter phrases={TYPEWRITER_PHRASES} />
          </div>
          <PipelineGraphic />
        </div>

        <div className="landing-right">
          <AuthForm />
        </div>
      </main>

      <footer className="landing-footer">
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
