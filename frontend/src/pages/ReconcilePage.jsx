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
        {/* An invoice booked in another month that this statement declares —
            the supplier catching up on a late filing. It is shown because the
            statement names it, and it moves none of this period's figures,
            because the month that booked it has already counted it. Without a
            marker it was an unexplained extra row: the ITC totals and the
            matched count beside them are the period's own, so a user counting
            rows found one more than every number on the screen. */}
        {finding.carried && (
          <span className="chip chip-neutral" title={finding.note ?? ""}>
            Late filing
          </span>
        )}
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
  // Which of the two halves came back unknown rather than empty. A 404 says
  // the period really has no 2B, or really has no run; anything else says only
  // that we did not find out. Both render as a null `imported` / `run`, and
  // the sentences under them are findings about the period rather than
  // captions on the banner — so they need telling apart. Tracked per endpoint
  // because the two fail independently.
  const [unknown, setUnknown] = useState({ imported: false, run: false });
  // Bumped to refetch the period already selected. An import that lands on the
  // month on screen changes no state the load effect depends on, so without
  // this there is nothing for it to react to.
  const [reloadToken, setReloadToken] = useState(0);
  const inputRef = useRef(null);
  // The month the picker is showing, readable from a callback that has been
  // waiting on the network. `period` closed over at click time is the month the
  // action was *started* from, which is the one thing an in-flight action must
  // not assume is still selected.
  const shownPeriod = useRef(period);

  // The 2B and the last run are independent: a period can have an import and
  // no run, or a run from before the latest import.
  const load = useCallback(async (target, { signal } = {}) => {
    setLoading(true);
    setError("");
    const [importResult, runResult] = await Promise.allSettled([
      api.getImported2b(target, { signal }),
      api.latestReconciliation(target, { signal }),
    ]);

    // A superseded load writes nothing. Both answers describe a period that is
    // no longer the one on screen, and every figure below — ITC eligible, ITC
    // at risk, the findings themselves — is captioned by the period picker
    // rather than by anything in the payload, so applying them puts one
    // month's exposure under another month's name.
    if (signal?.aborted) return;

    setImported(importResult.status === "fulfilled" ? importResult.value : null);
    setRun(runResult.status === "fulfilled" ? runResult.value : null);

    // A 404 from either is the normal empty state — nothing imported yet, or
    // nothing reconciled yet — and neither is worth a banner. Everything else
    // is, and treating the whole rejected branch as the empty state meant a
    // 500, a 503 or an edge that never reached the API rendered as a clean
    // "no GSTR-2B imported for this period", inviting the user to import one
    // they had already imported. The page said the period was empty on the
    // strength of never having found out.
    const unanswered = (result) =>
      result.status === "rejected" && result.reason?.status !== 404;
    // Which is only half of it. The banner says something went wrong; it does
    // not stop the panels below saying the period is empty, and those two
    // sentences are the ones a user acts on — "No GSTR-2B imported yet" comes
    // with instructions to go and fetch one that may already be imported, and
    // "Run the reconciliation" invites a re-run of a run that may exist.
    setUnknown({ imported: unanswered(importResult), run: unanswered(runResult) });

    const failure = [importResult, runResult].find(unanswered);
    if (failure) setError(failure.reason?.message || "Could not load this period.");
    setLoading(false);
  }, []);

  // Responses do not come back in the order they were sent, and stepping
  // through months is how this screen is read. Two requests go out per period,
  // so a single change puts four answers in flight with no guarantee of order.
  // Aborting the superseded pair on the way out of the effect is what keeps
  // the month in the picker and the month in the findings the same month.
  useEffect(() => {
    const controller = new AbortController();
    shownPeriod.current = period;
    load(period, { signal: controller.signal });
    return () => controller.abort();
  }, [load, period, reloadToken]);

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
      // on screen. Follow it rather than showing a stale month — and follow it
      // to whatever the picker says *now*, not to the month the upload was
      // started from. A 2B is a few megabytes over a phone connection and the
      // picker stays live throughout, so stepping to another month mid-upload
      // used to reload the month left behind and caption it with the month in
      // the picker.
      setPeriod(result.period);
      // A no-op `setPeriod` schedules no work, so the refetch is asked for
      // separately. Both land in one render, so the effect still runs once.
      setReloadToken((token) => token + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleReconcile() {
    const target = period;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.reconcile(target);
      // Reconciling is the slowest thing this page does — it walks the whole
      // purchase register against the statement — so it is the request most
      // likely to still be running when someone moves on to another month.
      // The findings, the matched count and both ITC figures are captioned by
      // the picker alone, so a run for a month that is no longer selected has
      // nowhere honest to go: showing it would report one month's credit at
      // risk under another month's name, on the screen whose whole job is
      // deciding which credit is safe to claim.
      //
      // Dropped rather than aborted. The run is already stored by the time it
      // answers, so it is waiting on the period when the user returns to it —
      // the confirmation below names its own month for that reason.
      if (shownPeriod.current === target) setRun(result);
      setNotice(`Reconciled ${periodLabel(target)}`);
    } catch (err) {
      // Named for the same reason the confirmation above names itself. The
      // picker stays live for the whole run, so a failure landing after the
      // user has moved to another month would otherwise read as that month's
      // reconciliation — the one now on screen — refusing to run.
      setError(`Could not reconcile ${periodLabel(target)}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const findings = run?.report?.findings ?? [];
  const visible =
    filter === "all" ? findings : findings.filter((f) => f.category === filter);

  // Counted off the findings themselves rather than read from the run's
  // columns, because these numbers label the list the filter is about to show
  // and the two were counting different things. The server's counters
  // deliberately exclude carried findings — an invoice booked in another month
  // belongs to that month's tally — while the report carries them, so a May
  // statement holding one late-filed April invoice showed "Matched (3)" over a
  // list of four matched rows, and "All" over a total that no category chip
  // added up to. A count beside a filter has to be the number of rows that
  // filter yields; the period's own tally is what the stat cards above report.
  const counts = findings.reduce(
    (tally, finding) => {
      if (finding.category in tally) tally[finding.category] += 1;
      return tally;
    },
    {
      matched: 0,
      mismatched: 0,
      missing_in_2b: 0,
      missing_in_books: 0,
      duplicate: 0,
    },
  );

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
        ) : unknown.imported ? (
          // Nothing. The banner above has said the period could not be loaded,
          // and this sentence is not a caption on it — it is a finding that the
          // period holds no statement, followed by instructions to go to the
          // portal and fetch one. On a period whose 2B is already imported that
          // is a wasted download and a re-import, prompted by a page that never
          // found out either way.
          null
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
            {/* The run's own counter, not the chip tally below. Both are
                right about different questions: this card is "how much of
                *this period* matched", and its denominator excludes carried
                invoices, so its numerator has to as well — a May run that
                picked up one late-filed April invoice would otherwise read
                "4 / 3". */}
            <StatCard
              label="Matched"
              value={`${run.matched_count ?? 0} / ${run.total_invoices}`}
              sub={`Last run ${dateLabel(run.completed_at?.slice(0, 10))}`}
              tone={(run.matched_count ?? 0) === run.total_invoices ? "good" : "warn"}
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

      {/* `!unknown.run` for the same reason as the panel above: this says the
          period has never been reconciled, and it says so to invite a run. A
          run endpoint that answered 500 leaves that unestablished, and the
          findings, both ITC figures and the matched count all come from the
          run this sentence claims does not exist. */}
      {!run && !unknown.run && !loading && imported && (
        <p className="muted">
          GSTR-2B is loaded. Run the reconciliation to see what matches.
        </p>
      )}
    </div>
  );
}
