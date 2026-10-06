import { useState } from "react";
import { formatINR } from "../lib/gstCalc";
import { whatsappUrl } from "../lib/share";
import { track } from "../lib/track";

const STORAGE_KEY = "gstbot_saved_calcs";
const MAX_SAVED = 20;

export function getSavedCalcs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCalc(calc) {
  try {
    const existing = getSavedCalcs();
    const entry = { ...calc, id: Date.now(), savedAt: new Date().toISOString() };
    const updated = [entry, ...existing].slice(0, MAX_SAVED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return getSavedCalcs();
  }
}

export function removeCalc(id) {
  try {
    const updated = getSavedCalcs().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return getSavedCalcs();
  }
}

function shareText(calc) {
  const taxType = calc.interstate ? "IGST" : "CGST+SGST";
  return `GST for ${formatINR(calc.taxable)} at ${calc.rate}%: ${formatINR(calc.total)} (${taxType}) — Calculate yours at https://gst.doaide.com/calculator`;
}

export function SaveCalcButton({ result, rate, onSaved }) {
  const [saved, setSaved] = useState(false);

  if (!result) return null;

  const handleSave = () => {
    const updated = saveCalc({
      taxable: result.taxable,
      total: result.total,
      rate,
      interstate: result.interstate,
      cgst: result.cgst,
      sgst: result.sgst,
      igst: result.igst,
    });
    setSaved(true);
    track("calc_saved");
    if (onSaved) onSaved(updated);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <button
      className="btn btn-ghost btn-sm save-calc-btn"
      onClick={handleSave}
      aria-label={saved ? "Saved!" : "Save this calculation"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "var(--brand)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      {saved ? "Saved!" : "Save"}
    </button>
  );
}

export default function SavedCalculations({ calcs, onUpdate }) {
  if (!calcs || calcs.length === 0) return null;

  const handleRemove = (id) => {
    const updated = removeCalc(id);
    onUpdate(updated);
    track("calc_removed");
  };

  return (
    <section className="saved-calcs" aria-labelledby="saved-calcs-heading">
      <h2 id="saved-calcs-heading" className="saved-calcs-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
        Your Saved Calculations
        <span className="saved-calcs-count">{calcs.length}</span>
      </h2>
      <div className="saved-calcs-list">
        {calcs.map((c) => (
          <div key={c.id} className="saved-calc-item">
            <div className="saved-calc-main">
              <div className="saved-calc-amount">
                <span className="saved-calc-label">Amount</span>
                <strong>{formatINR(c.taxable)}</strong>
              </div>
              <div className="saved-calc-rate">
                <span className="saved-calc-label">Rate</span>
                <strong>{c.rate}%</strong>
              </div>
              <div className="saved-calc-total">
                <span className="saved-calc-label">Total</span>
                <strong>{formatINR(c.total)}</strong>
              </div>
              <div className="saved-calc-type">
                {c.interstate ? "IGST" : "CGST+SGST"}
              </div>
            </div>
            <div className="saved-calc-actions">
              <a
                href={whatsappUrl(shareText(c), "")}
                target="_blank"
                rel="noopener noreferrer"
                className="saved-calc-share"
                aria-label="Share on WhatsApp"
                onClick={() => track("saved_calc_share_whatsapp")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
              <button
                className="saved-calc-remove"
                onClick={() => handleRemove(c.id)}
                aria-label="Remove saved calculation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
