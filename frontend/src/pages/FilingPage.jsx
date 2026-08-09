import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonStats } from "../components/Skeleton";
import StatCard from "../components/StatCard";
import TableScroll from "../components/TableScroll";
import { usePageTitle } from "../hooks/usePageTitle";
import { api, isAbortError } from "../lib/api";
import { currentPeriod, dateLabel, periodLabel, rupees } from "../lib/format";
import { arnError, normalizeArn } from "../lib/validate";

/** The last 12 filing periods, newest first. */
function recentPeriodOptions(now = new Date()) {
  const options = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}

const RETURNS = {
  gstr1: {
    label: "GSTR-1",
    help: "Your outward supplies. This is what becomes your customers' GSTR-2B, so the GSTINs on it decide whether they can claim their credit.",
  },
  gstr3b: {
    label: "GSTR-3B",
    help: "The monthly summary and payment, pre-filled from the reconciled ITC position.",
  },
};

/** Save a fetched blob to the user's disk under the server's filename. */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Whether *period* has finished, and so could have been filed at all.
 *
 * A return covers a whole month and the portal does not open it until that
 * month is over — the server refuses a record for a period that has not ended.
 * The picker opens on the current month, so without this check the first thing
 * a user meets on this panel is a 422 for doing the obvious thing.
 *
 * String comparison, because `YYYY-MM` is zero-padded and therefore sorts in
 * calendar order.
 */
function periodHasEnded(period, now = new Date()) {
  return period < currentPeriod(now);
}

/** How a return stands: filed, overdue, or still inside its deadline. */
function standingChip(item) {
  if (item.filed) {
    return item.filed_late
      ? { tone: "warn", label: "Filed late" }
      : { tone: "good", label: "Filed" };
  }
  if (item.days_until_due < 0) {
    return { tone: "bad", label: `Overdue by ${Math.abs(item.days_until_due)}d` };
  }
  return { tone: "warn", label: `Due in ${item.days_until_due}d` };
}

function StatusRow({ item }) {
  const chip = standingChip(item);
  return (
    <tr>
      <td>{periodLabel(item.period)}</td>
      <td>{RETURNS[item.return_type]?.label ?? item.return_type.toUpperCase()}</td>
      <td>{dateLabel(item.due_date)}</td>
      <td>
        <span className={`chip chip-${chip.tone}`}>{chip.label}</span>
      </td>
      <td>{item.filed ? dateLabel(item.filed_on) : "—"}</td>
      <td className="muted small">{item.arn || "—"}</td>
    </tr>
  );
}

function IssueRow({ issue }) {
  return (
    <tr>
      <td>
        <span className={issue.severity === "error" ? "chip chip-bad" : "chip chip-warn"}>
          {issue.severity === "error" ? "Error" : "Warning"}
        </span>
      </td>
      <td>
        {issue.invoice_id ? (
          <Link to={`/invoices/${issue.invoice_id}`}>
            {issue.invoice_number || "(no number)"}
          </Link>
        ) : (
          issue.invoice_number || "(no number)"
        )}
      </td>
      <td>{issue.field.replace(/_/g, " ")}</td>
      <td>{issue.message}</td>
    </tr>
  );
}

