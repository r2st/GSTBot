import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SeoHead from "./SeoHead";

function Wrapper(props) {
  return <SeoHead {...props} />;
}

describe("SeoHead", () => {
  afterEach(cleanup);

  it("sets the meta description", () => {
    render(<Wrapper title="Test" description="A test desc" path="/test" />);

    const meta = document.querySelector('meta[name="description"]');
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("A test desc");
  });

  it("sets og:title", () => {
    render(<Wrapper title="OG Title" description="desc" path="/test" />);

    const meta = document.querySelector('meta[property="og:title"]');
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("OG Title");
  });

  it("sets og:url with base URL and path", () => {
    render(<Wrapper title="T" description="d" path="/gst-rate/laptop" />);

    const meta = document.querySelector('meta[property="og:url"]');
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("https://gst.doaide.com/gst-rate/laptop");
  });

  it("injects JSON-LD script tags", () => {
    const schema = { "@context": "https://schema.org", "@type": "Product", name: "Test" };
    render(<Wrapper title="T" description="d" path="/test" jsonLd={schema} />);

    const script = document.getElementById("seo-jsonld-0");
    expect(script).toBeTruthy();
    expect(JSON.parse(script.textContent)).toEqual(schema);
  });

  it("injects breadcrumb JSON-LD", () => {
    const crumbs = [
      { name: "Home", url: "https://gst.doaide.com" },
      { name: "HSN Finder", url: "https://gst.doaide.com/hsn" },
      { name: "Laptop" },
    ];
    render(<Wrapper title="T" description="d" path="/test" breadcrumbs={crumbs} />);

    const script = document.getElementById("seo-breadcrumb");
    expect(script).toBeTruthy();
    const data = JSON.parse(script.textContent);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement[0].name).toBe("Home");
  });

  it("cleans up JSON-LD on unmount", () => {
    const schema = { "@context": "https://schema.org", "@type": "Product", name: "Test" };
    const { unmount } = render(<Wrapper title="T" description="d" path="/test" jsonLd={schema} />);

    expect(document.getElementById("seo-jsonld-0")).toBeTruthy();
    unmount();
    expect(document.getElementById("seo-jsonld-0")).toBeNull();
  });

  it("handles array of JSON-LD schemas", () => {
    const schemas = [
      { "@context": "https://schema.org", "@type": "Product", name: "P" },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] },
    ];
    render(<Wrapper title="T" description="d" path="/test" jsonLd={schemas} />);

    expect(document.getElementById("seo-jsonld-0")).toBeTruthy();
    expect(document.getElementById("seo-jsonld-1")).toBeTruthy();
  });

  it("sets the canonical link element", () => {
    render(<Wrapper title="T" description="d" path="/calculator" />);

    const link = document.querySelector('link[rel="canonical"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://gst.doaide.com/calculator");
  });

  it("updates the canonical link on re-render with a new path", () => {
    const { rerender } = render(<Wrapper title="T" description="d" path="/calculator" />);

    rerender(<Wrapper title="T" description="d" path="/lookup" />);

    const link = document.querySelector('link[rel="canonical"]');
    expect(link.getAttribute("href")).toBe("https://gst.doaide.com/lookup");
  });
});
