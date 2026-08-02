import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonText } from "../components/Skeleton";
import StatCard from "../components/StatCard";
import TableScroll from "../components/TableScroll";
import { usePageTitle } from "../hooks/usePageTitle";
import { api } from "../lib/api";
import { currentPeriod, dateLabel, periodLabel, rupees } from "../lib/format";
import { GSTR2B_EXTENSIONS, fileError } from "../lib/validate";

const ACCEPT = GSTR2B_EXTENSIONS.join(",");

/** The last 12 filing periods, newest first. */
function recentPeriodOptions(now = new Date()) {
  const options = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}

// Each outcome implies a different action, so they are labelled by what the
// user has to do about them rather than by the enum name.
const CATEGORIES = {
  matched: {
    label: "Matched",
    tone: "good",
    help: "Same invoice, same figures. Nothing to do.",
  },
  mismatched: {
    label: "Mismatched",
    tone: "warn",
    help: "Found in GSTR-2B, but the figures differ. Correct the books or ask the supplier to amend.",
  },
  missing_in_2b: {
    label: "Missing in 2B",
    tone: "bad",
    help: "In your books, not in the supplier's GSTR-1. This credit is at risk until they file.",
  },
  missing_in_books: {
    label: "Missing in books",
    tone: "warn",
    help: "The supplier declared it and you have not booked it. Credit you may be entitled to.",
  },
  duplicate: {
    label: "Duplicate",
    tone: "bad",
    help: "Booked more than once. Two claims off one document is what draws a notice.",
  },
};

const CATEGORY_ORDER = [
  "missing_in_2b",
  "mismatched",
  "duplicate",
  "missing_in_books",
  "matched",
];

