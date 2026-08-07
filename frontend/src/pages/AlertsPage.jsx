import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonPanel } from "../components/Skeleton";
import { usePageTitle } from "../hooks/usePageTitle";
import { api, isAbortError } from "../lib/api";
import { dateLabel, periodLabel } from "../lib/format";

const SEVERITY = {
  critical: { label: "Overdue", tone: "bad" },
  warning: { label: "Due soon", tone: "warn" },
  info: { label: "Upcoming", tone: "neutral" },
};

const SCOPES = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["all", "All"],
];

// What a closed alert closed *for*. The two are not the same event and the
// difference is the only thing that says whether these alerts do anything:
// resolved means the return was actually filed, dismissed means the business
// made the reminder go away. Collapsing them into "closed" on screen would
// throw that away at the one place a person can see it.
const CLOSED_LABEL = {
  resolved: "Filed",
  dismissed: "Dismissed",
};

function SeverityChip({ severity }) {
  const meta = SEVERITY[severity] ?? SEVERITY.info;
  return <span className={`chip chip-${meta.tone}`}>{meta.label}</span>;
}

/**
 * One alert, with the two things a business can do to it.
 *
 * "Mark as read" and "Dismiss" are separate buttons rather than one because the
 * API keeps them separate on purpose: reading a filing deadline leaves it every
 * bit as unmet, so it stays in the badge, while dismissing it says "I know" and
 * stops the sweep raising it again tomorrow.
 */
function AlertRow({ alert, busy, onRead, onDismiss }) {
  const closed = CLOSED_LABEL[alert.status];
  const unread = alert.status === "pending" || alert.status === "sent";

  return (
    <li className={`alert-row is-${SEVERITY[alert.severity]?.tone ?? "neutral"}`}>
      <div className="alert-head">
        <SeverityChip severity={alert.severity} />
        <h3 className={unread ? "alert-title is-unread" : "alert-title"}>{alert.title}</h3>
        {closed && <span className="chip chip-neutral">{closed}</span>}
      </div>

      <p className="alert-message">{alert.message}</p>

      <p className="muted small alert-meta">
        {alert.period && <>{periodLabel(alert.period)} · </>}
        {alert.due_date && <>Due {dateLabel(alert.due_date)} · </>}
        Raised {dateLabel(alert.created_at)}
      </p>

      <div className="alert-actions">
        {/* The alert asks for a filing, and this is where a filing gets
            recorded — so the way to make a deadline alert close *properly* is
            one click away rather than something to go and find. Recording the
            filing resolves it on the next sweep; dismissing only silences it. */}
        {alert.alert_type === "filing_deadline" && !closed && (
          <Link to="/filing" className="btn btn-primary">
            Record filing
          </Link>
        )}
        {unread && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onRead(alert.id)}
          >
            Mark as read
          </button>
        )}
        {!closed && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onDismiss(alert.id)}
          >
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}

export default function AlertsPage() {
  usePageTitle("Alerts");
  const [items, setItems] = useState([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [scope, setScope] = useState("open");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Which alert has an action in flight. Per-id rather than one page-wide flag
  // so dismissing the third alert does not disable the buttons on the other
  // nine — clearing a backlog is one row at a time, and that is the whole
  // interaction this screen exists for.
  const [pending, setPending] = useState(null);

  const load = useCallback(async (target, { signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listAlerts({ scope: target }, { signal });
      setItems(data.items);
      setOpenTotal(data.open_total);
    } catch (err) {
      // A superseded request has been replaced by a newer one that owns the
      // list, the banner and the spinner from here on.
      if (isAbortError(err)) return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Aborted on the way out, like every other list in the product: switching
  // scope twice quickly would otherwise let the first answer land last and
  // leave closed alerts under an "Open" tab.
  useEffect(() => {
    const controller = new AbortController();
    load(scope, { signal: controller.signal });
    return () => controller.abort();
  }, [load, scope]);

  /**
   * Apply one action and fold the server's answer back into the row.
   *
   * The updated alert is taken from the response rather than assumed, because
   * both endpoints are deliberately non-committal: marking read never reopens a
   * dismissed alert, and dismissing one the sweep already resolved leaves it
   * resolved. Guessing the new status here would show a filed return as
   * "Dismissed" — losing exactly the distinction the two statuses exist for.
   */
  async function apply(id, action) {
    setPending(id);
    setError("");
    try {
      const updated = await action(id);
      setItems((prev) =>
        // Under the open scope an alert that just closed no longer belongs in
        // the list it is sitting in, so it leaves rather than lingering as a
        // row the filters say should not be there.
        scope === "open" && !["pending", "sent", "read", "failed"].includes(updated.status)
          ? prev.filter((alert) => alert.id !== id)
          : prev.map((alert) => (alert.id === id ? updated : alert)),
      );
      // Recomputed from the same response set rather than decremented blindly:
      // marking an alert read does not change the open count, and dismissing
      // one that was already closed does not either.
      setOpenTotal((total) =>
        ["pending", "sent", "read", "failed"].includes(updated.status)
          ? total
          : Math.max(0, total - 1),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted">
            Returns that are due, and returns that are late. Dismissing one stops it coming
            back tomorrow; recording the filing is what closes it for good.
          </p>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="filters">
        <div className="filter-row">
          {SCOPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={scope === value ? "chip chip-neutral is-active" : "chip chip-neutral"}
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {label}
              {value === "open" && openTotal > 0 ? ` (${openTotal})` : ""}
            </button>
          ))}
        </div>
      </div>

      <section className="panel">
        {loading ? (
          <SkeletonPanel lines={5} label="Loading alerts" />
        ) : items.length === 0 ? (
          <p className="muted">
            {scope === "open"
              ? "Nothing outstanding. Alerts appear here a week before each return is due."
              : scope === "closed"
                ? "Nothing closed yet."
                : "No alerts yet. They appear a week before each return is due."}
          </p>
        ) : (
          <ul className="alert-list">
            {items.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                busy={pending === alert.id}
                onRead={(id) => apply(id, api.markAlertRead)}
                onDismiss={(id) => apply(id, api.dismissAlert)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
