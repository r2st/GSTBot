import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  errorMessage,
  getActiveBusinessId,
  getToken,
  isAbortError,
  onUnauthorized,
  setActiveBusinessId,
  setToken,
} from "./api";

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

  it("falls back to JSON for a validation entry with no msg", () => {
    // Not FastAPI's own shape — a gateway that rewrote the list, or a
    // middleware error serialized into it. Rendering `undefined` in the banner
    // would tell the user nothing about which field was refused; the raw entry
    // at least still names it.
    expect(errorMessage({ detail: [{ loc: ["body", "gstin"], type: "value_error" }] })).toBe(
      '{"loc":["body","gstin"],"type":"value_error"}',
    );
  });
});

describe("isAbortError", () => {
  it("recognises what a browser rejects an aborted fetch with", () => {
    // Constructed rather than taken from a real `fetch`: this suite runs on
    // jsdom, whose `AbortController` is from a different realm than the fetch
    // implementation under it, so an abort here fails with a TypeError about
    // the signal instead of ever reaching the abort path. A browser rejects
    // with a DOMException named "AbortError", and the name is the only part of
    // it the specification pins down — so the name is what is matched on, and
    // what is asserted here.
    expect(isAbortError(new DOMException("The operation was aborted.", "AbortError"))).toBe(
      true,
    );
    // Some runtimes reject with a plain Error carrying the same name.
    const plain = new Error("The operation was aborted.");
    plain.name = "AbortError";
    expect(isAbortError(plain)).toBe(true);
  });

  it("does not swallow an ordinary failure", () => {
    // The banner exists for these. Treating one as a cancelled request would
    // leave a genuinely broken page looking merely busy.
    expect(isAbortError(new Error("Database unreachable"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
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

  describe("the status a refusal carries", () => {
    // Some refusals are a normal state of the product — a period with nothing
    // imported answers 404 — and some are a failure. A caller that wants to
    // pass over the first quietly needs to be able to tell them apart.
    it("puts the status on the error it throws", async () => {
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Nothing imported for that period" }, { status: 404 }),
      );

      const err = await api.getImported2b("2026-04").catch((e) => e);
      expect(err.status).toBe(404);
      expect(err.message).toBe("Nothing imported for that period");
    });

    it("carries the status of a failure just the same", async () => {
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "Database unreachable" }, { status: 500 }),
      );

      const err = await api.getImported2b("2026-04").catch((e) => e);
      expect(err.status).toBe(500);
    });

    it("carries a status even when the body was not readable", async () => {
      // An HTML error page from the edge. The message falls back, the status
      // does not — it is the only thing the caller can still branch on.
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "",
        text: async () => "<html><body>502 Bad Gateway</body></html>",
      });

      const err = await api.latestReconciliation("2026-04").catch((e) => e);
      expect(err.status).toBe(502);
      expect(err.message).toContain("502");
    });

    it("carries the status on a refused export too", async () => {
      global.fetch.mockResolvedValueOnce(
        jsonResponse({ detail: "No invoices for that period" }, { status: 404 }),
      );

      const err = await api.downloadExport("gstr1", "csv", "2026-04").catch((e) => e);
      expect(err.status).toBe(404);
    });
  });

  describe("cancellation", () => {
    // The two list endpoints are the ones a search box refetches per keystroke,
    // so they are the two that have to be cancellable. Without the signal
    // reaching `fetch` the page can abort nothing, and a superseded response
    // still lands on the table it no longer describes.
    it("passes a signal through to fetch on the invoice list", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
      const controller = new AbortController();

      await api.listInvoices({ search: "north" }, { signal: controller.signal });

      const [, options] = global.fetch.mock.calls[0];
      expect(options.signal).toBe(controller.signal);
    });

    it("passes a signal through to fetch on the supplier list", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));
      const controller = new AbortController();

      await api.listSuppliers({ search: "north" }, { signal: controller.signal });

      const [, options] = global.fetch.mock.calls[0];
      expect(options.signal).toBe(controller.signal);
    });

    it("passes a signal through to fetch on the late fee", async () => {
      // Two controls on the filing page choose which return this asks about,
      // and the answer is an amount of money owed. A superseded response that
      // lands anyway puts the wrong month's figure under the wrong month's
      // heading — and unlike a stale table, that is a number someone may pay.
      global.fetch.mockResolvedValueOnce(jsonResponse({ days_late: 0 }));
      const controller = new AbortController();

      await api.lateFee("gstr3b", "2026-04", {}, { signal: controller.signal });

      const [url, options] = global.fetch.mock.calls[0];
      expect(String(url)).toContain("/filing/gstr3b/late-fee?period=2026-04");
      expect(options.signal).toBe(controller.signal);
    });

    it("still asks for the late fee when the caller wants no cancellation", async () => {
      // The refining parameters stay optional and stay out of the query when
      // they are not given: an omitted turnover means "use the highest cap", and
      // an empty one would be a different question.
      global.fetch.mockResolvedValueOnce(jsonResponse({ days_late: 0 }));

      await api.lateFee("gstr1", "2026-04");

      const [url, options] = global.fetch.mock.calls[0];
      expect(String(url)).toBe("/api/v1/filing/gstr1/late-fee?period=2026-04");
      expect(options.signal).toBeUndefined();
    });

    it("asks for the lapsing credit of the whole register, not a period", async () => {
      // s.16(4) governs a financial year. Omitting `as_of` asks about today,
      // and an empty one would be a different question — so it stays out of the
      // query string rather than going in blank.
      global.fetch.mockResolvedValueOnce(jsonResponse({ years: [] }));
      const controller = new AbortController();

      await api.lapsingCredit(undefined, { signal: controller.signal });

      const [url, options] = global.fetch.mock.calls[0];
      expect(String(url)).toBe("/api/v1/itc/lapsing");
      expect(options.signal).toBe(controller.signal);
    });

    it("measures the lapsing deadline against a date when given one", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse({ years: [] }));

      await api.lapsingCredit("2026-11-01");

      const [url] = global.fetch.mock.calls[0];
      expect(String(url)).toBe("/api/v1/itc/lapsing?as_of=2026-11-01");
    });

    it("still works for a caller that does not want to cancel", async () => {
      global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

      await api.listSuppliers({ search: "north" });

      const [, options] = global.fetch.mock.calls[0];
      expect(options.signal).toBeUndefined();
    });
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

  it("announces a rejected token so the session can end with it", async () => {
    // Dropping the token is only half of it. The session lives in React and
    // outlived the credential: `user` stayed set, so the app kept rendering,
    // every later request went out unauthenticated, and `/login` bounced back
    // to `/`. The one screen that could fix it was unreachable.
    setToken("stale-token");
    const told = vi.fn();
    const unsubscribe = onUnauthorized(told);

    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Could not validate credentials" }, { status: 401 }),
    );
    await expect(api.me()).rejects.toThrow();

    expect(told).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops announcing once a subscriber has unsubscribed", async () => {
    setToken("stale-token");
    const told = vi.fn();
    onUnauthorized(told)();

    global.fetch.mockResolvedValueOnce(jsonResponse({ detail: "no" }, { status: 401 }));
    await expect(api.me()).rejects.toThrow();

    expect(told).not.toHaveBeenCalled();
  });

  it("says nothing about a 401 from a request that carried no token", async () => {
    // A wrong password on the sign-in form is not an expired session, and
    // announcing it as one would have the login page fight its own error
    // handling.
    setToken(null);
    const told = vi.fn();
    const unsubscribe = onUnauthorized(told);

    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Incorrect email or password" }, { status: 401 }),
    );
    await expect(api.login("a@b.com", "wrong")).rejects.toThrow();

    expect(told).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("keeps the session when the 401 is about a credential in the body", async () => {
    // Linking another GSTIN submits *that* account's email and password to
    // prove the caller also holds it, and the endpoint answers 401 when they do
    // not match. Read as the caller's own token being refused, a typo in the
    // other registration's password signed the user out of the account they
    // were signed into — and the token is still perfectly good.
    setToken("good-token");
    const told = vi.fn();
    const unsubscribe = onUnauthorized(told);

    global.fetch.mockResolvedValueOnce(
      jsonResponse(
        { detail: "That email and password do not match an active account." },
        { status: 401 },
      ),
    );
    await expect(api.linkBusiness("other@acme.in", "wrong")).rejects.toThrow(
      /do not match an active account/,
    );

    expect(told).not.toHaveBeenCalled();
    expect(getToken()).toBe("good-token");
    unsubscribe();
  });

  it("does not let a throwing subscriber become the caller's error", async () => {
    setToken("stale-token");
    const unsubscribe = onUnauthorized(() => {
      throw new Error("subscriber exploded");
    });

    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Could not validate credentials" }, { status: 401 }),
    );
    await expect(api.me()).rejects.toThrow("Could not validate credentials");
    unsubscribe();
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

  it("posts every file of a batch under the one field name the route reads", async () => {
    setToken("tok-1");
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

    const files = [
      new File(["one"], "a.txt", { type: "text/plain" }),
      new File(["two"], "b.txt", { type: "text/plain" }),
    ];
    await api.bulkUploadInvoices(files, "sales");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/invoices/bulk");
    // `files: list[UploadFile] = File(...)` on the route is a *repeated* field,
    // not one field holding a list. Appending under any other name — "file",
    // the "files[]" some clients send — is a 422 naming a field the browser
    // never sent, and nothing on the page would say which. Pinned by name and
    // by count because getAll is what distinguishes the two mistakes: the
    // wrong name gives an empty list, one append gives a short one.
    expect(options.body.getAll("files").map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
    expect(options.body.get("invoice_type")).toBe("sales");
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("defaults a batch to purchase, the type that claims credit", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [] }));
    await api.bulkUploadInvoices([new File(["one"], "a.txt")]);

    // Matches the route's own default. A batch booked as sales by accident
    // claims input credit on the business's own output tax — see the comment
    // on the type toggle in UploadPage for why that direction is the costly one.
    expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("purchase");
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

  it("drops the filters that carry no value rather than sending them empty", async () => {
    // `?period=` is not the same request as no period at all — the first asks
    // the server to match the empty string. The filter runs over null and
    // undefined too, because a page holds an unset control as either.
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    await api.listReconciliations({
      period: "2026-04",
      status: "",
      limit: null,
      offset: undefined,
    });

    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/reconciliation?period=2026-04");
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

    it("keeps the reason phrase on an unreadable 2xx as well", async () => {
      // The same HTTP/2 hazard as `statusMessage`, in the other message. A
      // proxy that answers 200 with an HTML interstitial is usually HTTP/1.1
      // — it is the hop that did *not* come from the app — so this is the
      // path where a reason phrase actually shows up.
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "<html>Sign in to the network</html>",
      });

      await expect(api.me()).rejects.toThrow(
        "The server sent a response this app could not read (200 OK).",
      );
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

describe("filing records", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for the recent filing standings", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ as_of: "2026-05-06", items: [] }));

    await api.filingStatus();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/filing/status",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("posts a filing record against the return type in the path", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));

    await api.recordFiled("gstr3b", { period: "2026-04", arn: "AA270426000000X" });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/filing/gstr3b/filed");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      period: "2026-04",
      arn: "AA270426000000X",
    });
  });

  it("sends a record with no ARN when the caller omits it", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));

    await api.recordFiled("gstr1", { period: "2026-04" });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ period: "2026-04" });
  });

  it("surfaces the server's reason for refusing a record", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "A filing date of 2027-01-01 is in the future." }, { status: 422 }),
    );

    await expect(api.recordFiled("gstr1", { period: "2026-04" })).rejects.toThrow(
      "A filing date of 2027-01-01 is in the future.",
    );
  });
});

