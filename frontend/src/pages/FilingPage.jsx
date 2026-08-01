import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import StatCard from "../components/StatCard";
import { api } from "../lib/api";
import { currentPeriod, periodLabel, rupees } from "../lib/format";

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
  const [period, setPeriod] = useState(currentPeriod());
  const [returnType, setReturnType] = useState("gstr1");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);

  const load = useCallback(async (target, kind) => {
    setLoading(true);
    setError("");
    try {
      setPreview(kind === "gstr3b" ? await api.gstr3b(target) : await api.gstr1(target));
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period, returnType);
  }, [load, period, returnType]);

  async function handleDownload(extension) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { blob, filename } = await api.downloadExport(returnType, extension, period);
      saveBlob(blob, filename);
      setNotice(`Downloaded ${filename}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const validation = preview?.validation;
  const meta = RETURNS[returnType];

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
        <p className="muted">Loading…</p>
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
              JSON goes into the government's offline utility. CSV is for reading, or for
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
                  <strong>{rupees(preview.document.gstbot_set_off.total_cash)}</strong>
                </div>
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
            <h2>Validation</h2>
            {validation.issues.length === 0 ? (
              <p className="muted">
                Nothing to fix. Every invoice in {periodLabel(period)} has the fields the
                portal needs.
              </p>
            ) : (
              <div className="table-scroll">
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
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
