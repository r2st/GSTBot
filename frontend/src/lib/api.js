// API client for the GSTBot backend.
// Stores the JWT in localStorage and attaches it as a Bearer token.

const BASE = "/api/v1";
const TOKEN_KEY = "gstbot_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, form, auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // URLSearchParams or FormData — the browser sets the type.
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });

  // A rejected token is a dead token; drop it so the app falls back to login
  // rather than retrying with a credential the server has already refused.
  if (res.status === 401) setToken(null);

  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new Error(errorMessage(data, res.statusText));
  return data;
}

/** Flatten whatever FastAPI put in `detail` into one readable line. */
export function errorMessage(data, fallback = "Request failed") {
  const detail = data?.detail ?? fallback;
  if (typeof detail === "string") return detail;
  // Validation errors arrive as a list of {loc, msg} objects.
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg ?? JSON.stringify(d)).join(", ");
  }
  // Our own structured conflicts, e.g. the duplicate-upload response.
  if (detail && typeof detail === "object") {
    return detail.message ?? JSON.stringify(detail);
  }
  return String(detail);
}

export const api = {
  // ---- Auth ----
  async login(email, password) {
    // The token endpoint is OAuth2 password flow, so it takes form fields and
    // calls the email "username".
    const form = new URLSearchParams({ username: email, password });
    const data = await request("/auth/login", { method: "POST", form, auth: false });
    setToken(data.access_token);
    return data;
  },

  async register(payload) {
    // Registration returns a usable session, so there is no second login step.
    const data = await request("/auth/register", {
      method: "POST",
      body: payload,
      auth: false,
    });
    setToken(data.access_token);
    return data;
  },

  logout() {
    setToken(null);
  },

  me: () => request("/auth/me"),

  // ---- Meta (public) ----
  validateGstin: (gstin) =>
    request(`/meta/gstin/${encodeURIComponent(gstin)}`, { auth: false }),
  states: () => request("/meta/states", { auth: false }),
  health: () => request("/health", { auth: false }),

  // ---- Invoices ----
  uploadInvoice(file, invoiceType = "purchase") {
    const form = new FormData();
    form.append("file", file);
    form.append("invoice_type", invoiceType);
    return request("/invoices/upload", { method: "POST", form });
  },

  listInvoices(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const suffix = query.toString();
    return request(`/invoices${suffix ? `?${suffix}` : ""}`);
  },

  getInvoice: (id) => request(`/invoices/${id}`),
  updateInvoice: (id, changes) =>
    request(`/invoices/${id}`, { method: "PATCH", body: changes }),
  reparseInvoice: (id) => request(`/invoices/${id}/reparse`, { method: "POST" }),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: "DELETE" }),

  // ---- Dashboard ----
  dashboard: (period) =>
    request(`/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}`),

  // ---- GSTR-2B and reconciliation ----
  importGstr2b(file, period) {
    const form = new FormData();
    form.append("file", file);
    // Omitted rather than sent empty: the server reads the period out of the
    // file when the caller does not name one, and "" is not a period.
    if (period) form.append("period", period);
    return request("/reconciliation/gstr2b/import", { method: "POST", form });
  },

  importedPeriods: () => request("/reconciliation/gstr2b/periods"),
  getImported2b: (period) =>
    request(`/reconciliation/gstr2b/${encodeURIComponent(period)}`),

  reconcile: (period, tolerance) =>
    request("/reconciliation/run", {
      method: "POST",
      body: tolerance === undefined ? { period } : { period, tolerance },
    }),

  listReconciliations: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    const suffix = query.toString();
    return request(`/reconciliation${suffix ? `?${suffix}` : ""}`);
  },

  getReconciliation: (id) => request(`/reconciliation/${id}`),
  latestReconciliation: (period) =>
    request(`/reconciliation/latest?period=${encodeURIComponent(period)}`),

  // ---- ITC ----
  itc: (period, params = {}) =>
    request(`/itc${query({ period, ...params })}`),

  rule37: (asOf) => request(`/itc/rule37${query({ as_of: asOf })}`),

  setOff: (payload) => request("/itc/set-off", { method: "POST", body: payload }),

  // ---- Filing ----
  validateFiling: (period, invoiceType) =>
    request(`/filing/validate${query({ period, invoice_type: invoiceType })}`),

  gstr1: (period) => request(`/filing/gstr1${query({ period })}`),
  gstr3b: (period) => request(`/filing/gstr3b${query({ period })}`),

  /** The download URL for an export. Used as an href, not fetched. */
  exportUrl: (returnType, extension, period) =>
    `${BASE}/filing/export/${returnType}.${extension}${query({ period })}`,

  /**
   * Fetch an export as a Blob.
   *
   * The export endpoints need the bearer token, which a plain `<a href>`
   * cannot carry — so the file is fetched with the header and handed to the
   * browser as an object URL rather than linked to directly.
   */
  async downloadExport(returnType, extension, period) {
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(api.exportUrl(returnType, extension, period), { headers });
    if (res.status === 401) setToken(null);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(errorMessage(text ? JSON.parse(text) : null, res.statusText));
    }
    return {
      blob: await res.blob(),
      filename: filenameFrom(res.headers.get("Content-Disposition")),
    };
  },

  // ---- Suppliers ----
  listSuppliers: (params = {}) => request(`/suppliers${query(params)}`),
  getSupplier: (id, period) => request(`/suppliers/${id}${query({ period })}`),
  rescoreSuppliers: (period) =>
    request(`/suppliers/rescore${query({ period })}`, { method: "POST" }),
};

/** Build a `?a=1&b=2` suffix, dropping empty values. Returns "" when empty. */
function query(params = {}) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

/** Pull the filename out of a Content-Disposition header. */
export function filenameFrom(header, fallback = "gstbot-export") {
  const match = /filename="?([^"]+)"?/.exec(header ?? "");
  return match ? match[1] : fallback;
}