// `X-Business-Id` is the whole of the multi-GSTIN feature on this side of the
// wire: the backend resolves the tenant from it in `get_current_business`, and
// honours it only against a live membership. Which requests carry it, and
// which must not, is therefore a tenancy question rather than a plumbing one.
describe("acting for a linked business", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the id as a string, and reads back nothing when cleared", () => {
    setActiveBusinessId(7);
    expect(getActiveBusinessId()).toBe("7");
    setActiveBusinessId(null);
    expect(getActiveBusinessId()).toBeNull();
  });

  it("names the business on an authenticated request once one is switched to", async () => {
    setToken("tok-123");
    setActiveBusinessId(7);
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    await api.listInvoices();

    expect(global.fetch.mock.calls[0][1].headers["X-Business-Id"]).toBe("7");
  });

  it("sends nothing extra for a login that never switched", async () => {
    // The default is the caller's own tenant, and the backend must see exactly
    // the request shape it saw before this feature existed.
    setToken("tok-123");
    global.fetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0 }));

    await api.listInvoices();

    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty("X-Business-Id");
  });

  it("never names a business on an unauthenticated request", async () => {
    // A stale id in localStorage must not ride along on the public lookups. It
    // identifies nobody without a token, and `auth: false` is the statement
    // that this request carries no identity at all.
    setActiveBusinessId(7);
    global.fetch.mockResolvedValueOnce(jsonResponse({ valid: true }));

    await api.validateGstin("27AAPFU0939F1ZV");

    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty("X-Business-Id");
  });

  it("carries it on an export, which fetches outside `request`", async () => {
    // downloadExport builds its own headers, so it can and did drift from the
    // rule above — an export would then have come from the wrong business,
    // which is the one place that mistake produces a file to file with.
    setToken("tok-123");
    setActiveBusinessId(7);
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => "",
      blob: async () => new Blob(["csv,data"]),
      headers: { get: () => null },
    });

    await api.downloadExport("gstr1", "csv", "2026-04");

    expect(global.fetch.mock.calls[0][1].headers["X-Business-Id"]).toBe("7");
  });

  it("forgets the business on logout, since the next sign-in may be another login", async () => {
    setToken("tok-123");
    setActiveBusinessId(7);

    api.logout();

    expect(getToken()).toBeNull();
    expect(getActiveBusinessId()).toBeNull();
  });
});

