import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { api } from "../lib/api";
import { dateLabel, rupees, statusLabel, statusTone } from "../lib/format";

const PAGE_SIZE = 25;

export default function InvoicesPage() {
  const [filters, setFilters] = useState({ invoice_type: "", status: "", search: "" });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.listInvoices({ ...filters, limit: PAGE_SIZE, offset }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    load();
  }, [load]);

  function updateFilter(field, value) {
    setOffset(0); // A new filter means a new result set, so page 1.
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Invoices</h1>
        <Link to="/upload" className="btn btn-primary">
          Upload
        </Link>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="filters">
        <label>
          <span>Type</span>
          <select
            value={filters.invoice_type}
            onChange={(e) => updateFilter("invoice_type", e.target.value)}
          >
            <option value="">All</option>
            <option value="purchase">Purchase</option>
            <option value="sales">Sales</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="">All</option>
            <option value="parsed">Parsed</option>
            <option value="matched">Matched</option>
            <option value="mismatched">Mismatched</option>
            <option value="missing_in_2b">Missing in 2B</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="filter-search">
          <span>Search</span>
          <input
            type="search"
            placeholder="Invoice number or party"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
        </label>
      </div>

      {loading && !data ? (
        <p className="muted">Loading invoices…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No invoices yet.</p>
          <Link to="/upload" className="btn btn-primary">
            Upload your first invoice
          </Link>
        </div>
      ) : (
        <>
          <table className="table table-invoices">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Party</th>
                <th scope="col">Date</th>
                <th scope="col">Taxable</th>
                <th scope="col">Tax</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((invoice) => {
                const tax =
                  Number(invoice.cgst) +
                  Number(invoice.sgst) +
                  Number(invoice.igst) +
                  Number(invoice.cess);
                return (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number || `#${invoice.id}`}
                      </Link>
                      <span className="row-sub">{invoice.invoice_type}</span>
                    </td>
                    <td>
                      {invoice.counterparty_name || "—"}
                      <span className="row-sub">{invoice.counterparty_gstin || "No GSTIN"}</span>
                    </td>
                    <td>{dateLabel(invoice.invoice_date)}</td>
                    <td className="num">{rupees(invoice.taxable_value)}</td>
                    <td className="num">{rupees(tax)}</td>
                    <td className="num">{rupees(invoice.total_value)}</td>
                    <td>
                      <span className={`chip chip-${statusTone(invoice.status)}`}>
                        {statusLabel(invoice.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="pager">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <span className="muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
