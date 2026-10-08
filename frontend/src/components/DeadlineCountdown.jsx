import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEADLINES } from "./DeadlineBanner";

function getUpcomingDeadlines() {
  const now = new Date();
  const results = [];

  for (const d of DEADLINES) {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), d.day);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, d.day);
    const target = thisMonth > now ? thisMonth : nextMonth;

    const diffMs = target.getTime() - now.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const hours = totalHours % 24;

    results.push({
      returnType: d.returnType,
      date: target,
      days: totalDays,
      hours,
      urgent: totalDays <= 3,
    });
  }

  results.sort((a, b) => a.date - b.date);
  return results;
}

function formatDate(date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function DeadlineCountdown() {
  const [deadlines, setDeadlines] = useState(getUpcomingDeadlines);

  useEffect(() => {
    const id = setInterval(() => setDeadlines(getUpcomingDeadlines()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="deadline-countdown" aria-labelledby="deadline-countdown-heading">
      <h2 id="deadline-countdown-heading" className="landing-section-title">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 8 }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        GST Filing Deadline Countdown
      </h2>
      <div className="deadline-countdown-grid">
        {deadlines.map((d) => (
          <div key={d.returnType} className={`deadline-countdown-card${d.urgent ? " deadline-countdown-urgent" : ""}`}>
            <div className="deadline-countdown-type">{d.returnType}</div>
            <div className="deadline-countdown-timer">
              <span className="deadline-countdown-num">{d.days}</span>
              <span className="deadline-countdown-label">{d.days === 1 ? "day" : "days"}</span>
            </div>
            {d.days <= 7 && (
              <div className="deadline-countdown-hours">
                {d.hours}h remaining today
              </div>
            )}
            <div className="deadline-countdown-date">Due: {formatDate(d.date)}</div>
            {d.urgent && <div className="deadline-countdown-badge">File Now!</div>}
          </div>
        ))}
      </div>
      <div className="deadline-countdown-cta">
        <Link to="/due-dates" className="btn btn-primary btn-sm">
          View Full Calendar →
        </Link>
      </div>
    </section>
  );
}

export { getUpcomingDeadlines };
