import { useMemo, useState } from "react";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import EmailCapture from "../components/EmailCapture";
import RelatedTools from "../components/RelatedTools";
import SeoHead from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatINR } from "../lib/gstCalc";

const SERVICE_TYPES = [
  { key: "legal", label: "Legal services (advocate/arbitral tribunal)", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "gta", label: "Goods Transport Agency (GTA)", rate: 5, section: "Section 9(3) — Notification 13/2017" },
  { key: "gta_18", label: "GTA (opting for 12% forward charge)", rate: 0, section: "Not applicable — GTA has opted for forward charge", forward: true },
  { key: "sponsor", label: "Sponsorship services", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "director", label: "Directors' fees / sitting fees", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "insurance_agent", label: "Insurance agent services", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "recovery_agent", label: "Recovery agent services", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "author", label: "Author/music composer/photographer", rate: 18, section: "Section 9(3) — Notification 13/2017" },
  { key: "import_service", label: "Import of services", rate: 18, section: "Section 5(3) of IGST Act" },
  { key: "unregistered", label: "Supply from unregistered person (URD)", rate: 18, section: "Section 9(4) — applicable for specified categories" },
  { key: "renting", label: "Renting of residential property (by registered person)", rate: 18, section: "Section 9(3) — Notification 05/2022" },
  { key: "security", label: "Security services (by individual/HUF/partnership)", rate: 18, section: "Section 9(3) — Notification 29/2018" },
];

const TOOL_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GST Reverse Charge Calculator",
  url: "https://gst.doaide.com/reverse-charge",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Reverse Charge Mechanism (RCM) under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Under RCM, GST liability shifts from supplier to recipient for specified goods and services under Section 9(3) and Section 9(4) of the CGST Act.",
      },
    },
    {
      "@type": "Question",
      name: "Can I claim ITC on GST paid under Reverse Charge?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, the recipient can claim ITC on GST paid under reverse charge if registered under GST, goods/services are used for business purposes, and they have a valid tax invoice or self-invoice.",
      },
    },
    {
      "@type": "Question",
      name: "Which services attract Reverse Charge under GST?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Legal services from advocates, GTA, sponsorship, directors' fees, insurance/recovery agents, import of services, residential renting by registered persons, and security.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to pay RCM on GTA services?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "If the GTA charges 5% GST, the recipient pays under reverse charge. If the GTA opts for 12% forward charge, the recipient does not pay RCM.",
      },
    },
    {
      "@type": "Question",
      name: "How is GST under RCM paid and reported?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GST under reverse charge must be paid in cash (ITC cannot be used). Report in GSTR-3B Table 3.1(d) for liability and Table 4(A)(2) or 4(A)(3) for ITC. A self-invoice must be issued by the recipient.",
      },
    },
  ],
};

const BREADCRUMBS = [
  { name: "Home", url: "https://gst.doaide.com" },
  { name: "Reverse Charge Calculator" },
];

