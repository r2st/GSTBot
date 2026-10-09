import { useCallback, useRef, useState } from "react";

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const SYSTEM_PROMPT =
  "You are GSTBot AI Advisor, an expert on India's Goods and Services Tax. " +
  "Help users with GST registration, GSTR-1/GSTR-3B/GSTR-9 filing, HSN and SAC codes, " +
  "input tax credit (ITC) eligibility and reconciliation, composition scheme rules, " +
  "e-way bill requirements, reverse charge mechanism, GST rates for goods and services, " +
  "inter-state vs intra-state supply, TDS/TCS under GST, refund procedures, " +
  "penalties and interest for late filing, and general GST compliance for Indian SMBs. " +
  "Answer concisely and accurately. Cite relevant sections of the CGST/SGST/IGST Acts " +
  "when applicable. If a question is outside GST or Indian tax law, politely decline " +
  "and redirect to GST topics. Use simple language suited for small business owners.";

function buildContents(history) {
  return [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    { role: "model", parts: [{ text: "Understood. I'm your GST advisor. How can I help?" }] },
    ...history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    })),
  ];
}

export default function GstAdvisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bodyRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: buildContents(next),
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(errBody || `API error ${res.status}`);
      }

      const data = await res.json();
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I could not generate a response.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading, messages, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          className="advisor-float"
          onClick={() => setOpen(true)}
          aria-label="Open GST AI Advisor"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            <line x1="9" y1="21" x2="15" y2="21" />
            <line x1="10" y1="24" x2="14" y2="24" />
          </svg>
        </button>
      )}

      {open && (
        <div className="advisor-panel" role="dialog" aria-label="GST AI Advisor">
          <div className="advisor-header">
            <span className="advisor-title">GST AI Advisor</span>
            <button
              type="button"
              className="advisor-close"
              onClick={() => setOpen(false)}
              aria-label="Close advisor"
            >
              ×
            </button>
          </div>
          <div className="advisor-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="advisor-welcome">
                <p className="advisor-welcome-title">Ask me anything about GST</p>
                <p className="advisor-welcome-hint">
                  Try: &quot;What is the GST rate for IT services?&quot; or
                  &quot;How do I claim ITC?&quot;
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`advisor-msg advisor-msg-${m.role}`}>
                <div className="advisor-msg-text">{m.text}</div>
              </div>
            ))}
            {loading && (
              <div className="advisor-msg advisor-msg-assistant">
                <div className="advisor-typing" aria-label="Thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}
            {error && <div className="advisor-error">{error}</div>}
          </div>
          <div className="advisor-footer">
            <textarea
              className="advisor-input"
              placeholder="Ask a GST question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={2000}
              disabled={loading}
            />
            <button
              type="button"
              className="advisor-send"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
