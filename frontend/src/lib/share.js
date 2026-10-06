export function origin() {
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }
  return "https://gst.doaide.com";
}

export function fullUrl(path) {
  return `${origin()}${path}`;
}

export function whatsappUrl(text, url) {
  const message = url ? `${text} ${url}` : text;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function twitterUrl(text, url) {
  const params = new URLSearchParams();
  params.set("text", text);
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export async function copyToClipboard(text) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback.
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function embedSnippet(tool, { width = "100%", height = "400" } = {}) {
  const src = `${origin()}/embed/${tool}`;
  return `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" style="border:1px solid #e5e7eb;border-radius:8px;" title="DoAide GST ${tool}"></iframe>`;
}

export function widgetEmbedSnippet(tool, { theme = "dark", rate = 18, width } = {}) {
  if (tool !== "calculator") {
    return embedSnippet(tool);
  }
  const params = new URLSearchParams();
  if (theme) params.set("theme", theme);
  if (rate !== 18) params.set("rate", String(rate));
  if (width) params.set("width", String(width));
  const qs = params.toString();
  const src = `${origin()}/widget${qs ? `?${qs}` : ""}`;
  const iframeWidth = width || "100%";
  const iframeHeight = "460";
  return `<iframe src="${src}" width="${iframeWidth}" height="${iframeHeight}" frameborder="0" style="border:1px solid #e5e7eb;border-radius:8px;" title="DoAide GST Calculator"></iframe>`;
}
