import { useState, useEffect } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem("pwa-dismissed");
      if (!dismissed) setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem("pwa-dismissed", "1");
  };

  return (
    <div
      className="install-prompt"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 1000,
        maxWidth: "28rem",
        margin: "0 auto",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        padding: "1rem",
        boxShadow: "var(--shadow)",
        animation: "fadeUp 0.3s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "rgba(240,180,41,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <rect x="5" y="6" width="22" height="17" rx="5" fill="#F0B429" />
            <ellipse cx="11" cy="13" rx="2.5" ry="3" fill="#0A0A0B" />
            <ellipse cx="21" cy="13" rx="2.5" ry="3" fill="#0A0A0B" />
            <path d="M12 19Q16 22 20 19" stroke="#0A0A0B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500, color: "var(--ink-strong)" }}>
            Install DoAide GST
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--ink-soft)" }}>
            Use offline like an app
          </p>
        </div>
        <button onClick={install} className="btn-primary" style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem", borderRadius: 8, flexShrink: 0 }}>
          Install
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-soft)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
