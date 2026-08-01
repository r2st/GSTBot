import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { api } from "../lib/api";
import { dateLabel, rupees } from "../lib/format";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt,.csv,.xlsx,.xls";

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
        {` · ${rupees(invoice.total_value)}`}
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
  const [invoiceType, setInvoiceType] = useState("purchase");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function uploadFiles(files) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    setBusy(true);
    setError("");
    // Sequential rather than concurrent: each upload costs a model call, and
    // the free tier rate-limits a burst — which would turn a 40-file batch
    // into 40 heuristic-only extractions.
    for (const file of list) {
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
      }
    }
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

      <fieldset className="type-toggle">
        <legend>Invoice type</legend>
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
          setDragging(true);
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
        <p className="muted small">Up to 15 MB per file.</p>
      </div>

      {busy && <p className="muted" role="status">Extracting…</p>}

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
