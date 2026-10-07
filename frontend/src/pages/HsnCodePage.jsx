import { Link, useParams } from "react-router-dom";
import Breadcrumb from "../components/Breadcrumb";
import CrossProductLinks from "../components/CrossProductLinks";
import DoAideFooter from "../components/DoAideFooter";
import RelatedTools from "../components/RelatedTools";
import SeoHead, { BASE_URL } from "../components/SeoHead";
import ShareButtons from "../components/ShareButtons";
import ToolsNav from "../components/ToolsNav";
import { usePageTitle } from "../hooks/usePageTitle";
import { getByCode, searchHSN } from "../lib/hsnData";
import { formatINR } from "../lib/gstCalc";

const TOP_HSN_META = {
  "5208": { title: "HSN Code 5208 — Woven Cotton Fabrics", keywords: "cotton fabric, cotton cloth, woven cotton" },
  "8471": { title: "HSN Code 8471 — Computers & Data Processing Machines", keywords: "computer, laptop, desktop, server" },
  "3004": { title: "HSN Code 3004 — Medicaments & Pharmaceutical Products", keywords: "medicine, drugs, pharmaceutical, tablets, capsules" },
  "8517": { title: "HSN Code 8517 — Telephone Sets & Smartphones", keywords: "mobile phone, smartphone, telephone, handset" },
  "7210": { title: "HSN Code 7210 — Steel Sheets (Hot/Cold Rolled)", keywords: "steel sheet, galvanized steel, HR coil, CR coil" },
  "8703": { title: "HSN Code 8703 — Motor Cars & Vehicles", keywords: "car, SUV, sedan, motor vehicle, automobile" },
  "6109": { title: "HSN Code 6109 — T-Shirts & Vests (Knitted)", keywords: "t-shirt, vest, singlet, knitted garment" },
  "6203": { title: "HSN Code 6203 — Men's Suits, Trousers & Shorts", keywords: "trousers, pants, shorts, men's garments, jeans" },
  "8528": { title: "HSN Code 8528 — Monitors, Projectors & Televisions", keywords: "television, TV, monitor, projector, display" },
  "2523": { title: "HSN Code 2523 — Portland Cement", keywords: "cement, portland cement, construction material" },
  "0901": { title: "HSN Code 0901 — Coffee", keywords: "coffee, coffee beans, roasted coffee, instant coffee" },
  "0902": { title: "HSN Code 0902 — Tea", keywords: "tea, green tea, black tea, tea leaves" },
  "1006": { title: "HSN Code 1006 — Rice", keywords: "rice, basmati, paddy, polished rice" },
  "1701": { title: "HSN Code 1701 — Sugar (Cane or Beet)", keywords: "sugar, cane sugar, beet sugar, refined sugar" },
  "3401": { title: "HSN Code 3401 — Soap & Washing Preparations", keywords: "soap, detergent, washing powder, cleaning" },
  "8418": { title: "HSN Code 8418 — Refrigerators & Freezers", keywords: "refrigerator, fridge, freezer, deep freezer" },
  "8450": { title: "HSN Code 8450 — Washing Machines", keywords: "washing machine, laundry machine, washer" },
  "9401": { title: "HSN Code 9401 — Seats, Chairs & Sofas", keywords: "chair, sofa, seat, office chair, furniture" },
  "9403": { title: "HSN Code 9403 — Furniture (Tables, Desks, Wardrobes)", keywords: "table, desk, wardrobe, furniture, bookshelf" },
  "7113": { title: "HSN Code 7113 — Gold & Silver Jewellery", keywords: "gold jewellery, silver jewellery, precious metal" },
  "8711": { title: "HSN Code 8711 — Motorcycles & Scooters", keywords: "motorcycle, scooter, bike, two-wheeler" },
  "4011": { title: "HSN Code 4011 — Pneumatic Tyres", keywords: "tyre, tire, rubber tyre, car tyre, bike tyre" },
  "6907": { title: "HSN Code 6907 — Ceramic Tiles", keywords: "ceramic tile, floor tile, wall tile, vitrified tile" },
  "8415": { title: "HSN Code 8415 — Air Conditioning Machines", keywords: "air conditioner, AC, split AC, window AC" },
  "3305": { title: "HSN Code 3305 — Hair Care Preparations", keywords: "shampoo, conditioner, hair oil, hair care" },
  "3306": { title: "HSN Code 3306 — Oral Hygiene (Toothpaste)", keywords: "toothpaste, mouthwash, dental hygiene, oral care" },
  "2202": { title: "HSN Code 2202 — Soft Drinks & Flavoured Water", keywords: "soft drink, cola, aerated water, cold drink" },
  "8507": { title: "HSN Code 8507 — Lithium-Ion Batteries", keywords: "battery, lithium ion, electric accumulator, power bank" },
  "8544": { title: "HSN Code 8544 — Insulated Wire & Cable", keywords: "wire, cable, electrical cable, optical fibre" },
  "5407": { title: "HSN Code 5407 — Woven Synthetic Fabrics", keywords: "polyester fabric, nylon fabric, synthetic cloth" },
  "6204": { title: "HSN Code 6204 — Women's Suits, Trousers & Skirts", keywords: "women's clothing, trousers, skirts, dresses" },
  "6205": { title: "HSN Code 6205 — Men's Shirts", keywords: "shirt, men's shirt, formal shirt, casual shirt" },
  "9004": { title: "HSN Code 9004 — Spectacles & Sunglasses", keywords: "spectacles, sunglasses, goggles, eyewear" },
  "3208": { title: "HSN Code 3208 — Paints & Varnishes", keywords: "paint, varnish, enamel, wall paint, primer" },
  "7214": { title: "HSN Code 7214 — Iron & Steel Bars and Rods", keywords: "TMT bar, steel rod, iron rod, rebar, construction steel" },
  "8516": { title: "HSN Code 8516 — Electric Heaters, Irons & Dryers", keywords: "water heater, geyser, iron box, hair dryer, toaster" },
  "6402": { title: "HSN Code 6402 — Rubber/Plastic Footwear", keywords: "shoes, sandals, slippers, footwear, rubber shoes" },
  "6403": { title: "HSN Code 6403 — Leather Footwear", keywords: "leather shoes, leather footwear, formal shoes" },
  "8443": { title: "HSN Code 8443 — Printers & Copiers", keywords: "printer, copier, printing machine, scanner" },
  "3304": { title: "HSN Code 3304 — Beauty & Skincare Products", keywords: "cosmetics, lipstick, face cream, skincare, makeup" },
  "9503": { title: "HSN Code 9503 — Toys, Dolls & Games", keywords: "toys, dolls, games, tricycle, toy cars" },
  "8504": { title: "HSN Code 8504 — Transformers, UPS & Converters", keywords: "transformer, UPS, inverter, voltage stabilizer" },
  "9018": { title: "HSN Code 9018 — Medical & Surgical Instruments", keywords: "medical instruments, surgical tools, stethoscope" },
  "8712": { title: "HSN Code 8712 — Bicycles", keywords: "bicycle, cycle, non-motorized cycle" },
  "0713": { title: "HSN Code 0713 — Dried Leguminous Vegetables (Dal)", keywords: "dal, lentils, beans, dried legumes, pulses" },
  "1101": { title: "HSN Code 1101 — Wheat Flour (Atta)", keywords: "atta, wheat flour, maida, flour" },
  "0401": { title: "HSN Code 0401 — Milk & Cream", keywords: "milk, cream, fresh milk, pasteurized milk" },
  "4901": { title: "HSN Code 4901 — Printed Books & Brochures", keywords: "books, printed books, brochures, leaflets" },
  "9983": { title: "SAC Code 9983 — IT, Consulting & Professional Services", keywords: "IT services, consulting, software services, web development" },
  "9964": { title: "SAC Code 9964 — Passenger Transport Services", keywords: "cab, taxi, bus, passenger transport, ride" },
  "0405": { title: "HSN Code 0405 — Butter & Ghee", keywords: "butter, ghee, clarified butter, dairy fat" },
  "0407": { title: "HSN Code 0407 — Eggs", keywords: "eggs, hen eggs, poultry eggs, bird eggs" },
  "0910": { title: "HSN Code 0910 — Spices (Ginger, Turmeric, Saffron)", keywords: "spices, ginger, turmeric, saffron, cardamom" },
  "1902": { title: "HSN Code 1902 — Pasta & Noodles", keywords: "pasta, noodles, vermicelli, macaroni" },
  "2105": { title: "HSN Code 2105 — Ice Cream", keywords: "ice cream, kulfi, frozen dessert, gelato" },
  "3105": { title: "HSN Code 3105 — Fertilisers (NPK, Urea)", keywords: "fertilizer, urea, NPK, DAP, agriculture" },
  "4412": { title: "HSN Code 4412 — Plywood & Veneered Panels", keywords: "plywood, veneer, laminated wood, commercial ply" },
  "8421": { title: "HSN Code 8421 — Water Purifiers & Filters", keywords: "water purifier, RO, UV filter, water filter" },
  "8429": { title: "HSN Code 8429 — Excavators & Bulldozers", keywords: "excavator, JCB, bulldozer, earthmoving equipment" },
  "8509": { title: "HSN Code 8509 — Mixer Grinders & Food Processors", keywords: "mixer grinder, food processor, juicer, blender" },
  "8542": { title: "HSN Code 8542 — Electronic Integrated Circuits", keywords: "IC chip, processor, semiconductor, microchip" },
  "8701": { title: "HSN Code 8701 — Tractors", keywords: "tractor, farm tractor, agricultural tractor" },
  "8708": { title: "HSN Code 8708 — Motor Vehicle Parts", keywords: "car parts, auto parts, brake pad, bumper, clutch" },
  "9101": { title: "HSN Code 9101 — Wrist-Watches (Precious Metal)", keywords: "wristwatch, luxury watch, gold watch" },
  "9102": { title: "HSN Code 9102 — Wrist-Watches & Smartwatches", keywords: "smartwatch, digital watch, fitness band" },
  "9202": { title: "HSN Code 9202 — String Musical Instruments", keywords: "guitar, sitar, violin, veena, string instrument" },
  "9206": { title: "HSN Code 9206 — Percussion Musical Instruments", keywords: "tabla, drums, dholak, cymbal, percussion" },
  "9961": { title: "SAC Code 9961 — Insurance Services", keywords: "insurance, life insurance, health insurance, motor insurance" },
  "9972": { title: "SAC Code 9972 — Real Estate Services", keywords: "real estate, property, rent, lease, flat" },
  "9982": { title: "SAC Code 9982 — Legal & Accounting Services", keywords: "legal, CA, chartered accountant, audit, accounting" },
};

