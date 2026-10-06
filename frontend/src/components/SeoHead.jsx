import { useEffect } from "react";

const SITE_NAME = "DoAide GST";
const BASE_URL = "https://gst.doaide.com";

function setMeta(property, content, attr = "property") {
  let el = document.querySelector(`meta[${attr}="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export default function SeoHead({ title, description, path, jsonLd, breadcrumbs }) {
  useEffect(() => {
    const url = `${BASE_URL}${path}`;

    setMeta("description", description, "name");
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:url", url);
    setMeta("og:type", "website");
    setMeta("og:site_name", SITE_NAME);
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);

    if (jsonLd) {
      const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      schemas.forEach((schema, i) => setJsonLd(`seo-jsonld-${i}`, schema));
    }

    if (breadcrumbs) {
      setJsonLd("seo-breadcrumb", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.name,
          ...(crumb.url ? { item: crumb.url } : {}),
        })),
      });
    }

    return () => {
      if (jsonLd) {
        const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
        schemas.forEach((_, i) => removeJsonLd(`seo-jsonld-${i}`));
      }
      if (breadcrumbs) removeJsonLd("seo-breadcrumb");
    };
  }, [title, description, path, jsonLd, breadcrumbs]);

  return null;
}

export { BASE_URL, SITE_NAME };
