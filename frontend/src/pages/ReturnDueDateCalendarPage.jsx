import { useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import { InlineCTA, StickyMobileCTA } from "../components/ConversionCTA";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import PrintButton from "../components/PrintButton";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const RETURN_TYPES = [
  { key: "all", label: "All Returns" },
  { key: "gstr1", label: "GSTR-1" },
  { key: "gstr3b", label: "GSTR-3B" },
  { key: "gstr9", label: "GSTR-9 (Annual)" },
  { key: "cmp08", label: "CMP-08 (Composition)" },
  { key: "iff", label: "IFF (QRMP)" },
];

function makeDueDates(year, month) {
  const m = month + 1;
  const fy = m >= 4 ? year : year - 1;
  const dates = [];
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevMonthName = MONTHS[prevMonth - 1];
  const prevYear = m === 1 ? year - 1 : year;
  const qrmpMonths = [1, 2, 4, 5, 7, 8, 10, 11];
  const quarterEndMonths = [3, 6, 9, 12];

  dates.push({
    type: "gstr1",
    label: `GSTR-1 for ${prevMonthName} ${prevYear}`,
    date: new Date(year, month, 11),
    desc: "Monthly outward supply return — due 11th of the following month.",
  });

  dates.push({
    type: "gstr3b",
    label: `GSTR-3B for ${prevMonthName} ${prevYear}`,
    date: new Date(year, month, 20),
    desc: "Monthly summary return with tax payment — due 20th of the following month.",
  });

  if (qrmpMonths.includes(m)) {
    dates.push({
      type: "iff",
      label: `IFF for ${prevMonthName} ${prevYear}`,
      date: new Date(year, month, 13),
      desc: "Invoice Furnishing Facility for QRMP taxpayers — due 13th of the following month.",
    });
  }

  if (quarterEndMonths.includes(prevMonth)) {
    dates.push({
      type: "cmp08",
      label: `CMP-08 for Q${Math.ceil(prevMonth / 3)} FY ${fy}-${(fy + 1) % 100}`,
      date: new Date(year, month, 18),
      desc: "Quarterly composition scheme statement — due 18th of the month following the quarter.",
    });
  }

  if (m === 12) {
    dates.push({
      type: "gstr9",
      label: `GSTR-9 for FY ${fy}-${(fy + 1) % 100}`,
      date: new Date(year + 1, 0, 31),
      desc: "Annual return — due 31st December of the following financial year.",
    });
  }

  dates.sort((a, b) => a.date - b.date);
  return dates;
}

function formatDate(d) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(d) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
}

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Return Due Date Calendar",
  url: "https://gst.doaide.com/return-calendar",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Return Due Date Calendar" },
];

export default function ReturnDueDateCalendarPage() {
  usePageTitle("GST Return Due Date Calendar — Filing Deadlines 2026-27");

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [filterType, setFilterType] = useState("all");

  const dueDates = useMemo(
    () => makeDueDates(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  const filtered = filterType === "all"
    ? dueDates
    : dueDates.filter((d) => d.type === filterType);

  function prevMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  }

  function nextMonth() {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  }

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Return Due Date Calendar — Filing Deadlines 2026-27"
        description="Free GST return due date calendar with filing deadlines for GSTR-1, GSTR-3B, GSTR-9, CMP-08, and IFF. Filter by return type and month. Never miss a deadline."
        path="/return-calendar"
        jsonLd={TOOL_SCHEMA}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Return Due Date Calendar" }]} />
          <h1 className="tool-title">GST Return Due Date Calendar</h1>
          <p className="tool-subtitle">
            All GST filing deadlines in one place. Filter by return type and month. No sign-up required.
          </p>

          <div className="calc-card">
            <div className="calendar-controls">
              <button className="quiz-nav-btn" onClick={prevMonth} aria-label="Previous month">←</button>
              <strong className="calendar-month-label">
                {MONTHS[selectedMonth]} {selectedYear}
              </strong>
              <button className="quiz-nav-btn" onClick={nextMonth} aria-label="Next month">→</button>
            </div>

            <div className="calendar-filter">
              {RETURN_TYPES.map((rt) => (
                <button
                  key={rt.key}
                  className={`calendar-filter-btn${filterType === rt.key ? " active" : ""}`}
                  onClick={() => setFilterType(rt.key)}
                >
                  {rt.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "1rem 0" }}>
                No {filterType === "all" ? "" : RETURN_TYPES.find((r) => r.key === filterType)?.label + " "}deadlines in {MONTHS[selectedMonth]} {selectedYear}.
              </p>
            ) : (
              <div className="calendar-dates">
                {filtered.map((d, i) => {
                  const days = daysUntil(d.date);
                  const isPast = days < 0;
                  const isUrgent = days >= 0 && days <= 3;
                  const isSoon = days > 3 && days <= 7;
                  return (
                    <div
                      key={i}
                      className={`calendar-date-card${isPast ? " past" : ""}${isUrgent ? " urgent" : ""}${isSoon ? " soon" : ""}`}
                    >
                      <div className="calendar-date-header">
                        <span className={`calendar-type-badge ${d.type}`}>{d.type.toUpperCase()}</span>
                        <strong>{formatDate(d.date)}</strong>
                      </div>
                      <div className="calendar-date-label">{d.label}</div>
                      <div className="calendar-date-desc">{d.desc}</div>
                      <div className="calendar-date-countdown">
                        {isPast ? (
                          <span style={{ color: "#f87171" }}>Overdue by {Math.abs(days)} days</span>
                        ) : days === 0 ? (
                          <span style={{ color: "#f59e42" }}>Due today!</span>
                        ) : (
                          <span>{days} days remaining</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="calc-result-actions" style={{ marginTop: "1rem" }}>
              <ShareButtons
                path="/return-calendar"
                text={`GST filing deadlines for ${MONTHS[selectedMonth]} ${selectedYear} — check free on DoAide GST`}
              />
              <PrintButton label="Print Calendar" />
            </div>
          </div>

          <EmailCapture
            source="return-calendar"
            heading="Never miss a GST deadline"
            subtext="Get free email reminders 3 days before every GST filing due date."
            buttonLabel="Remind Me"
            compact
          />

          <section className="tool-info">
            <h2>GST Return Filing Due Dates</h2>
            <p>
              Every registered GST taxpayer must file returns by the specified due dates.
              Late filing attracts penalties and interest.
            </p>
            <h3>Regular Taxpayer Due Dates</h3>
            <ul>
              <li><strong>GSTR-1:</strong> 11th of the following month (outward supplies)</li>
              <li><strong>GSTR-3B:</strong> 20th of the following month (summary return with payment)</li>
              <li><strong>GSTR-9:</strong> 31st December of the following financial year (annual return)</li>
            </ul>
            <h3>QRMP Scheme Due Dates</h3>
            <ul>
              <li><strong>GSTR-1 (Quarterly):</strong> 13th of the month following the quarter</li>
              <li><strong>IFF:</strong> 13th of each non-quarter month (optional B2B invoice upload)</li>
              <li><strong>GSTR-3B (Quarterly):</strong> 22nd/24th of the month following the quarter</li>
            </ul>
            <h3>Composition Scheme</h3>
            <ul>
              <li><strong>CMP-08:</strong> 18th of the month following each quarter</li>
              <li><strong>GSTR-4:</strong> 30th April of the following financial year (annual)</li>
            </ul>
          </section>

          <InlineCTA variant="remind" />
          <RelatedTools current="/return-calendar" />
          <CrossProductLinks page="return-calendar" />
        </div>
      </main>
      <DoAideFooter />
      <StickyMobileCTA />
    </div>
  );
}
