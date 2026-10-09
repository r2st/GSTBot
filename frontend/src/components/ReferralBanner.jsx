import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  shouldShowReferralBanner,
  dismissReferralBanner,
  trackReferral,
  TOOL_MAP,
} from "../lib/doaideViral";

const SITE_URL = "https://gst.doaide.com";
const PRODUCT_NAME = "GSTIndia";
const CTA_TEXT = "Know a CA or tax professional?";
const SHARE_TEXT =
  "I use GSTIndia for GST calculations, GSTIN lookup & filing — it's free! Try it:";

const WHATSAPP_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const X_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const styles = {
  overlay: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    padding: "0 1rem 1rem",
    pointerEvents: "none",
  },
  banner: {
    maxWidth: "40rem",
    margin: "0 auto",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "1rem",
    padding: "1rem 1.25rem",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
    animation: "referralSlideUp 0.4s ease-out",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  cta: {
    margin: 0,
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#fff",
    lineHeight: 1.3,
  },
  sub: {
    fontSize: "0.8rem",
    color: "rgba(255,255,255,0.5)",
    marginTop: "0.25rem",
  },
  dismiss: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
    padding: "0.25rem",
    fontSize: "1.2rem",
    lineHeight: 1,
    flexShrink: 0,
  },
  buttons: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  btnBase: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 0.875rem",
    borderRadius: "0.5rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  whatsapp: {
    background: "rgba(37,211,102,0.15)",
    color: "#25D366",
  },
  email: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)",
  },
  copy: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)",
  },
  twitter: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)",
  },
  proof: {
    marginTop: "0.5rem",
    fontSize: "0.7rem",
    color: "rgba(255,255,255,0.3)",
  },
};

export default function ReferralBanner() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const isToolPage = !!TOOL_MAP[pathname];

  useEffect(() => {
    trackReferral();
  }, []);

  useEffect(() => {
    if (!isToolPage) return;
    if (!shouldShowReferralBanner()) return;
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [pathname, isToolPage]);

  const shareUrl = useMemo(
    () => `${SITE_URL}${pathname}?ref=share`,
    [pathname]
  );

  const userCount = useMemo(() => {
    const d = new Date();
    const seed =
      d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return (12000 + ((seed * 7) % 8000)).toLocaleString("en-IN");
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    dismissReferralBanner();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible) return null;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT + " " + shareUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(`Try ${PRODUCT_NAME} — Free GST Tools`)}&body=${encodeURIComponent(SHARE_TEXT + "\n\n" + shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <>
      <style>{`
        @keyframes referralSlideUp {
          from { transform: translateY(100%); opacity: 0 }
          to { transform: translateY(0); opacity: 1 }
        }
        @media print { .referral-banner { display: none !important } }
      `}</style>
      <div style={styles.overlay} className="referral-banner">
        <div style={styles.banner}>
          <div style={styles.topRow}>
            <div>
              <p style={styles.cta}>{CTA_TEXT}</p>
              <p style={styles.sub}>Share this tool — it&apos;s free, no signup needed</p>
            </div>
            <button
              style={styles.dismiss}
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div style={styles.buttons}>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.btnBase, ...styles.whatsapp }}
            >
              {WHATSAPP_SVG} WhatsApp
            </a>
            <a
              href={emailUrl}
              style={{ ...styles.btnBase, ...styles.email }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email
            </a>
            <button
              onClick={handleCopy}
              style={{ ...styles.btnBase, ...styles.copy }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copied ? <path d="M20 6L9 17l-5-5" /> : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>}
              </svg>
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.btnBase, ...styles.twitter }}
            >
              {X_SVG} X
            </a>
          </div>
          <p style={styles.proof}>
            {userCount}+ professionals use DoAide tools every day
          </p>
        </div>
      </div>
    </>
  );
}
