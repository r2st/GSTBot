import { useCallback, useEffect, useState } from "react";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonTable } from "../components/Skeleton";
import { api } from "../lib/api";
import { dateLabel, periodLabel } from "../lib/format";

const RISK = {
  low: { label: "Low risk", tone: "good" },
  medium: { label: "Medium risk", tone: "warn" },
  high: { label: "High risk", tone: "bad" },
  unknown: { label: "Unrated", tone: "neutral" },
};

const COMPONENT_LABELS = {
  match_rate: "Match rate",
  timeliness: "Filing timeliness",
  consistency: "Consistency",
  recency: "Recency",
};

function RiskChip({ level }) {
  const meta = RISK[level] ?? RISK.unknown;
  return <span className={`chip chip-${meta.tone}`}>{meta.label}</span>;
}

/** A 0-100 bar. Unscored components render as a dash, never as an empty bar. */
function ScoreMeter({ value }) {
  if (value === null || value === undefined) {
    return <span className="muted">No evidence yet</span>;
  }
  return (
    <div className="meter" role="img" aria-label={`${Math.round(value)} out of 100`}>
      <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function SupplierDetail({ supplier, onClose }) {
  const detail = supplier.score_detail;
  return (
    <section className="panel">
      <div className="page-head">
        <div>
          <h2>{supplier.legal_name || supplier.trade_name || supplier.gstin}</h2>
          <p className="muted small">{supplier.gstin}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="kv">
        <div>
          <span className="muted">Score</span>
          <strong>{detail.score ?? "—"}</strong>
        </div>
        <div>
          <span className="muted">Confidence</span>
          <strong>{(detail.confidence * 100).toFixed(0)}%</strong>
        </div>
        <div>
          <span className="muted">Evidence</span>
          <strong>
            {detail.invoices_observed} invoices, {detail.periods_observed} periods
          </strong>
        </div>
        <div>
          <span className="muted">Suggested provision</span>
          <strong>{detail.recommended_provision_pct}%</strong>
        </div>
      </div>

      <div className={detail.score !== null && detail.score < 60 ? "banner banner-warn" : "banner banner-neutral"} role="status">
        {detail.recommendation}
      </div>

      <h3>How the score is made up</h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Weight</th>
              <th scope="col">Score</th>
              <th scope="col">What it measures</th>
            </tr>
          </thead>
          <tbody>
            {detail.components.map((component) => (
              <tr key={component.name}>
                <td>{COMPONENT_LABELS[component.name] ?? component.name}</td>
                <td className="numeric">{component.weight}%</td>
                <td>
                  <ScoreMeter value={component.score} />
                </td>
                <td className="muted small">{component.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Exposure right now</h3>
      <div className="kv">
        <div>
          <span className="muted">Invoices</span>
          <strong>{supplier.exposure.invoice_count}</strong>
        </div>
        <div>
          <span className="muted">Credit at risk</span>
          <strong>₹{supplier.exposure.tax_at_risk}</strong>
        </div>
        <div>
          <span className="muted">Unpaid</span>
          <strong>{supplier.exposure.unpaid_count}</strong>
        </div>
      </div>

      {detail.observations.length > 0 && (
        <>
          <h3>Filing history</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col" className="numeric">Matched</th>
                  <th scope="col" className="numeric">Mismatched</th>
                  <th scope="col" className="numeric">Never filed</th>
                  <th scope="col">Filed</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.observations].reverse().map((observation) => (
                  <tr key={observation.period}>
                    <td>{periodLabel(observation.period)}</td>
                    <td className="numeric">{observation.matched}</td>
                    <td className="numeric">{observation.mismatched}</td>
                    <td className="numeric">{observation.missing}</td>
                    <td>
                      {observation.filing_delay_days === null ||
                      observation.filing_delay_days === undefined
                        ? "—"
                        : observation.filing_delay_days > 0
                          ? `${observation.filing_delay_days} days late`
                          : "On time"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function SuppliersPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (params) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listSuppliers(params);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ risk_level: risk, search });
  }, [load, risk, search]);

  async function handleSelect(id) {
    setError("");
    try {
      setSelected(await api.getSupplier(id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRescore() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.rescoreSuppliers();
      setNotice(`Rescored ${result.rescored} supplier(s)`);
      await load({ risk_level: risk, search });
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Suppliers</h1>
          <p className="muted">
            How reliably each supplier files, built from your own reconciliations — and
            how much of their credit is worth providing against.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={handleRescore}
        >
          {busy ? "Working…" : "Rescore all"}
        </button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      {notice && (
        <div className="banner banner-good" role="status">
          {notice}
        </div>
      )}

      <div className="filters">
        <label className="filter-search">
          <span className="visually-hidden">Search suppliers</span>
          <input
            type="search"
            placeholder="Search by name or GSTIN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-row">
          {[
            ["", "All"],
            ["high", "High risk"],
            ["medium", "Medium"],
            ["low", "Low"],
            ["unknown", "Unrated"],
          ].map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              className={risk === value ? "chip chip-neutral is-active" : "chip chip-neutral"}
              onClick={() => setRisk(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selected && <SupplierDetail supplier={selected} onClose={() => setSelected(null)} />}

      <section className="panel">
        <h2>{total} supplier{total === 1 ? "" : "s"}</h2>
        {loading ? (
          <SkeletonTable rows={6} columns={5} label="Loading suppliers" />
        ) : items.length === 0 ? (
          <p className="muted">
            No suppliers yet. They are created as purchase invoices are parsed, and scored
            once a period has been reconciled.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Risk</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Score</th>
                  <th scope="col" className="numeric">Matched</th>
                  <th scope="col" className="numeric">Never filed</th>
                  <th scope="col">Last filed</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {items.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <RiskChip level={supplier.risk_level} />
                    </td>
                    <td>
                      <div>{supplier.legal_name || supplier.trade_name || "—"}</div>
                      <div className="muted small">{supplier.gstin}</div>
                    </td>
                    <td>
                      <ScoreMeter value={supplier.compliance_score} />
                    </td>
                    <td className="numeric">{supplier.matched_invoices}</td>
                    <td className="numeric">{supplier.missing_invoices}</td>
                    <td>
                      {supplier.last_filed_period
                        ? periodLabel(supplier.last_filed_period)
                        : supplier.last_seen_at
                          ? dateLabel(supplier.last_seen_at)
                          : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleSelect(supplier.id)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
