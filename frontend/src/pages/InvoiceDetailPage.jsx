import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonPanel } from "../components/Skeleton";
import { usePageTitle } from "../hooks/usePageTitle";
import { api, isAbortError } from "../lib/api";
import { dateLabel, rupees, statusLabel, statusTone } from "../lib/format";
import { invoiceDraftErrors } from "../lib/validate";

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
  // Which fields have been left, so a half-typed GSTIN is not marked wrong on
  // the third keystroke. A submit attempt marks everything touched.
  const [touched, setTouched] = useState({});
  // The invoice the page is showing, readable from a callback that has been
  // waiting on the network. `id` closed over when a write went out is the
  // invoice it was *for*, which is the one thing an in-flight write must not
  // assume the URL still names.
  const shownId = useRef(id);

  const { errors, warnings } = invoiceDraftErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;

  // Named by invoice number once it arrives, so browser history and the tab
  // strip distinguish the four invoices someone has open while reconciling.
  // Until then the title is just "Invoice" rather than a number the user has
  // never seen — the row id in the URL is not one they would recognise.
  usePageTitle(invoice?.invoice_number ? `Invoice ${invoice.invoice_number}` : "Invoice");

  // The form is a working copy of the invoice, so every path that replaces the
  // invoice has to replace the copy with it. Only `load` used to, which made
  // re-extraction destructive: the panel showed the newly parsed fields while
  // the inputs still held the ones extraction had just replaced, and saving
  // from there wrote the stale copy back over them. Two ordinary clicks —
  // re-extract, then save — and the re-extraction was undone.
  //
  // Saving has a milder version of the same gap. The server settles what it
  // stores (money lands on the column's two decimal places, a date comes back
  // in the API's format), so a draft left as typed disagrees with the invoice
  // beside it, is re-sent as a change on the next save, and reports
  // "Corrections saved" for an edit nobody made.
  const adopt = useCallback((data) => {
    setInvoice(data);
    setDraft(
      Object.fromEntries(EDITABLE.map(({ field }) => [field, data[field] ?? ""])),
    );
  }, []);

  const load = useCallback(async ({ signal } = {}) => {
    setError("");
    try {
      adopt(await api.getInvoice(id, { signal }));
    } catch (err) {
      // A superseded request describes an invoice this page has already moved
      // off. Its answer must not be adopted, and its rejection is this app
      // cancelling itself rather than anything to tell the user about.
      if (isAbortError(err)) return;
      setError(err.message);
    }
  }, [id, adopt]);

  // The id in the URL is the only thing naming which invoice this is, and
  // React Router keeps one component instance across a change to it. So the
  // next invoice does not arrive on a fresh page — it arrives on the previous
  // invoice's, and until it lands every control on that page writes to the new
  // id: `handleSave` diffs the form against the invoice beside it and PATCHes
  // the difference to `id`. Two clicks in the invoice list, one slow response,
  // and one invoice's GSTIN, dates and figures were saved onto another.
  //
  // Clearing first is what closes that: with no invoice there is no form and
  // no save button, so the page shows its loading placeholder until the
  // invoice the URL actually names has arrived. The abort handles the other
  // half — answers do not come back in the order they were sent, so without it
  // a slow 42 landing after 43 would put 42 back on 43's page.
  useEffect(() => {
    const controller = new AbortController();
    shownId.current = id;
    setInvoice(null);
    setDraft({});
    setTouched({});
    setNotice("");
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load, id]);

  async function handleSave(event) {
    event.preventDefault();
    const target = id;
    // Everything becomes touched on submit, so a field the user never entered
    // still shows why the save did not go through.
    setTouched(Object.fromEntries(EDITABLE.map(({ field }) => [field, true])));
    if (hasErrors) {
      setNotice("");
      setError("Fix the highlighted fields before saving.");
      return;
    }

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
      const saved = await api.updateInvoice(target, changes);
      // Clearing the form on the way in stops one invoice's values being sent
      // to another's id. This is the other direction: the PATCH answers with
      // the invoice it wrote, and adopting it makes the form a working copy of
      // that invoice again — while the URL, and every control on the page,
      // name the one opened since. The next save would then PATCH the first
      // invoice's GSTIN, dates and figures onto the second.
      if (shownId.current !== target) return;
      adopt(saved);
      setNotice("Corrections saved.");
    } catch (err) {
      // A failure belongs to the invoice it was for. Left unguarded it banners
      // the page of an invoice that is loading, or has loaded, perfectly well.
      if (shownId.current !== target) return;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReparse() {
    // Re-extraction is a second model pass over the stored file, so it is the
    // slowest write this page makes and the one most likely to still be
    // running when the user moves on to the next invoice.
    const target = id;
    setBusy(true);
    setError("");
    try {
      const reparsed = await api.reparseInvoice(target);
      if (shownId.current !== target) return;
      adopt(reparsed);
      setNotice("Re-extracted from the stored file.");
    } catch (err) {
      if (shownId.current !== target) return;
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
        {!error && <SkeletonPanel lines={6} label="Loading invoice" />}
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

        {warnings.length > 0 && (
          <div className="banner banner-warn" role="status">
            <p className="small">
              These look wrong, but they will save — check them against the paper first.
            </p>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSave} className="edit-grid" noValidate>
          {EDITABLE.map(({ field, label, type }) => {
            // Shown only once the field has been left or a save attempted:
            // marking a GSTIN invalid while it is still being typed is noise.
            const message = touched[field] ? errors[field] : "";
            // The error sits outside the <label>, and the label is tied to the
            // input by htmlFor rather than by wrapping it. Nesting the message
            // inside the label would fold it into the input's accessible name
            // — the field would announce as "CGST CGST cannot be negative",
            // and then the same text again from aria-describedby.
            return (
              <div key={field} className={message ? "field is-invalid" : "field"}>
                <label htmlFor={field}>{label}</label>
                <input
                  id={field}
                  type={type ?? "text"}
                  step={type === "number" ? "0.01" : undefined}
                  value={draft[field] ?? ""}
                  aria-invalid={message ? true : undefined}
                  // Points at the message so a screen reader reads the reason
                  // with the field rather than leaving it as unattached text.
                  aria-describedby={message ? `${field}-error` : undefined}
                  onBlur={() => setTouched((prev) => ({ ...prev, [field]: true }))}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                />
                {message && (
                  <span className="field-error" id={`${field}-error`} role="alert">
                    {message}
                  </span>
                )}
              </div>
            );
          })}
          <div className="edit-actions">
            {/* Not disabled on invalid input. A disabled button gives no
                reason it is disabled; letting the submit through is what
                surfaces the per-field messages and the banner. */}
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
            {/* What the return will declare this invoice at. The editable
                "Total value" field above stays the raw column, because that is
                what a reviewer corrects and what validation cross-foots — but
                the column is zero whenever the extractor found no grand-total
                label, and this panel is where someone checks the figures
                against the paper. */}
            <dd>{rupees(invoice.invoice_value)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