function FindingRow({ finding }) {
  const meta = CATEGORIES[finding.category] ?? { label: finding.category, tone: "neutral" };
  return (
    <tr>
      <td>
        <span className={`chip chip-${meta.tone}`}>{meta.label}</span>
      </td>
      <td>
        {finding.invoice_id ? (
          <Link to={`/invoices/${finding.invoice_id}`}>
            {finding.invoice_number || "(no number)"}
          </Link>
        ) : (
          finding.invoice_number || "(no number)"
        )}
      </td>
      <td>
        <div>{finding.supplier_name || "—"}</div>
        <div className="muted small">{finding.supplier_gstin || ""}</div>
      </td>
      <td>{dateLabel(finding.invoice_date)}</td>
      <td className="numeric">{finding.books ? rupees(finding.books.total_tax) : "—"}</td>
      <td className="numeric">{finding.gstr2b ? rupees(finding.gstr2b.total_tax) : "—"}</td>
      <td>
        {finding.differences?.length > 0 ? (
          <ul className="diff-list">
            {finding.differences.map((diff) => (
              <li key={diff.field}>
                <strong>{diff.field.replace(/_/g, " ")}</strong>: {rupees(diff.books)} vs{" "}
                {rupees(diff.gstr2b)}{" "}
                <span className="muted">({rupees(diff.delta)})</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">{finding.note || ""}</span>
        )}
      </td>
    </tr>
  );
}

export default function ReconcilePage() {
  usePageTitle("Reconcile");
  const [period, setPeriod] = useState(currentPeriod());
  const [imported, setImported] = useState(null);
  const [run, setRun] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);

  // The 2B and the last run are independent: a period can have an import and
  // no run, or a run from before the latest import.
  const load = useCallback(async (target) => {
    setLoading(true);
    setError("");
    const [importResult, runResult] = await Promise.allSettled([
      api.getImported2b(target),
      api.latestReconciliation(target),
    ]);
    // A 404 from either is the normal empty state, not an error worth showing.
    setImported(importResult.status === "fulfilled" ? importResult.value : null);
    setRun(runResult.status === "fulfilled" ? runResult.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(period);
  }, [load, period]);

  async function handleImport(files) {
    const file = Array.from(files ?? [])[0];
    if (!file) return;

    // The portal hands out the 2B as a zip containing the JSON, and uploading
    // the zip is the single most common mistake here. Catching it in the
    // browser makes the message about the zip rather than a generic 400.
    const invalid = fileError(file, { extensions: GSTR2B_EXTENSIONS });
    if (invalid) {
      setError(invalid);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.importGstr2b(file, period);
      setNotice(result.message);
      // The server decides the period from the file, which may not be the one
      // on screen. Follow it rather than showing a stale month.
      if (result.period !== period) setPeriod(result.period);
      else await load(period);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleReconcile() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setRun(await api.reconcile(period));
      setNotice(`Reconciled ${periodLabel(period)}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const findings = run?.report?.findings ?? [];
  const visible =
    filter === "all" ? findings : findings.filter((f) => f.category === filter);

  const counts = {
    matched: run?.matched_count ?? 0,
    mismatched: run?.mismatched_count ?? 0,
    missing_in_2b: run?.missing_in_2b_count ?? 0,
    missing_in_books: run?.missing_in_books_count ?? 0,
    duplicate: run?.duplicate_count ?? 0,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reconciliation</h1>
          <p className="muted">
            Match your purchase register against GSTR-2B — the statement of what your
            suppliers actually declared.
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

      <section className="panel">
        <h2>GSTR-2B for {periodLabel(period)}</h2>
        {loading ? (
          <SkeletonText lines={2} label="Loading the GSTR-2B" />
        ) : imported ? (
          <p>
            <strong>{imported.invoice_count}</strong> invoices imported{" "}
            {dateLabel(imported.created_at?.slice(0, 10))} · taxable{" "}
            {rupees(imported.total_taxable_value)} · tax{" "}
            {rupees(
              Number(imported.total_cgst) +
                Number(imported.total_sgst) +
                Number(imported.total_igst) +
                Number(imported.total_cess),
            )}
          </p>
        ) : (
          <p className="muted">
            No GSTR-2B imported yet. Download it from the GST portal (Returns → GSTR-2B →
            Download) and upload the JSON or CSV here.
          </p>
        )}

        <div className="button-row">
          <label htmlFor="gstr2b-file" className="btn btn-ghost">
            {imported ? "Replace GSTR-2B" : "Import GSTR-2B"}
          </label>
          <input
            id="gstr2b-file"
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            disabled={busy}
            onChange={(e) => handleImport(e.target.files)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !imported}
            onClick={handleReconcile}
          >
            {busy ? "Working…" : "Run reconciliation"}
          </button>
        </div>
      </section>

      {run && (
        <>
          <section className="stat-grid">
            <StatCard
              label="ITC eligible"
              value={rupees(run.itc_eligible)}
              sub="Safe to claim"
              tone="good"
            />
            <StatCard
              label="ITC at risk"
              value={rupees(run.itc_at_risk)}
              sub="Unfiled or over-claimed"
              tone={Number(run.itc_at_risk) > 0 ? "bad" : "good"}
            />
            <StatCard
              label="ITC claimed"
              value={rupees(run.itc_claimed)}
              sub={`${run.total_invoices} purchase invoices`}
            />
            <StatCard
              label="Matched"
              value={`${counts.matched} / ${run.total_invoices}`}
              sub={`Last run ${dateLabel(run.completed_at?.slice(0, 10))}`}
              tone={counts.matched === run.total_invoices ? "good" : "warn"}
            />
          </section>

          <section className="panel">
            <h2>Findings</h2>
            <div className="filter-row">
              <button
                type="button"
                className={filter === "all" ? "chip chip-neutral is-active" : "chip chip-neutral"}
                onClick={() => setFilter("all")}
              >
                All ({findings.length})
              </button>
              {CATEGORY_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={
                    filter === key
                      ? `chip chip-${CATEGORIES[key].tone} is-active`
                      : `chip chip-${CATEGORIES[key].tone}`
                  }
                  onClick={() => setFilter(key)}
                >
                  {CATEGORIES[key].label} ({counts[key]})
                </button>
              ))}
            </div>

            {filter !== "all" && (
              <p className="muted small">{CATEGORIES[filter]?.help}</p>
            )}

            {visible.length === 0 ? (
              <p className="muted">Nothing in this category.</p>
            ) : (
              <TableScroll label="Reconciliation findings">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Outcome</th>
                      <th scope="col">Invoice</th>
                      <th scope="col">Supplier</th>
                      <th scope="col">Date</th>
                      <th scope="col">Tax (books)</th>
                      <th scope="col">Tax (2B)</th>
                      <th scope="col">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((finding, index) => (
                      <FindingRow
                        key={`${finding.category}-${finding.invoice_id ?? "x"}-${index}`}
                        finding={finding}
                      />
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </section>
        </>
      )}

      {!run && !loading && imported && (
        <p className="muted">
          GSTR-2B is loaded. Run the reconciliation to see what matches.
        </p>
      )}
    </div>
  );
}
