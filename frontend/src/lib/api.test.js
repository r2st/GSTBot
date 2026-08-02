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

  it("stringifies a detail that is neither text, list nor object", () => {
    // Nothing we send looks like this, but an upstream proxy erroring with
    // `{"detail": 502}` should still read as something rather than crash the
    // banner that renders it.
    expect(errorMessage({ detail: 502 })).toBe("502");
  });

  it("falls back to JSON for a structured detail with no message", () => {
    expect(errorMessage({ detail: { code: "rate_limited" } })).toBe('{"code":"rate_limited"}');
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

  it("sends a GSTR-2B as multipart with the period", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 1, period: "2026-04" }));
    const file = new File(["{}"], "gstr2b.json", { type: "application/json" });
    await api.importGstr2b(file, "2026-04");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/reconciliation/gstr2b/import");
    expect(options.method).toBe("POST");
    expect(options.body.get("file").name).toBe("gstr2b.json");
    expect(options.body.get("period")).toBe("2026-04");
    // The browser sets the multipart boundary; setting it by hand breaks it.
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("omits the period rather than sending an empty one", async () => {
    // The server reads the period out of the file when none is given, and ""
    // is not a period it can parse.
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 1, period: "2026-04" }));
    await api.importGstr2b(new File(["{}"], "gstr2b.json"));

    expect(global.fetch.mock.calls[0][1].body.has("period")).toBe(false);
  });

  it("posts a reconciliation run", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 7 }));
    await api.reconcile("2026-04");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/reconciliation/run");
    expect(JSON.parse(options.body)).toEqual({ period: "2026-04" });
  });

  it("sends a tolerance only when one was chosen", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 7 }));
    await api.reconcile("2026-04", "0");

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      period: "2026-04",
      tolerance: "0",
    });
  });

  it("escapes the period in a GSTR-2B lookup", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await api.getImported2b("2026-04");
    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/reconciliation/gstr2b/2026-04");
  });

  it("fetches the latest run for a period", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 7 }));
    await api.latestReconciliation("2026-04");
    expect(global.fetch.mock.calls[0][0]).toBe(
      "/api/v1/reconciliation/latest?period=2026-04",
    );
  });

  it("builds a bare reconciliation URL when there are no filters", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
    await api.listReconciliations();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/reconciliation");
  });

  // What the user reads when the answer did not come from the application.
  // Both of these are invisible to a test that mocks an HTTP/1.1-shaped
  // response, and both are what production actually serves.
  describe("a response the application did not write", () => {
    it("explains a 502 whose body is an HTML page from the edge", async () => {
      // `JSON.parse` on this throws `Unexpected token '<'`, and that string is
      // what would otherwise land in the error banner.
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "",
        text: async () => "<html><head><title>502</title></head></html>",
      });

      await expect(api.me()).rejects.toThrow(
        "The server is having trouble (502). Please try again in a moment.",
      );
    });

    it("never raises an empty message when the body carries no detail", async () => {
      // HTTP/2 dropped the reason phrase, so `statusText` is "" in production.
      global.fetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, { status: 500 }));

      await expect(api.me()).rejects.toThrow("The server is having trouble (500)");
    });

    it("keeps the reason phrase when there is one", async () => {
      global.fetch.mockResolvedValueOnce({
        ...jsonResponse(null, { status: 503 }),
        statusText: "Service Unavailable",
      });

      await expect(api.me()).rejects.toThrow("503 Service Unavailable");
    });

    it("still prefers the server's own detail over the generic message", async () => {
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Business is inactive" }, { status: 403 }),
      );

      await expect(api.me()).rejects.toThrow("Business is inactive");
    });

    it("names a rate limit as one", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse({}, { status: 429 }));

      await expect(api.me()).rejects.toThrow("Too many requests (429)");
    });

    it("reports a 2xx whose body is not JSON rather than throwing a parse error", async () => {
      // A truncated response, or a proxy that replaced the body on the way
      // back. The request succeeded; the answer is unusable, and saying so is
      // more use than `Unexpected end of JSON input`.
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "",
        text: async () => "{partial",
      });

      await expect(api.me()).rejects.toThrow(
        "The server sent a response this app could not read (200).",
      );
    });

    it("treats an empty body on a 2xx as no content rather than unreadable", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse(null));

      await expect(api.me()).resolves.toBeNull();
    });
  });

  // downloadExport does not go through `request` — it needs the raw response
  // to get at the blob and the Content-Disposition — so it carries its own
  // copy of the auth and error handling, and that copy needs its own tests.
  describe("downloadExport", () => {
    function fileResponse(body, { status = 200, disposition = null } = {}) {
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        text: async () => (body === null ? "" : JSON.stringify(body)),
        blob: async () => new Blob(["csv,data"]),
        headers: { get: () => disposition },
      };
    }

    it("sends the bearer token a plain link could not carry", async () => {
      setToken("tok-1");
      global.fetch.mockResolvedValueOnce(fileResponse(null));

      await api.downloadExport("gstr1", "csv", "2026-04");

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("/api/v1/filing/export/gstr1.csv?period=2026-04");
      expect(options.headers.Authorization).toBe("Bearer tok-1");
    });

    it("reads the filename out of the Content-Disposition", async () => {
      global.fetch.mockResolvedValueOnce(
        fileResponse(null, { disposition: 'attachment; filename="gstr1-2026-04.csv"' }),
      );

      const { filename } = await api.downloadExport("gstr1", "csv", "2026-04");

      expect(filename).toBe("gstr1-2026-04.csv");
    });

    it("names the file itself when the server did not", async () => {
      global.fetch.mockResolvedValueOnce(fileResponse(null));

      const { filename } = await api.downloadExport("gstr1", "csv", "2026-04");

      expect(filename).toBe("gstbot-export");
    });

    it("raises the server's reason when the export is refused", async () => {
      // A period with no invoices is a 400 with a detail worth showing —
      // saving that JSON to disk as "gstbot-export.csv" would be worse than
      // any error message.
      global.fetch.mockResolvedValueOnce(
        fileResponse({ detail: "Nothing to export for 2026-04" }, { status: 400 }),
      );

      await expect(api.downloadExport("gstr1", "csv", "2026-04")).rejects.toThrow(
        "Nothing to export for 2026-04",
      );
    });

    it("falls back to the status text when the error body is empty", async () => {
      global.fetch.mockResolvedValueOnce({
        ...fileResponse(null, { status: 502 }),
        statusText: "Bad Gateway",
      });

      await expect(api.downloadExport("gstr1", "csv", "2026-04")).rejects.toThrow("Bad Gateway");
    });

    it("still says something when the error body is empty over HTTP/2", async () => {
      // The reason phrase does not exist in HTTP/2 or HTTP/3, so `statusText`
      // is "" against the server this actually deploys behind. Falling back to
      // it alone renders an error banner with nothing in it.
      global.fetch.mockResolvedValueOnce(fileResponse(null, { status: 502 }));

      await expect(api.downloadExport("gstr1", "csv", "2026-04")).rejects.toThrow(
        "The server is having trouble (502)",
      );
    });

    it("does not surface a JSON parse error when the edge returns HTML", async () => {
      global.fetch.mockResolvedValueOnce({
        ...fileResponse(null, { status: 502 }),
        text: async () => "<html><body>502 Bad Gateway</body></html>",
      });

      await expect(api.downloadExport("gstr1", "csv", "2026-04")).rejects.toThrow(
        "The server is having trouble (502)",
      );
    });

    it("drops a token the export endpoint rejected", async () => {
      setToken("stale");
      global.fetch.mockResolvedValueOnce(fileResponse({ detail: "Not authenticated" }, { status: 401 }));

      await expect(api.downloadExport("gstr1", "csv", "2026-04")).rejects.toThrow();

      // Same rule as `request`: a refused credential is not retried.
      expect(getToken()).toBeNull();
    });
  });
});
