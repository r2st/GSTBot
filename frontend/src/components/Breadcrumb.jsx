import { Link, useLocation } from "react-router-dom";

const ROUTE_LABELS = {
  "/calculator": "GST Calculator",
  "/lookup": "GSTIN Lookup",
  "/hsn": "HSN Code Finder",
  "/due-dates": "Due Dates Calendar",
  "/resources": "Resources",
  "/embed": "Embed Widget",
  "/pricing": "Pricing",
  "/blog": "Blog",
};

export default function Breadcrumb({ items }) {
  const { pathname } = useLocation();

  const crumbs = items || [
    { label: "Home", to: "/" },
    ...(ROUTE_LABELS[pathname]
      ? [{ label: ROUTE_LABELS[pathname] }]
      : []),
  ];

  if (crumbs.length < 2) return null;

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.label} className="breadcrumb-item">
              {isLast || !crumb.to ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <>
                  <Link to={crumb.to}>{crumb.label}</Link>
                  <span className="breadcrumb-sep" aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
