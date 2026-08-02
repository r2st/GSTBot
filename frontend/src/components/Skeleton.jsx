/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * A bar where the table will be keeps the page from jumping when the data
 * lands, which matters most on the dashboard: four stat cards appearing at
 * once used to push the whole page down.
 *
 * Every skeleton carries `aria-live="polite"` with a visually hidden label, so
 * a screen reader is told the region is loading rather than reading out
 * nothing, and `aria-hidden` on the bars stops the decoration being announced.
 *
 * Deliberately not `role="status"`. That would be the textbook choice, but the
 * pages already use a status region for things the user must act on — "this
 * period has not been reconciled" — and a placeholder that claims the same role
 * competes with it, both for a screen reader and for a test looking the banner
 * up by role. aria-live gets the announcement without the collision.
 */

function Bars({ count, className }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={className} />
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, label = "Loading" }) {
  return (
    <div className="skeleton-block" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}…</span>
      <Bars count={lines} className="skeleton skeleton-line" />
    </div>
  );
}

export function SkeletonStats({ count = 4, label = "Loading summary" }) {
  return (
    <div className="stat-grid" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="stat-card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-line skeleton-sm" />
          <div className="skeleton skeleton-line skeleton-lg" />
          <div className="skeleton skeleton-line skeleton-sm" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, label = "Loading table" }) {
  return (
    <div className="skeleton-table" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}…</span>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, r) => (
          <div className="skeleton-row" key={r} style={{ "--cols": columns }}>
            {Array.from({ length: columns }, (_, c) => (
              <div className="skeleton skeleton-cell" key={c} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** For a panel whose content is a form or a paragraph rather than rows. */
export function SkeletonPanel({ lines = 4, label = "Loading" }) {
  return (
    <div className="panel" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}…</span>
      <Bars count={lines} className="skeleton skeleton-line" />
    </div>
  );
}

/** The inline spinner a button shows while its request is in flight. */
export function Spinner({ label = "Working" }) {
  return (
    <span className="spinner" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
    </span>
  );
}