export default function FilingPage() {
  usePageTitle("Filing");
  const [period, setPeriod] = useState(currentPeriod());
  const [returnType, setReturnType] = useState("gstr1");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);
  const [standings, setStandings] = useState(null);
  const [arn, setArn] = useState("");
  const [arnProblem, setArnProblem] = useState("");
  // Bumped after a filing is recorded, to refetch a status the record changed.
  const [statusToken, setStatusToken] = useState(0);
  // The period and return type the picker is showing, readable from a callback
  // that has been waiting on the network. Recording a filing rebuilds the whole
  // return server-side, so it is slow enough for the picker to have moved on —
  // and a confirmation naming the wrong month is worse than none.
  const shown = useRef({ period, returnType });
  shown.current = { period, returnType };

  const load = useCallback(async (target, kind, { signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      setPreview(
        kind === "gstr3b"
          ? await api.gstr3b(target, { signal })
          : await api.gstr1(target, { signal }),
      );
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err.message);
      setPreview(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Two controls drive this, and responses do not come back in the order they
  // were sent. A late GSTR-1 landing after a GSTR-3B was asked for is the worse
  // half: the heading, the export buttons and the validation verdict all follow
  // `returnType`, so the page would offer to file one return while previewing
  // the other.
  useEffect(() => {
    const controller = new AbortController();
    load(period, returnType, { signal: controller.signal });
    return () => controller.abort();
  }, [load, period, returnType]);

  // The status table covers six completed periods at once, so it does not
  // depend on the picker — only on a filing having been recorded. Its failure
  // is deliberately not put in the banner: the page's job is preparing a
  // return, and a status panel that could not load must not make the export
  // buttons look broken.
  useEffect(() => {
    const controller = new AbortController();
    api
      .filingStatus({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setStandings(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStandings(null);
      });
    return () => controller.abort();
  }, [statusToken]);

  async function handleDownload(extension) {
    // Both controls that decide what this file is — the period picker and the
    // type toggle — stay live while it is being built, and an export is the
    // slowest thing the page does: it builds the whole return rather than
    // previewing it, which is why it carries a tighter limit of its own. So
    // the return being downloaded is not necessarily the one that will be on
    // screen when the answer comes back.
    const target = { period, returnType };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { blob, filename } = await api.downloadExport(
        target.returnType,
        extension,
        target.period,
      );
      saveBlob(blob, filename);
      // Needs nothing added to it. The server names the file for the return
      // type, the GSTIN and the period precisely so it does not arrive as
      // `download (3)`, so the confirmation already says which return landed
      // even when the picker has moved on since.
      setNotice(`Downloaded ${filename}`);
    } catch (err) {
      // Named rather than dropped, unlike a superseded load. Nothing is coming
      // to replace this one: the user asked for a file and did not get it, and
      // staying silent leaves them waiting on a download that will never
      // start — so the failure is worth saying wherever they are standing.
      //
      // But it has to say what it is about. The server's own sentence is a
      // 429 from the export limit, or a 500, and none of them name a return —
      // so under a picker that has since moved, "Too many requests" reads as
      // the month now on screen being the one that cannot be exported. That is
      // the misattribution the record-filed handler already avoids by naming
      // its own period in the confirmation.
      setError(
        `Could not download the ${RETURNS[target.returnType].label} for ` +
          `${periodLabel(target.period)}: ${err.message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordFiled(event) {
    event.preventDefault();
    const problem = arnError(arn);
    setArnProblem(problem);
    if (problem) return;

    const target = shown.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleaned = normalizeArn(arn);
      await api.recordFiled(target.returnType, {
        period: target.period,
        // Omitted rather than sent empty: on the server an absent ARN means
        // "not to hand" and leaves a stored one alone, while an empty string is
        // not an ARN at all.
        ...(cleaned ? { arn: cleaned } : {}),
      });
      setArn("");
      setNotice(
        `Recorded ${RETURNS[target.returnType].label} for ${periodLabel(target.period)} as filed.`,
      );
      setStatusToken((token) => token + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const validation = preview?.validation;
  const meta = RETURNS[returnType];
  const alreadyFiled = standings?.items?.find(
    (item) => item.period === period && item.return_type === returnType,
  );
  const recordable = periodHasEnded(period);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Filing preparation</h1>
          <p className="muted">
            Check a period, generate the return, and export it in the format the GST
            portal accepts.
          </p>
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
      {notice && (
        <div className="banner banner-good" role="status">
          {notice}
        </div>
      )}

      <div className="type-toggle" role="group" aria-label="Return type">
        {Object.entries(RETURNS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={returnType === key ? "btn btn-primary" : "btn btn-ghost"}
            aria-pressed={returnType === key}
            onClick={() => setReturnType(key)}
          >
            {value.label}
          </button>
        ))}
      </div>

      <p className="muted small">{meta.help}</p>

      {loading ? (
        <SkeletonStats count={4} label="Loading the return preview" />
      ) : !preview ? null : (
        <>
          <section className="stat-grid">
            <StatCard
              label="Ready to file"
              value={validation.ok ? "Yes" : "No"}
              sub={validation.ok ? "Nothing blocking" : `${validation.error_count} to fix`}
              tone={validation.ok ? "good" : "bad"}
            />
            <StatCard
              label="Invoices"
              value={validation.invoice_count}
              sub={`In ${periodLabel(period)}`}
            />
            <StatCard
              label="Errors"
              value={validation.error_count}
              sub="The portal will reject these"
              tone={validation.error_count > 0 ? "bad" : "good"}
            />
            <StatCard
              label="Warnings"
              value={validation.warning_count}
              sub="Worth a look; will still file"
              tone={validation.warning_count > 0 ? "warn" : "good"}
            />
          </section>

          <section className="panel">
            <h2>Export</h2>
            <p className="muted small">
              JSON goes into the government’s offline utility. CSV is for reading, or for
              a CA to check before anything is filed.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => handleDownload("json")}
              >
                {busy ? "Working…" : `Download ${meta.label} JSON`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => handleDownload("csv")}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowJson((shown) => !shown)}
                aria-expanded={showJson}
              >
                {showJson ? "Hide" : "Show"} generated JSON
              </button>
            </div>

            {!validation.ok && (
              <p className="muted small">
                You can still export a period with errors — but fix them before filing, or
                the portal will reject the upload.
              </p>
            )}

            {showJson && (
              <pre className="chart" aria-label="Generated return JSON">
                {JSON.stringify(preview.document, null, 2)}
              </pre>
            )}
          </section>

          {returnType === "gstr3b" && preview.document.gstbot_set_off && (
            <section className="panel">
              <h2>What this leaves to pay</h2>
              <div className="kv">
                <div>
                  <span className="muted">Cash payable</span>
                  {/* Both liabilities. Credit settles output tax and cannot
                      touch a reverse-charge one, so the set-off's own figure
                      is only half of what has to be found. */}
                  <strong>
                    {rupees(
                      preview.document.gstbot_cash_payable ??
                        preview.document.gstbot_set_off.total_cash,
                    )}
                  </strong>
                </div>
                {Number(preview.document.gstbot_reverse_charge?.cash_payable ?? 0) > 0 && (
                  <div>
                    <span className="muted">Of which reverse charge</span>
                    <strong>
                      {rupees(preview.document.gstbot_reverse_charge.cash_payable)}
                    </strong>
                  </div>
                )}
                <div>
                  <span className="muted">Credit used</span>
                  <strong>
                    {rupees(preview.document.gstbot_set_off.credit_used.total)}
                  </strong>
                </div>
                <div>
                  <span className="muted">Carried forward</span>
                  <strong>
                    {rupees(preview.document.gstbot_set_off.credit_carried_forward.total)}
                  </strong>
                </div>
              </div>
              <p className="muted small">
                Worked out on the <Link to="/itc">ITC screen</Link>.
              </p>
            </section>
          )}

          <section className="panel">
            <h2>Record this filing</h2>
            <p className="muted small">
              GSTBot prepares the return; the portal is where it is submitted, and nothing
              here can see that happen. Tell us once you have filed — otherwise the
              deadline reminders keep treating {periodLabel(period)} as outstanding.
            </p>
            {!recordable && (
              <p className="muted small">
                {periodLabel(period)} has not ended yet, so there is nothing to record —
                the portal does not open a return until the month it covers is over.
              </p>
            )}
            {alreadyFiled?.filed && (
              <p className="muted small">
                Already recorded as filed on {dateLabel(alreadyFiled.filed_on)}
                {alreadyFiled.arn ? ` (ARN ${alreadyFiled.arn})` : ""}. Recording it again
                corrects the reference rather than filing twice.
              </p>
            )}
            <form className="inline-form" onSubmit={handleRecordFiled}>
              <label htmlFor="filing-arn">
                <span>ARN (optional)</span>
                <input
                  id="filing-arn"
                  type="text"
                  value={arn}
                  maxLength={40}
                  placeholder="AA270426000000X"
                  disabled={!recordable}
                  aria-invalid={arnProblem ? "true" : undefined}
                  aria-describedby={arnProblem ? "filing-arn-error" : undefined}
                  onChange={(e) => {
                    setArn(e.target.value);
                    if (arnProblem) setArnProblem("");
                  }}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !recordable}
              >
                {busy ? "Working…" : `Mark ${meta.label} as filed`}
              </button>
            </form>
            {arnProblem && (
              <p className="field-error" id="filing-arn-error" role="alert">
                {arnProblem}
              </p>
            )}
            <p className="muted small">
              You can leave the ARN blank now and add it later — recording the same period
              again never clears a reference already saved.
            </p>
          </section>

          <section className="panel">
            <h2>Validation</h2>
            {validation.issues.length === 0 ? (
              <p className="muted">
                Nothing to fix. Every invoice in {periodLabel(period)} has the fields the
                portal needs.
              </p>
            ) : (
              <TableScroll label="Validation issues">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Severity</th>
                      <th scope="col">Invoice</th>
                      <th scope="col">Field</th>
                      <th scope="col">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.issues.map((issue, index) => (
                      <IssueRow
                        key={`${issue.invoice_id ?? "x"}-${issue.field}-${index}`}
                        issue={issue}
                      />
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </section>
        </>
      )}

      {standings?.items?.length > 0 && (
        <section className="panel">
          <h2>Filing status</h2>
          <p className="muted small">
            The last six completed periods, as of {dateLabel(standings.as_of)}. The current
            month is not listed — the portal does not open a return until the month it
            covers is over.
          </p>
          <TableScroll label="Filing status by period">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Return</th>
                  <th scope="col">Due</th>
                  <th scope="col">Standing</th>
                  <th scope="col">Filed on</th>
                  <th scope="col">ARN</th>
                </tr>
              </thead>
              <tbody>
                {standings.items.map((item) => (
                  <StatusRow key={`${item.period}-${item.return_type}`} item={item} />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      )}
    </div>
  );
}
