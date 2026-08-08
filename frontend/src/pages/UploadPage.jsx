import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { Spinner } from "../components/Skeleton";
import { usePageTitle } from "../hooks/usePageTitle";
import { api } from "../lib/api";
import { dateLabel, rupees } from "../lib/format";
import { INVOICE_EXTENSIONS, MAX_UPLOAD_MB, partitionFiles } from "../lib/validate";

const ACCEPT = INVOICE_EXTENSIONS.join(",");

/** One row per file, so a 40-file batch reports per document rather than as a whole. */
function ResultRow({ result }) {
  const { filename, status, invoice, error } = result;

  if (status === "error") {
    return (
      <li className="result-row is-error">
        <span className="result-name">{filename}</span>
        <span className="result-detail">{error}</span>
      </li>
    );
  }

  const warnings = invoice.warnings ?? [];
  return (
    <li className={warnings.length ? "result-row is-warn" : "result-row is-ok"}>
      <span className="result-name">{filename}</span>
      <span className="result-detail">
        {invoice.invoice_number ? <strong>{invoice.invoice_number}</strong> : "No number found"}
        {invoice.counterparty_gstin ? ` · ${invoice.counterparty_gstin}` : ""}
        {invoice.invoice_date ? ` · ${dateLabel(invoice.invoice_date)}` : ""}
        {/* The derived value, not the raw column — an invoice whose total was
            printed as a bare "Total:" leaves that column at zero, and this row
            is the first thing anyone sees after an upload. */}
        {` · ${rupees(invoice.invoice_value)}`}
      </span>
      {warnings.length > 0 && (
        <ul className="result-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <Link to={`/invoices/${invoice.id}`} className="result-link">
        Review
      </Link>
    </li>
  );
}

export default function UploadPage() {
  usePageTitle("Upload");
  const [invoiceType, setInvoiceType] = useState("purchase");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // {done, total, current} while a batch is in flight, null otherwise.
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  async function uploadFiles(files) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    // One batch at a time. The file picker says so by being `disabled` while a
    // batch runs; the dropzone had no such guard, so a second drop started a
    // second loop alongside the first.
    //
    // That breaks the thing the loop below is deliberately sequential for:
    // each upload costs a model call and the free tier rate-limits a burst, so
    // two batches running at once is how forty invoices become forty
    // heuristic-only extractions — the exact outcome the sequencing exists to
    // avoid. It also left the page lying about itself, because whichever loop
    // finished first cleared `busy` and took the spinner down while the other
    // was still uploading.
    //
    // Refused out loud rather than ignored: a dropped batch that simply does
    // nothing is indistinguishable from a broken dropzone.
    if (busy) {
      setError("Still extracting the last batch. Wait for it to finish, then drop these.");
      return;
    }

    // Checked here rather than left to the server so an oversized scan is
    // refused before it is read off disk and pushed over a phone connection.
    // A rejected file is reported in the same result list as a failed one:
    // dropping it silently is how a 40-file batch quietly becomes 38.
    const { accepted, rejected } = partitionFiles(list);
    if (rejected.length > 0) {
      setResults((prev) => [
        ...rejected.map(({ file, error: reason }) => ({
          filename: file.name,
          status: "error",
          error: reason,
        })),
        ...prev,
      ]);
    }
    if (accepted.length === 0) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setBusy(true);
    setError("");
    // Sequential rather than concurrent: each upload costs a model call, and
    // the free tier rate-limits a burst — which would turn a 40-file batch
    // into 40 heuristic-only extractions.
    for (const [index, file] of accepted.entries()) {
      // Named rather than counted alone: on a long batch the file that is
      // taking the time is the one the user wants to know about.
      setProgress({ done: index, total: accepted.length, current: file.name });
      try {
        const response = await api.uploadInvoice(file, invoiceType);
        setResults((prev) => [
          { filename: file.name, status: "ok", invoice: response.invoice },
          ...prev,
        ]);
      } catch (err) {
        setResults((prev) => [
          { filename: file.name, status: "error", error: err.message },
          ...prev,
        ]);

        // The monthly allowance is spent, and it does not come back partway
        // through a batch. Every remaining file would get the same 402, so
        // carrying on means thirty more round trips that cannot succeed —
        // spending the upload rate limit on them, and burying the one thing
        // the user needs to read under thirty identical copies of it.
        //
        // Stopped rather than silently skipped: the files that were not
        // attempted are listed as such, because a batch that quietly shrinks
        // from forty to twelve is how an invoice goes missing from a return.
        if (err.status === 402) {
          const remaining = accepted.slice(index + 1);
          // The banner says only what the rows cannot: how much of the batch
          // never went. Repeating the server's message here as well would put
          // it on screen twice for a single-file upload, where the row already
          // carries it in full.
          if (remaining.length > 0) {
            setResults((prev) => [
              ...remaining.map((skipped) => ({
                filename: skipped.name,
                status: "error",
                error: "Not uploaded — the monthly allowance ran out before this file.",
              })),
              ...prev,
            ]);
            setError(
              `The monthly allowance ran out. ${remaining.length} file(s) were not ` +
                "uploaded. Upgrade the plan or try again next month.",
            );
          }
          break;
        }
      }
    }
    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    uploadFiles(event.dataTransfer.files);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Upload invoices</h1>
          <p className="muted">
            PDF, photo, CSV or Excel. Fields are extracted automatically; anything unclear is
            flagged for review rather than dropped.
          </p>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Locked while a batch runs, like the file picker beside it.
          `uploadFiles` reads the type once, at the top, and the loop under it
          is deliberately sequential — so a batch is uploaded under the type it
          was started with, and forty invoices take minutes to get through.
          Left live, the radio moved while the loop went on sending the old
          value: the screen said Sales and the remaining thirty files were still
          being booked as purchases.

          Which is the direction that costs money. A sales invoice booked as a
          purchase claims input credit on the business's own output tax — an
          over-claim with interest and a penalty on it — and nothing downstream
          re-reads the document to catch it, because every screen shows the type
          that was stored.

          Disabled rather than made to take effect mid-batch: splitting one drop
          across two types by how fast the user clicked is not a thing anyone
          can predict, and the honest unit here is the batch. The legend says so
          while it is held. */}
      <fieldset className="type-toggle" disabled={busy}>
        <legend>
          Invoice type
          {busy && <span className="muted small"> · locked until the batch finishes</span>}
        </legend>
        {[
          { value: "purchase", label: "Purchase (claim ITC)" },
          { value: "sales", label: "Sales (feeds GSTR-1)" },
        ].map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="invoice_type"
              value={option.value}
              checked={invoiceType === option.value}
              onChange={(e) => setInvoiceType(e.target.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div
        className={dragging ? "dropzone is-dragging" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          // Not while a batch is running: highlighting invites a drop that is
          // about to be refused.
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <p>Drag invoices here, or</p>
        <label htmlFor="invoice-file" className="btn btn-primary">
          Choose files
        </label>
        <input
          id="invoice-file"
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => uploadFiles(e.target.files)}
        />
        <p className="muted small">
          Up to {MAX_UPLOAD_MB} MB per file · {INVOICE_EXTENSIONS.join(" ")}
        </p>
      </div>

      {busy && (
        <p className="muted upload-progress" role="status">
          <Spinner label="Extracting" />
          {progress
            ? `Extracting ${progress.done + 1} of ${progress.total} — ${progress.current}`
            : "Extracting…"}
        </p>
      )}

      {results.length > 0 && (
        <section className="panel">
          <h2>Results</h2>
          <ul className="result-list">
            {results.map((result, index) => (
              <ResultRow key={`${result.filename}-${index}`} result={result} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