export default function ReverseChargePage() {
  usePageTitle("GST Reverse Charge Calculator — RCM Liability Calculator");

  const [serviceType, setServiceType] = useState("legal");
  const [amount, setAmount] = useState("");
  const [interstate, setInterstate] = useState(false);
  const [customRate, setCustomRate] = useState("");

  const selected = SERVICE_TYPES.find((s) => s.key === serviceType);

  const result = useMemo(() => {
    if (!selected) return null;
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return null;

    if (selected.forward) {
      return {
        applicable: false,
        reason: selected.section,
        gst: 0, cgst: 0, sgst: 0, igst: 0, total: value,
      };
    }

    const rate = customRate !== "" ? parseFloat(customRate) : selected.rate;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;

    const gst = Math.round(value * rate) / 100;
    const cgst = interstate ? 0 : Math.round((gst / 2) * 100) / 100;
    const sgst = interstate ? 0 : Math.round((gst - cgst) * 100) / 100;
    const igst = interstate ? gst : 0;

    return {
      applicable: true,
      reason: selected.section,
      rate,
      gst,
      cgst,
      sgst,
      igst,
      total: Math.round((value + gst) * 100) / 100,
    };
  }, [serviceType, amount, interstate, customRate, selected]);

  return (
    <div className="tool-page">
      <SeoHead
        title="GST Reverse Charge Calculator — RCM Liability Calculator"
        description="Calculate GST liability under Reverse Charge Mechanism (RCM). Select service type and enter amount to get instant CGST, SGST, IGST breakdown. Free, no login required."
        path="/reverse-charge"
        jsonLd={[TOOL_SCHEMA, FAQ_SCHEMA]}
        breadcrumbs={BREADCRUMBS}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">Reverse Charge Calculator</h1>
          <p className="tool-subtitle">
            Calculate your GST liability under Reverse Charge Mechanism (RCM). No sign-up required.
          </p>

          <div className="calc-card">
            <label className="calc-label">
              Service / Supply Type
              <select
                className="calc-select"
                value={serviceType}
                onChange={(e) => { setServiceType(e.target.value); setCustomRate(""); }}
              >
                {SERVICE_TYPES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="calc-label">
              Taxable Value (₹)
              <input
                type="number"
                className="calc-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter taxable value of service"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
              />
            </label>

            {selected && !selected.forward && (
              <label className="calc-label">
                GST Rate (%) — default {selected.rate}%
                <input
                  type="number"
                  className="calc-input"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder={String(selected.rate)}
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                />
              </label>
            )}

            <label className="calc-checkbox-label">
              <input
                type="checkbox"
                checked={interstate}
                onChange={(e) => setInterstate(e.target.checked)}
              />
              Interstate supply (IGST instead of CGST+SGST)
            </label>

            {result && (
              <div className="calc-result" aria-live="polite">
                <div className="calc-result-row calc-total" style={{ color: result.applicable ? "#f59e42" : "#34d399" }}>
                  <span>Reverse Charge</span>
                  <strong>{result.applicable ? "Applicable" : "Not Applicable"}</strong>
                </div>
                <p style={{ margin: "0.5rem 0", fontSize: "0.85rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  {result.reason}
                </p>

                {result.applicable && (
                  <>
                    <div className="calc-result-row">
                      <span>Taxable Value</span>
                      <strong>{formatINR(parseFloat(amount))}</strong>
                    </div>
                    {interstate ? (
                      <div className="calc-result-row">
                        <span>IGST @ {result.rate}%</span>
                        <strong>{formatINR(result.igst)}</strong>
                      </div>
                    ) : (
                      <>
                        <div className="calc-result-row">
                          <span>CGST @ {result.rate / 2}%</span>
                          <strong>{formatINR(result.cgst)}</strong>
                        </div>
                        <div className="calc-result-row">
                          <span>SGST @ {result.rate / 2}%</span>
                          <strong>{formatINR(result.sgst)}</strong>
                        </div>
                      </>
                    )}
                    <div className="calc-result-row calc-total">
                      <span>Total RCM Liability</span>
                      <strong>{formatINR(result.gst)}</strong>
                    </div>
                  </>
                )}

                <div className="calc-result-actions">
                  <ShareButtons
                    path="/reverse-charge"
                    text={`GST Reverse Charge: ${result.applicable ? formatINR(result.gst) + " payable" : "Not applicable"} — calculated free on DoAide GST`}
                  />
                </div>
              </div>
            )}
          </div>

          <EmailCapture
            source="reverse-charge"
            heading="Stay updated on RCM changes"
            subtext="Get notified when reverse charge rules are updated — free email alerts."
            buttonLabel="Notify Me"
            compact
          />

          <section className="tool-info">
            <h2>Reverse Charge Mechanism (RCM) Under GST</h2>
            <p>
              Under the normal GST mechanism, the supplier collects and remits GST. Under the
              Reverse Charge Mechanism (RCM), the recipient of goods or services is liable to
              pay GST instead of the supplier. This applies to specified categories under
              Section 9(3) and 9(4) of the CGST Act.
            </p>
            <h3>Key RCM Services</h3>
            <ul>
              <li><strong>Legal services:</strong> Any service by an advocate or arbitral tribunal — 18% GST payable by recipient</li>
              <li><strong>GTA services:</strong> Goods Transport Agency — 5% under RCM (or 12% forward charge if GTA opts)</li>
              <li><strong>Directors&#39; fees:</strong> Services by a director to the company — 18% under RCM</li>
              <li><strong>Sponsorship:</strong> Any sponsorship service — 18% under RCM</li>
              <li><strong>Import of services:</strong> All imported services — IGST under RCM</li>
              <li><strong>Residential rent:</strong> Renting of residential property by a registered person — 18% under RCM</li>
              <li><strong>Security services:</strong> By individual/HUF/partnership firm — 18% under RCM</li>
            </ul>
            <h3>ITC on RCM</h3>
            <ul>
              <li>GST paid under RCM is eligible for ITC if used for business purposes</li>
              <li>RCM liability must be paid in cash — ITC cannot be used for payment</li>
              <li>ITC can be claimed in the same month if self-invoice is issued</li>
              <li>Report in GSTR-3B Table 3.1(d) for liability and Table 4(A)(2)/(3) for ITC</li>
            </ul>
          </section>

          <section className="tool-info">
            <h2>Frequently Asked Questions</h2>

            <h3>What is Reverse Charge Mechanism (RCM) under GST?</h3>
            <p>
              Under RCM, the liability to pay GST shifts from the supplier to the recipient.
              This applies to specified goods and services listed in notifications under
              Section 9(3) and Section 9(4) of the CGST Act.
            </p>

            <h3>Can I claim ITC on GST paid under Reverse Charge?</h3>
            <p>
              Yes, you can claim ITC on RCM GST paid, provided you are registered under GST,
              the goods/services are for business use, and you have a valid tax invoice or
              self-invoice. The ITC can be claimed in the same return period.
            </p>

            <h3>Which services attract Reverse Charge under GST?</h3>
            <p>
              Key services include legal services (advocates), GTA, sponsorship, directors&apos;
              fees, insurance/recovery agent services, import of services, renting of
              residential property by registered persons, and security services from
              individuals/HUF/partnership firms.
            </p>

            <h3>Do I need to pay RCM on GTA services?</h3>
            <p>
              If the GTA charges 5% GST, the recipient pays under reverse charge. However,
              if the GTA opts to pay at 12% under forward charge (with ITC), the recipient
              does not need to pay under reverse charge.
            </p>

            <h3>How is GST under RCM paid and reported?</h3>
            <p>
              RCM GST must be paid in cash (cannot offset with ITC). Report liability in
              GSTR-3B Table 3.1(d) and claim ITC in Table 4(A)(2) or 4(A)(3). A self-invoice
              must be issued by the recipient for supplies from unregistered persons.
            </p>

            <h3>Is RCM applicable on all purchases from unregistered dealers?</h3>
            <p>
              No. Section 9(4) RCM on purchases from unregistered dealers applies only to
              specified categories of goods and services notified by the government, not to
              all purchases.
            </p>

            <h3>Do composition dealers need to pay RCM?</h3>
            <p>
              Yes, composition dealers are required to pay GST under reverse charge on
              applicable services. However, they cannot claim ITC on such payments since
              composition dealers are not eligible for ITC.
            </p>
          </section>

          <RelatedTools current="/reverse-charge" />
          <CrossProductLinks page="reverse-charge" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}
