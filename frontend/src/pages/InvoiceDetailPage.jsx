import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { api } from "../lib/api";
import { dateLabel, rupees, statusLabel, statusTone } from "../lib/format";

const EDITABLE = [
  { field: "counterparty_gstin", label: "Counterparty GSTIN" },
  { field: "counterparty_name", label: "Counterparty name" },
  { field: "invoice_number", label: "Invoice number" },
  { field: "invoice_date", label: "Invoice date", type: "date" },
  { field: "hsn_code", label: "HSN/SAC" },
  { field: "taxable_value", label: "Taxable value", type: "number" },
  { field: "cgst", label: "CGST", type: "number" },
  { field: "sgst", label: "SGST", type: "number" },
  { field: "igst", label: "IGST", type: "number" },
  { field: "cess", label: "Cess", type: "number" },
  { field: "total_value", label: "Total value", type: "number" },
];

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.getInvoice(id);
      setInvoice(data);
      setDraft(
        Object.fromEntries(EDITABLE.map(({ field }) => [field, data[field] ?? ""])),
      );
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Only changed fields are sent — the API leaves unmentioned fields
      // alone, so a blank one must not be transmitted as an empty string.
      const changes = {};
      for (const { field } of EDITABLE) {
        const next = draft[field];
        const current = invoice[field] ?? "";
        if (String(next) !== String(current)) changes[field] = next === "" ? null : next;
      }
      if (Object.keys(changes).length === 0) {
        setNotice("Nothing changed.");
        return;
      }
      setInvoice(await api.updateInvoice(id, changes));
      setNotice("Corrections saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReparse() {
    setBusy(true);
    setError("");
    try {
      setInvoice(await api.reparseInvoice(id));
      setNotice("Re-extracted from the stored file.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Remove this invoice from your books?")) return;
    try {
      await api.deleteInvoice(id);
      navigate("/invoices");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!invoice) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        {!error && <p className="muted">Loading invoice…</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{invoice.invoice_number || `Invoice #${invoice.id}`}</h1>
          <p className="muted">
            <span className={`chip chip-${statusTone(invoice.status)}`}>
              {statusLabel(invoice.status)}
            </span>{" "}
            · {invoice.invoice_type} · {dateLabel(invoice.invoice_date)}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={handleReparse} disabled={busy}>
            Re-extract
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      {notice && (
        <div className="banner banner-good" role="status">
          {notice}
        </div>
      )}

      {invoice.warnings?.length > 0 && (
        <section className="panel panel-warn">
          <h2>Needs attention</h2>
          <ul>
            {invoice.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Extracted fields</h2>
        <p className="muted small">
          Read by {invoice.parsed_with ?? "unknown"}
          {invoice.extraction_confidence != null &&
            ` · confidence ${(invoice.extraction_confidence * 100).toFixed(0)}%`}
          . Correct anything wrong — your edit is what gets filed.
        </p>

        <form onSubmit={handleSave} className="edit-grid">
          {EDITABLE.map(({ field, label, type }) => (
            <label key={field}>
              <span>{label}</span>
              <input
                type={type ?? "text"}
                step={type === "number" ? "0.01" : undefined}
                value={draft[field] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
              />
            </label>
          ))}
          <div className="edit-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save corrections"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Totals</h2>
        <dl className="kv">
          <div>
            <dt>Taxable value</dt>
            <dd>{rupees(invoice.taxable_value)}</dd>
          </div>
          <div>
            <dt>CGST</dt>
            <dd>{rupees(invoice.cgst)}</dd>
          </div>
          <div>
            <dt>SGST</dt>
            <dd>{rupees(invoice.sgst)}</dd>
          </div>
          <div>
            <dt>IGST</dt>
            <dd>{rupees(invoice.igst)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{rupees(invoice.total_value)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
