"""Sitemap, robots.txt and OG image generation for search engine crawlers.

Public and read-only. The sitemap enumerates every auto-generated SEO page —
HSN/GST rate pages and GSTIN lookup pages — alongside the static tool pages,
so crawlers discover them without following links through JavaScript.

The OG image endpoint renders a branded 1200x630 PNG with Pillow so every
page can carry a unique social preview without shipping pre-built images.
"""
from __future__ import annotations

import io
import textwrap
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from PIL import Image, ImageDraw, ImageFont

from app.core.rate_limit import RateLimit

router = APIRouter(tags=["health"])

_seo_limit = RateLimit("seo_sitemap", "30/minute", by="ip")

SITE = "https://gst.doaide.com"

STATIC_PAGES = [
    "/",
    "/calculator",
    "/lookup",
    "/hsn",
    "/due-dates",
    "/resources",
    "/pricing",
    "/blog",
    "/blog/gst-filing-guide-india-2026",
    "/blog/hsn-code-lookup",
    "/blog/gst-compliance-checklist-small-business",
]

PRODUCT_SLUGS = [
    "rice", "wheat", "wheat-flour", "atta", "sugar", "milk", "tea", "coffee",
    "dal", "lentils", "biscuits", "bread", "chocolate", "soft-drinks",
    "cold-drinks", "cola", "bottled-water", "mineral-water", "cement",
    "medicine", "medicines", "drugs", "toothpaste", "shampoo", "soap",
    "detergent", "paint", "plastic-bags", "plastic-bottles", "tyres", "tires",
    "books", "newspapers", "cotton-fabric", "silk-fabric", "t-shirts",
    "shirts", "jeans", "trousers", "dresses", "shoes", "footwear", "sandals",
    "ceramic-tiles", "tiles", "marble", "granite", "gold-jewellery",
    "silver-jewellery", "jewellery", "steel", "iron", "air-conditioner", "ac",
    "refrigerator", "fridge", "washing-machine", "laptop", "computer",
    "desktop", "printer", "mobile-phone", "smartphone", "phone", "headphones",
    "earphones", "speaker", "television", "tv", "monitor", "led-bulb", "car",
    "motor-car", "suv", "motorcycle", "bike", "scooter", "bicycle",
    "spectacles", "sunglasses", "glasses", "furniture", "chair", "sofa",
    "table", "desk", "mattress", "toys", "pen", "pencil", "diapers",
    "sanitary-pads", "it-services", "consulting", "software-services",
    "legal-services", "accounting-services", "ca-services",
    "construction-services", "cab", "taxi", "uber", "ola", "freight",
    "courier", "education", "tuition", "hospital", "healthcare", "insurance",
    "banking", "gym", "salon", "laundry", "rent", "oil", "cooking-oil",
    "sunflower-oil", "palm-oil", "soybean-oil", "potato", "tomato",
    "vegetables", "cheese", "paneer", "ghee", "butter", "curd", "yogurt",
    "cream", "honey", "eggs", "chicken", "mutton", "fish", "prawns", "shrimp",
    "onion", "garlic", "ginger", "turmeric", "spices", "chilli", "pepper",
    "salt", "jaggery", "maida", "semolina", "suji", "noodles", "pasta",
    "chips", "namkeen", "papad", "pickles", "jam", "ketchup", "sauce",
    "ice-cream", "juice", "fruit-juice", "coconut-oil", "mustard-oil",
    "cigarettes", "tobacco", "petrol", "diesel", "lpg", "natural-gas",
    "perfume", "deodorant", "cosmetics", "lipstick", "face-cream",
    "sunscreen", "hair-oil", "conditioner", "hand-wash", "sanitizer",
    "disinfectant", "mosquito-repellent", "fertilizer", "pesticide",
    "pvc-pipe", "plastic-sheet", "rubber", "handbag", "wallet", "belt",
    "suitcase", "backpack", "paper", "notebook", "diary", "cardboard-box",
    "tissue-paper", "saree", "kurta", "salwar", "jacket", "sweater", "socks",
    "undergarments", "towel", "bedsheet", "curtain", "carpet", "rug",
    "helmet", "cap", "hat", "umbrella", "bricks", "cement-blocks",
    "sanitary-ware", "glass", "mirror", "gold", "silver", "diamond",
    "platinum", "stainless-steel", "aluminium", "copper", "brass",
    "steel-pipe", "steel-rod", "tmt-bar", "nuts-and-bolts", "wire", "nail",
    "lock", "fan", "ceiling-fan", "water-heater", "geyser", "iron-box",
    "mixer-grinder", "microwave", "oven", "water-purifier", "inverter", "ups",
    "battery", "solar-panel", "cable", "switch", "cctv-camera", "router",
    "tablet", "ipad", "pen-drive", "hard-disk", "keyboard", "mouse",
    "projector", "camera", "smartwatch", "watch", "wristwatch",
    "electric-vehicle", "ev", "auto-rickshaw", "tractor", "truck", "bus",
    "ambulance", "stethoscope", "wheelchair", "hearing-aid", "contact-lens",
    "bed", "wardrobe", "dining-table", "bookshelf", "lamp", "chandelier",
    "pillow", "cricket-bat", "football", "badminton-racket", "chess",
    "video-game", "playing-cards", "doll", "board-game", "eraser", "stapler",
    "scissors", "tape", "glue", "hotel-room", "restaurant-food", "catering",
    "movie-ticket", "event-ticket", "security-services", "cleaning-services",
    "transport", "logistics", "warehousing", "advertising", "web-development",
    "app-development", "cloud-hosting", "internet", "broadband",
    "mobile-recharge", "electricity", "real-estate", "flat", "apartment",
    "life-insurance", "health-insurance", "motor-insurance", "mutual-fund",
    "stock-broking", "chartered-accountant", "audit-services",
    "architect-services", "photography", "printing-services",
    "courier-services", "dry-cleaning", "tailoring", "beauty-parlour", "spa",
    "yoga-classes", "coaching", "training",
]