function exampleCalc(rate) {
  if (rate === 0) return null;
  const base = 10000;
  const tax = (base * rate) / 100;
  return { base, tax, total: base + tax };
}

export default function HsnCodePage() {
  const { code } = useParams();
  const hsn = getByCode(code);
  const meta = TOP_HSN_META[code];

  if (!hsn) {
    return (
      <div className="tool-page">
        <ToolsNav />
        <main className="tool-main">
          <div className="tool-container">
            <h1 className="tool-title">HSN Code Not Found</h1>
            <p>The HSN code &ldquo;{code}&rdquo; was not found in our database.</p>
            <p><Link to="/hsn">Search all HSN codes →</Link></p>
          </div>
        </main>
        <DoAideFooter />
      </div>
    );
  }

  const isSac = hsn.sac;
  const codeType = isSac ? "SAC" : "HSN";
  const title = meta?.title || `${codeType} Code ${hsn.code} — ${hsn.desc}`;
  const pageTitle = `${title} | GST Rate ${hsn.rate}%`;

  usePageTitle(pageTitle);

  const example = exampleCalc(hsn.rate);

  const related = searchHSN(hsn.category, { limit: 8 })
    .filter((h) => h.code !== hsn.code);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is ${codeType} code ${hsn.code}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${codeType} code ${hsn.code} covers ${hsn.desc}. It falls under the ${hsn.category} category and attracts GST at ${hsn.rate}%.`,
        },
      },
      {
        "@type": "Question",
        name: `What is the GST rate for ${codeType} code ${hsn.code}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The GST rate for ${codeType} code ${hsn.code} (${hsn.desc}) is ${hsn.rate}%.${hsn.rate > 0 ? ` For intra-state supply: CGST ${hsn.rate / 2}% + SGST ${hsn.rate / 2}%. For inter-state supply: IGST ${hsn.rate}%.` : ""}`,
        },
      },
    ],
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle,
    url: `${BASE_URL}/hsn/${hsn.code}`,
    description: `${codeType} code ${hsn.code} — ${hsn.desc}. GST rate: ${hsn.rate}%. Category: ${hsn.category}.`,
  };

  const breadcrumbs = [
    { name: "Home", url: BASE_URL },
    { name: "HSN Finder", url: `${BASE_URL}/hsn` },
    { name: `${codeType} ${hsn.code}` },
  ];

  return (
    <div className="tool-page">
      <SeoHead
        title={`${codeType} Code ${hsn.code} — ${hsn.desc} | GST Rate ${hsn.rate}%`}
        description={`${codeType} code ${hsn.code} covers ${hsn.desc}. GST rate: ${hsn.rate}%. Category: ${hsn.category}. Find tax breakup, related codes, and GST calculation examples.`}
        path={`/hsn/${hsn.code}`}
        jsonLd={[faqSchema, productSchema]}
        breadcrumbs={breadcrumbs}
      />
      <ToolsNav />
      <main className="tool-main">
        <div className="tool-container">
          <Breadcrumb />
          <h1 className="tool-title">{codeType} Code {hsn.code}</h1>
          <p className="tool-subtitle">{hsn.desc}</p>

          <div className="calc-card">
            <div className="calc-result">
              <div className="calc-result-row">
                <span>{codeType} Code</span>
                <strong>{hsn.code}</strong>
              </div>
              <div className="calc-result-row">
                <span>Description</span>
                <strong>{hsn.desc}</strong>
              </div>
              <div className="calc-result-row">
                <span>Category</span>
                <strong>{hsn.category}</strong>
              </div>
              <div className="calc-result-row calc-total">
                <span>GST Rate</span>
                <strong>{hsn.rate}%</strong>
              </div>
              {hsn.rate > 0 && (
                <>
                  <div className="calc-result-row">
                    <span>CGST + SGST (Intra-state)</span>
                    <strong>{hsn.rate / 2}% + {hsn.rate / 2}%</strong>
                  </div>
                  <div className="calc-result-row">
                    <span>IGST (Inter-state)</span>
                    <strong>{hsn.rate}%</strong>
                  </div>
                </>
              )}
            </div>

            {example && (
              <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--bg-alt, #f5f5f5)", borderRadius: "0.5rem" }}>
                <strong>Example Calculation</strong>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.95rem" }}>
                  On a taxable value of {formatINR(example.base)}: GST = {formatINR(example.tax)}, Total = {formatINR(example.total)}
                </p>
              </div>
            )}

            <div className="calc-result-actions" style={{ marginTop: "1rem" }}>
              <ShareButtons
                path={`/hsn/${hsn.code}`}
                text={`${codeType} code ${hsn.code} — ${hsn.desc} — GST rate ${hsn.rate}%`}
              />
            </div>
          </div>

          <div style={{ margin: "1.5rem 0", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link to={`/calculator?rate=${hsn.rate}`} className="btn btn-primary">
              Calculate GST at {hsn.rate}%
            </Link>
            <Link to="/hsn" className="btn compare-cta-secondary">
              Search More HSN Codes
            </Link>
          </div>

          {related.length > 0 && (
            <section className="tool-info">
              <h2>Related {codeType} Codes in {hsn.category}</h2>
              <table className="due-date-table">
                <thead>
                  <tr>
                    <th>{codeType} Code</th>
                    <th>Description</th>
                    <th>GST Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {related.map((r) => (
                    <tr key={r.code}>
                      <td><Link to={`/hsn/${r.code}`}>{r.code}</Link></td>
                      <td>{r.desc}</td>
                      <td>{r.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="tool-info">
            <h2>About {codeType} Code {hsn.code}</h2>
            <p>
              {codeType} code {hsn.code} is used to classify <strong>{hsn.desc.toLowerCase()}</strong> under
              the Goods and Services Tax ({isSac ? "GST Services" : "GST"}) system in India.
              This code falls under the <strong>{hsn.category}</strong> category and attracts
              a GST rate of <strong>{hsn.rate}%</strong>.
            </p>
            {!isSac && (
              <p>
                HSN (Harmonized System of Nomenclature) is an internationally standardized system
                of names and numbers to classify traded products. Under GST, businesses with
                turnover above ₹5 crore must report 6-digit HSN codes on invoices, while those
                between ₹1.5 crore and ₹5 crore must report 4-digit codes.
              </p>
            )}
            {isSac && (
              <p>
                SAC (Services Accounting Code) is used under GST to classify services.
                All service providers must mention the SAC code on their GST invoices.
              </p>
            )}
          </section>

          <RelatedTools current={`/hsn/${hsn.code}`} />
          <CrossProductLinks page="hsn-code" />
        </div>
      </main>
      <DoAideFooter />
    </div>
  );
}

export { TOP_HSN_META };
