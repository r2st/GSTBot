import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const DISMISS_KEY = "gstbot_deadline_dismissed";
const DISMISS_EXPIRY_HOURS = 24;

const DEADLINES = [
  { returnType: "GSTR-1", day: 11 },
  { returnType: "GSTR-3B", day: 20 },
];

function getNextDeadline() {
  const now = new Date();
  const candidates = [];

  for (const d of DEADLINES) {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), d.day);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, d.day);

    if (thisMonth > now) {
      candidates.push({ ...d, date: thisMonth });
    }
    candidates.push({ ...d, date: nextMonth });
  }

  candidates.sort((a, b) => a.date - b.date);
  return candidates[0] || null;
}

function daysUntil(target) {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isDismissed() {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    const ts = parseInt(dismissed, 10);
    return Date.now() - ts < DISMISS_EXPIRY_HOURS * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — banner will return on next load.
  }
}

export default function DeadlineBanner() {
  const [visible, setVisible] = useState(() => !isDismissed());

  useEffect(() => {
    setVisible(!isDismissed());
  }, []);

  if (!visible) return null;

  const deadline = getNextDeadline();
  if (!deadline) return null;

  const days = daysUntil(deadline.date);
  if (days > 30) return null;

  const urgent = days <= 3;
  const monthName = deadline.date.toLocaleString("en-IN", { month: "short" });

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  return (
    <div
      className={`deadline-banner${urgent ? " deadline-urgent" : ""}`}
      role="status"
      aria-label="Filing deadline reminder"
    >
      <div className="deadline-banner-content">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="deadline-banner-icon">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          <strong>{deadline.returnType}</strong> due in{" "}
          <strong className={urgent ? "deadline-days-urgent" : "deadline-days"}>
            {days} {days === 1 ? "day" : "days"}
          </strong>
          {" "}({deadline.day} {monthName})
        </span>
        <Link to="/due-dates" className="deadline-banner-link">
          View all deadlines
        </Link>
      </div>
      <button
        className="deadline-banner-close"
        onClick={handleDismiss}
        aria-label="Dismiss deadline reminder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export { daysUntil, DEADLINES, getNextDeadline, isDismissed };
