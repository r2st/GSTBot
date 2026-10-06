import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
  embedSnippet,
  fullUrl,
  origin,
  twitterUrl,
  whatsappUrl,
  widgetEmbedSnippet,
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

describe("widgetEmbedSnippet", () => {
  it("returns a /widget iframe for calculator", () => {
    const html = widgetEmbedSnippet("calculator");
    expect(html).toContain("<iframe");
    expect(html).toContain("/widget");
    expect(html).toContain('height="460"');
  });

  it("includes theme and rate params", () => {
    const html = widgetEmbedSnippet("calculator", { theme: "light", rate: 5 });
    expect(html).toContain("theme=light");
    expect(html).toContain("rate=5");
  });

  it("omits rate param when 18 (default)", () => {
    const html = widgetEmbedSnippet("calculator", { theme: "dark", rate: 18 });
    expect(html).not.toContain("rate=");
  });

  it("includes custom width", () => {
    const html = widgetEmbedSnippet("calculator", { width: 400 });
    expect(html).toContain("width=400");
    expect(html).toContain('width="400"');
  });

  it("falls back to embedSnippet for non-calculator tools", () => {
    const html = widgetEmbedSnippet("lookup");
    expect(html).toContain("/embed/lookup");
    expect(html).not.toContain("/widget");
  });
});
