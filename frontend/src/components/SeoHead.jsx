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

const API_BASE = `${BASE_URL}/api/v1`;
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

function ogImageUrl(title, subtitle) {
  if (!title) return DEFAULT_OG_IMAGE;
  const params = new URLSearchParams({ title });
  if (subtitle) params.set("subtitle", subtitle);
  return `${API_BASE}/seo/og-image?${params.toString()}`;
}

function setCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

export default function SeoHead({ title, description, path, jsonLd, breadcrumbs, ogImage }) {
  useEffect(() => {
    const url = `${BASE_URL}${path}`;
    const image = ogImage || ogImageUrl(title, description?.slice(0, 80));

    setCanonical(url);
    setMeta("description", description, "name");
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:url", url);
    setMeta("og:type", "website");
    setMeta("og:site_name", SITE_NAME);
    setMeta("og:image", image);
    setMeta("og:image:width", "1200");
    setMeta("og:image:height", "630");
    setMeta("og:image:alt", title);
    setMeta("og:locale", "en_IN");
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", image);
    setMeta("twitter:image:alt", title);

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
  }, [title, description, path, jsonLd, breadcrumbs, ogImage]);

  return null;
}

export { BASE_URL, SITE_NAME };
