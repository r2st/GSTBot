import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
  embedSnippet,
  fullUrl,
  origin,
  twitterUrl,
  whatsappUrl,
} from "./share";

describe("origin", () => {
  it("returns window.location.origin in a browser", () => {
    expect(origin()).toBe(window.location.origin);
  });
});

describe("fullUrl", () => {
  it("prepends origin to the path", () => {
    expect(fullUrl("/calculator")).toBe(`${window.location.origin}/calculator`);
  });
});

describe("whatsappUrl", () => {
  it("encodes text and url into a wa.me link", () => {
    const url = whatsappUrl("check this", "http://localhost/calc");
    expect(url).toBe(
      "https://wa.me/?text=" +
        encodeURIComponent("check this http://localhost/calc"),
    );
  });

  it("encodes only text when url is omitted", () => {
    const url = whatsappUrl("just text");
    expect(url).toBe("https://wa.me/?text=" + encodeURIComponent("just text"));
  });
});

describe("twitterUrl", () => {
  it("encodes text and url into a twitter intent link", () => {
    const url = twitterUrl("my tweet", "http://localhost/page");
    expect(url).toContain("twitter.com/intent/tweet");
    expect(url).toContain("text=my+tweet");
    expect(url).toContain("url=");
  });

  it("omits url param when not provided", () => {
    const url = twitterUrl("just text");
    expect(url).toContain("text=just+text");
    expect(url).not.toContain("url=");
  });
});

describe("copyToClipboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("succeeds with the clipboard API", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const ok = await copyToClipboard("hello");
    expect(ok).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("returns false when both methods fail", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
    });
    document.execCommand = vi.fn(() => { throw new Error("no"); });
    const ok = await copyToClipboard("text");
    expect(ok).toBe(false);
  });
});

describe("embedSnippet", () => {
  it("returns an iframe HTML string", () => {
    const html = embedSnippet("calculator");
    expect(html).toContain("<iframe");
    expect(html).toContain("calculator");
    expect(html).toContain('width="100%"');
    expect(html).toContain('height="400"');
  });

  it("uses custom dimensions", () => {
    const html = embedSnippet("lookup", { width: "500", height: "600" });
    expect(html).toContain('width="500"');
    expect(html).toContain('height="600"');
  });
});
