"""Sitemap and robots.txt — public, read-only, cached."""
from __future__ import annotations

import xml.etree.ElementTree as ET


class TestSitemap:
    def test_returns_valid_xml(self, client):
        response = client.get("/api/v1/seo/sitemap.xml")
        assert response.status_code == 200
        assert "application/xml" in response.headers["content-type"]
        root = ET.fromstring(response.text)
        assert root.tag.endswith("urlset")

    def test_contains_static_pages(self, client):
        body = client.get("/api/v1/seo/sitemap.xml").text
        assert "https://gst.doaide.com/calculator" in body
        assert "https://gst.doaide.com/hsn" in body
        assert "https://gst.doaide.com/lookup" in body

    def test_contains_product_rate_pages(self, client):
        body = client.get("/api/v1/seo/sitemap.xml").text
        assert "https://gst.doaide.com/gst-rate/laptop" in body
        assert "https://gst.doaide.com/gst-rate/mobile-phone" in body
        assert "https://gst.doaide.com/gst-rate/cement" in body

    def test_each_product_url_has_monthly_changefreq(self, client):
        root = ET.fromstring(client.get("/api/v1/seo/sitemap.xml").text)
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        product_urls = [
            url for url in root.findall("s:url", ns)
            if "gst-rate" in url.find("s:loc", ns).text
        ]
        assert len(product_urls) > 100
        for url in product_urls[:5]:
            assert url.find("s:changefreq", ns).text == "monthly"

    def test_is_cached(self, client):
        response = client.get("/api/v1/seo/sitemap.xml")
        assert "max-age=3600" in response.headers.get("cache-control", "")

    def test_needs_no_authentication(self, client):
        assert client.get("/api/v1/seo/sitemap.xml").status_code == 200


class TestRobotsTxt:
    def test_returns_plain_text(self, client):
        response = client.get("/api/v1/seo/robots.txt")
        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]

    def test_allows_public_pages(self, client):
        body = client.get("/api/v1/seo/robots.txt").text
        assert "Allow: /gst-rate/" in body
        assert "Allow: /gstin/" in body
        assert "Allow: /calculator" in body

    def test_disallows_private_pages(self, client):
        body = client.get("/api/v1/seo/robots.txt").text
        assert "Disallow: /api/" in body
        assert "Disallow: /invoices" in body

    def test_includes_sitemap_url(self, client):
        body = client.get("/api/v1/seo/robots.txt").text
        assert "Sitemap: https://gst.doaide.com/api/v1/seo/sitemap.xml" in body

    def test_is_cached(self, client):
        response = client.get("/api/v1/seo/robots.txt")
        assert "max-age=86400" in response.headers.get("cache-control", "")

    def test_needs_no_authentication(self, client):
        assert client.get("/api/v1/seo/robots.txt").status_code == 200
