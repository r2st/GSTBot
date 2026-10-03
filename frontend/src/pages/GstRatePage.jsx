import { Link, useParams } from "react-router-dom";
import ToolsNav from "../components/ToolsNav";
import ShareButtons from "../components/ShareButtons";
import { usePageTitle } from "../hooks/usePageTitle";
import { findProductRate, searchHSN } from "../lib/hsnData";

function capitalize(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GstRatePage() {
  const { product } = useParams();
  const display = capitalize((product || "").replace(/-/g, " "));
  usePageTitle(`GST Rate on ${display} — HSN Code & Tax Breakdown`);

  const match = findProductRate(product);
  const related = match ? searchHSN(match.product, { limit: 5 }) : searchHSN(display, { limit: 5 });

  return (
    <div className="tool-page">
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <h1 className="tool-title">GST Rate on {display}</h1>

          {match ? (
            <div className="calc-card">
              <div className="rate-hero">
                <div className="rate-big">{match.rate}%</div>
                <p className="rate-label">GST Rate</p>
              </div>
              <dl className="lookup-details">
                <dt>Product</dt>
                <dd>{display}</dd>
                <dt>HSN/SAC Code</dt>
                <dd className="lookup-gstin-value">{match.hsn}</dd>
                <dt>GST Rate</dt>
                <dd>{match.rate}%</dd>
                {!match.interstate && match.rate > 0 && (
                  <>
                    <dt>CGST</dt>
                    <dd>{match.rate / 2}%</dd>
                    <dt>SGST</dt>
                    <dd>{match.rate / 2}%</dd>
                  </>
                )}
              </dl>
              <p className="rate-calc-link">
                <Link to={`/calculator?rate=${match.rate}`}>
                  Calculate tax on {display} →
                </Link>
              </p>
              <ShareButtons
                path={`/gst-rate/${product}`}
                text={`GST on ${display} is ${match.rate}% (HSN ${match.hsn}). Check any product's GST rate on DoAide GST`}
              />
            </div>
          ) : (
            <div className="calc-card">
              <p>We don't have a specific rate listing for "{display}" yet.</p>
              <p>
                <Link to="/hsn">Search the HSN code directory →</Link>
              </p>
              <p>
                <Link to="/calculator">Use the GST calculator →</Link>
              </p>
            </div>
          )}

          {related.length > 0 && (
            <section className="tool-info">
              <h2>Related HSN Codes</h2>
              <table className="hsn-table">
                <thead>
                  <tr>
                    <th>HSN Code</th>
                    <th>Description</th>
                    <th>GST Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {related.map((item) => (
                    <tr key={item.code}>
                      <td className="hsn-code">{item.code}</td>
                      <td>{item.desc}</td>
                      <td className="hsn-rate">{item.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