describe("alerts", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for open alerts when a scope is given", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ items: [], total: 0, open_total: 0, limit: 50, offset: 0 }),
    );

    await api.listAlerts({ scope: "open" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/alerts?scope=open",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends no query at all when nothing is filtered", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ items: [], total: 0, open_total: 0, limit: 50, offset: 0 }),
    );

    await api.listAlerts();

    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/alerts");
  });

  it("posts a dismissal against the alert's own id", async () => {
    // The whole reason this method exists: the daily sweep will not raise an
    // alert it has already been told about, and until there was a client for
    // this endpoint no caller could ever tell it.
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 4, status: "dismissed" }));

    await api.dismissAlert(4);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/v1/alerts/4/dismiss");
    expect(options.method).toBe("POST");
  });

  it("posts a read against the alert's own id", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ id: 4, status: "read" }));

    await api.markAlertRead(4);

    expect(global.fetch.mock.calls[0][0]).toBe("/api/v1/alerts/4/read");
    expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("carries the bearer token, since alerts are tenant-scoped", async () => {
    setToken("tok-123");
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ items: [], total: 0, open_total: 0, limit: 50, offset: 0 }),
    );

    await api.listAlerts();

    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
  });

  it("surfaces the server's reason for refusing", async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Alert not found" }, { status: 404 }),
    );

    await expect(api.dismissAlert(999)).rejects.toThrow("Alert not found");
  });
});
