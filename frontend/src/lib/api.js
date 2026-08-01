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
};
