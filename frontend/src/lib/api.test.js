import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, errorMessage, getToken, setToken } from "./api";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => (body === null ? "" : JSON.stringify(body)),
  };
}

describe("errorMessage", () => {
  it("passes a plain string detail through", () => {
    expect(errorMessage({ detail: "Email already registered" })).toBe(
      "Email already registered",
    );
  });

  it("flattens a FastAPI validation error list", () => {
    const detail = [
      { loc: ["body", "gstin"], msg: "GSTIN check digit does not match" },
      { loc: ["body", "password"], msg: "too short" },
    ];
    expect(errorMessage({ detail })).toBe("GSTIN check digit does not match, too short");
  });

  it("reads the message out of a structured conflict", () => {
    // The duplicate-upload response is {message, invoice_id}.
    expect(errorMessage({ detail: { message: "Already uploaded as 7", invoice_id: 7 } })).toBe(
      "Already uploaded as 7",
    );
  });

  it("falls back when there is no detail", () => {
    expect(errorMessage(null, "Request failed")).toBe("Request failed");
  });
});

describe("api", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the token on login and sends it afterwards", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ access_token: "tok-1" }));
    await api.login("owner@example.com", "supersecret123");
    expect(getToken()).toBe("tok-1");

    global.fetch.mockResolvedValueOnce(jsonResponse({ email: "owner@example.com" }));
    await api.me();

    const [, options] = global.fetch.mock.calls[1];
    expect(options.headers.Authorization).toBe("Bearer tok-1");
  });

  it("sends login as form fields with the email as username", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ access_token: "tok-1" }));
    await api.login("owner@example.com", "pw");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/auth/login");
    // OAuth2 password flow: form-encoded, and the field is called "username".
    expect(options.body).toBeInstanceOf(URLSearchParams);
    expect(options.body.get("username")).toBe("owner@example.com");
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("drops a token the server has rejected", async () => {
    setToken("stale-token");
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Could not validate credentials" }, { status: 401 }),
    );

    await expect(api.me()).rejects.toThrow("Could not validate credentials");
    // Retrying with a credential the server already refused is pointless, and
    // it keeps the UI from ever falling back to the login screen.
    expect(getToken()).toBeNull();
  });

  it("registers and keeps the returned session", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ access_token: "tok-2", user: {}, business: {} }),
    );
    await api.register({ email: "a@b.com", password: "supersecret123", gstin: "27AAPFU0939F1ZV" });
    expect(getToken()).toBe("tok-2");
  });

  it("clears the token on logout", () => {
    setToken("tok-3");
    api.logout();
    expect(getToken()).toBeNull();
  });

  it("posts an upload as multipart with the invoice type", async () => {
    setToken("tok-1");
    global.fetch.mockResolvedValueOnce(jsonResponse({ invoice: { id: 1 }, queued: false }));

    const file = new File(["invoice text"], "inv.txt", { type: "text/plain" });
    await api.uploadInvoice(file, "purchase");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/invoices/upload");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("invoice_type")).toBe("purchase");
    // The browser must set the multipart boundary itself.
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("omits empty filters from the invoice query", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
    await api.listInvoices({ invoice_type: "purchase", status: "", search: undefined, limit: 25 });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("invoice_type=purchase");
    expect(url).toContain("limit=25");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("search=");
  });

  it("builds a bare invoice URL when there are no filters", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
    await api.listInvoices();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/invoices");
  });

  it("handles a 204 with no body", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    await expect(api.deleteInvoice(1)).resolves.toBeNull();
  });

  it("passes the period to the dashboard", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ period: "2026-04" }));
    await api.dashboard("2026-04");
    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/dashboard?period=2026-04");
  });
});