def _build_sitemap() -> str:
    today = date.today().isoformat()
    urls = []

    for page in STATIC_PAGES:
        urls.append(
            f"  <url><loc>{SITE}{page}</loc>"
            f"<changefreq>weekly</changefreq>"
            f"<priority>0.8</priority></url>"
        )

    for slug in PRODUCT_SLUGS:
        urls.append(
            f"  <url><loc>{SITE}/gst-rate/{slug}</loc>"
            f"<lastmod>{today}</lastmod>"
            f"<changefreq>monthly</changefreq>"
            f"<priority>0.7</priority></url>"
        )

    body = "\n".join(urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>"
    )


ROBOTS_TXT = f"""\
User-agent: *
Allow: /
Allow: /gst-rate/
Allow: /gstin/
Allow: /calculator
Allow: /lookup
Allow: /hsn
Allow: /due-dates
Allow: /resources
Allow: /pricing
Allow: /blog/

Disallow: /api/
Disallow: /invoices
Disallow: /upload
Disallow: /reconcile
Disallow: /itc
Disallow: /filing
Disallow: /suppliers
Disallow: /alerts
Disallow: /usage
Disallow: /status

Sitemap: {SITE}/api/v1/seo/sitemap.xml
"""


@router.get(
    "/seo/sitemap.xml",
    summary="XML sitemap for search engine crawlers",
    description=(
        "Lists all public pages — static tool pages, auto-generated HSN/GST "
        "rate pages, and GSTIN lookup pages — for crawler discovery."
    ),
    dependencies=[Depends(_seo_limit)],
)
def sitemap() -> Response:
    return Response(
        content=_build_sitemap(),
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get(
    "/seo/robots.txt",
    summary="Robots.txt for search engine crawlers",
    dependencies=[Depends(_seo_limit)],
)
def robots() -> Response:
    return Response(
        content=ROBOTS_TXT,
        media_type="text/plain",
        headers={"Cache-Control": "public, max-age=86400"},
    )


_og_limit = RateLimit("seo_og_image", "60/minute", by="ip")

_OG_WIDTH = 1200
_OG_HEIGHT = 630
_BG_COLOR = (37, 99, 235)  # #2563EB
_TEXT_COLOR = (255, 255, 255)
_WATERMARK_COLOR = (255, 255, 255, 153)  # 60% opacity white


def _wrap_text(text: str, max_chars: int = 35) -> list[str]:
    return textwrap.wrap(text, width=max_chars) or [""]


def _render_og_image(title: str, subtitle: str | None = None) -> bytes:
    img = Image.new("RGB", (_OG_WIDTH, _OG_HEIGHT), _BG_COLOR)
    draw = ImageDraw.Draw(img)

    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 52)
        subtitle_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
        watermark_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except (OSError, IOError):
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        watermark_font = ImageFont.load_default()

    title_lines = _wrap_text(title, max_chars=30)
    line_height = 64
    total_height = len(title_lines) * line_height
    if subtitle:
        total_height += 60

    y = (_OG_HEIGHT - total_height) // 2 - 30

    for line in title_lines:
        bbox = draw.textbbox((0, 0), line, font=title_font)
        w = bbox[2] - bbox[0]
        draw.text(((_OG_WIDTH - w) // 2, y), line, fill=_TEXT_COLOR, font=title_font)
        y += line_height

    if subtitle:
        sub_lines = _wrap_text(subtitle, max_chars=50)
        y += 20
        for line in sub_lines[:2]:
            bbox = draw.textbbox((0, 0), line, font=subtitle_font)
            w = bbox[2] - bbox[0]
            draw.text(
                ((_OG_WIDTH - w) // 2, y),
                line, fill=_WATERMARK_COLOR, font=subtitle_font,
            )
            y += 38

    watermark = "doaide.com"
    bbox = draw.textbbox((0, 0), watermark, font=watermark_font)
    w = bbox[2] - bbox[0]
    draw.text(
        ((_OG_WIDTH - w) // 2, _OG_HEIGHT - 60),
        watermark, fill=_WATERMARK_COLOR, font=watermark_font,
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get(
    "/seo/og-image",
    summary="Dynamic Open Graph image",
    description=(
        "Renders a branded 1200x630 PNG for social sharing previews. "
        "Pass title and optional subtitle as query params."
    ),
    dependencies=[Depends(_og_limit)],
)
def og_image(
    title: str = Query(..., min_length=1, max_length=200),
    subtitle: str | None = Query(None, max_length=300),
) -> Response:
    png = _render_og_image(title, subtitle)
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
