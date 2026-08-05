import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { SectionBoundary } from "../components/ErrorBoundary";
import Meter from "../components/Meter";
import { SkeletonPanel, SkeletonStats } from "../components/Skeleton";
import StatCard from "../components/StatCard";
import TableScroll from "../components/TableScroll";
import { usePageTitle } from "../hooks/usePageTitle";
import { api, isAbortError } from "../lib/api";
import {
  currentPeriod,
  daysUntil,
  dateLabel,
  periodLabel,
  rupees,
  rupeesShort,
} from "../lib/format";

/** The last 12 filing periods, newest first, for the period picker. */
function recentPeriodOptions(now = new Date()) {
  const options = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}

function DueDateNotice({ dueDate }) {
  const days = daysUntil(dueDate);
  if (days === null) return null;

  // A missed GSTR-3B carries interest and a late fee, so the closer it gets
  // the louder this is.
  let tone = "neutral";
  let text = `GSTR-3B due ${dateLabel(dueDate)} — ${days} days left`;
  if (days < 0) {
    tone = "bad";
    text = `GSTR-3B was due ${dateLabel(dueDate)} — ${Math.abs(days)} days overdue`;
  } else if (days <= 3) {
    tone = "bad";
    text = `GSTR-3B due ${dateLabel(dueDate)} — ${days} days left`;
  } else if (days <= 7) {
    tone = "warn";
  }

  return (
    <div className={`banner banner-${tone}`} role="status">
      {text}
    </div>
  );
}

function TrendChart({ periods }) {
  const values = periods.map((p) => Number(p.net_liability.total));
  const peak = Math.max(...values, 1);

  return (
    <div className="chart">
      <h2>Net liability trend</h2>

      {/* Hidden from assistive tech rather than labelled. A bar chart has no
          honest ARIA equivalent — role="img" with a summary throws away the
          per-period figures, and there is no markup that makes six divs read as
          a series. The table below carries the same numbers instead, which is
          also what someone would want if they asked for them. */}
      <div className="chart-bars" aria-hidden="true">
        {periods.map((entry, index) => {
          const value = values[index];
          return (
            <div className="chart-col" key={entry.period}>
              <div
                className="chart-bar"
                style={{ height: `${Math.max(2, (value / peak) * 100)}%` }}
                title={`${periodLabel(entry.period)}: ${rupees(value)}`}
              />
              <span className="chart-value">{rupeesShort(value)}</span>
              <span className="chart-label">{entry.period.slice(5)}</span>
            </div>
          );
        })}
      </div>

      <table className="visually-hidden">
        <caption>Net liability by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Net liability</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((entry, index) => (
            <tr key={entry.period}>
              <th scope="row">{periodLabel(entry.period)}</th>
              <td>{rupees(values[index])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (target, { signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      setData(await api.dashboard(target, { signal }));
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Stepping back through months is how this screen is read, and responses do
  // not come back in the order they were sent. Because a period change keeps
  // the previous figures on screen rather than blanking them (see below), a
  // late answer for April landing after June's simply replaced the numbers —
  // leaving one month's money under another month's label, on a screen that
  // gives no per-figure clue which month it is showing.
  useEffect(() => {
    const controller = new AbortController();
    load(period, { signal: controller.signal });
    return () => controller.abort();
  }, [load, period]);

  // Only on the first load. A period change keeps the previous figures on
  // screen and dims them, because replacing a populated dashboard with
  // placeholders reads as "your data is gone".
  if (loading && !data) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Dashboard</h1>
        </div>
        <SkeletonStats count={4} label="Loading dashboard" />
        <div className="panel-row">
          <SkeletonPanel lines={5} label="Loading invoice counts" />
          <SkeletonPanel lines={6} label="Loading tax breakdown" />
        </div>
      </div>
    );
  }

  return (
    <div className={loading ? "page is-refreshing" : "page"} aria-busy={loading}>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          {data && (
            <p className="muted">
              {data.business_name} · {data.business_gstin}
            </p>
          )}
        </div>
        <label className="period-picker">
          <span>Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {recentPeriodOptions().map((option) => (
              <option key={option} value={option}>
                {periodLabel(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {data && (
        <>
          <DueDateNotice dueDate={data.next_due_date} />

          <section className="stat-grid">
            <StatCard
              label="Output tax"
              value={rupees(data.output_tax)}
              sub={`${data.sales.count} sales invoices`}
            />
            <StatCard
              label="Input tax credit"
              value={rupees(data.input_tax_credit)}
              sub={`${data.purchase.count} purchase invoices`}
            />
            <StatCard
              label="Net liability"
              value={rupees(data.net_liability.total)}
              sub={periodLabel(data.period)}
              tone={Number(data.net_liability.total) > 0 ? "warn" : "good"}
            />
            <StatCard
              label="ITC at risk"
              value={rupees(data.itc_at_risk)}
              sub="Suppliers who have not filed"
              tone={Number(data.itc_at_risk) > 0 ? "bad" : "good"}
            />
          </section>

          <section className="panel-row">
            <div className="panel">
              <h2>Invoices</h2>
              <dl className="kv">
                <div>
                  <dt>Total</dt>
                  <dd>{data.counts.total}</dd>
                </div>
                <div>
                  <dt>Sales</dt>
                  <dd>{data.counts.sales}</dd>
                </div>
                <div>
                  <dt>Purchases</dt>
                  <dd>{data.counts.purchase}</dd>
                </div>
                <div>
                  <dt>Needs review</dt>
                  <dd className={data.counts.needs_review ? "is-warn" : undefined}>
                    {data.counts.needs_review}
                  </dd>
                </div>
              </dl>
              <Link to="/invoices" className="btn btn-ghost">
                View all invoices
              </Link>
            </div>

            <div className="panel">
              <h2>Tax breakdown — {periodLabel(data.period)}</h2>
              <TableScroll label={`Tax breakdown for ${periodLabel(data.period)}`}>
                <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Head</th>
                    <th scope="col">Output</th>
                    <th scope="col">Credit</th>
                    <th scope="col">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {["cgst", "sgst", "igst", "cess"].map((head) => (
                    <tr key={head}>
                      <th scope="row">{head.toUpperCase()}</th>
                      <td>{rupees(data.sales[head])}</td>
                      <td>{rupees(data.purchase[head])}</td>
                      <td>{rupees(data.net_liability[head])}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </TableScroll>
              <p className="muted small">
                Credit is tracked per head: IGST credit can offset CGST and SGST, but CGST
                credit can never discharge an SGST liability.
              </p>
            </div>
          </section>

          <section className="panel">
            <h2>Plan usage</h2>
            <p>
              <strong>{data.plan_usage.plan}</strong> — {data.plan_usage.invoices_this_month}{" "}
              invoices this month
              {data.plan_usage.monthly_limit
                ? ` of ${data.plan_usage.monthly_limit} (${data.plan_usage.remaining} remaining)`
                : " (unlimited)"}
            </p>
            {data.plan_usage.monthly_limit > 0 && (
              <Meter
                value={data.plan_usage.invoices_this_month}
                max={data.plan_usage.monthly_limit}
                label="Invoices used this month"
              />
            )}
          </section>

          {/* Boundaried on its own. The chart is the one thing on this page
              that reaches three levels into the response — `net_liability.total`
              across six period summaries — so it is the most likely to throw on
              a shape the API did not promise, and the least worth losing the
              rest of the dashboard over. */}
          {data.recent_periods?.length > 0 && (
            <SectionBoundary name="The net liability trend">
              <TrendChart periods={data.recent_periods} />
            </SectionBoundary>
          )}
        </>
      )}
    </div>
  );
}
