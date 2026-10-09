"""Draw the GSTIndia favicon: a receipt with a check mark, in the brand green.

Run it to regenerate frontend/public/, so the icons are not four binaries with
no source:

    backend/.venv/bin/python frontend/scripts/make_favicon.py

Everything is drawn at 16x the target size and downsampled with LANCZOS, which
is what gives the diagonal check and the receipt's torn edge clean antialiasing
at 16px. Colours come from src/index.css (--brand, --brand-dark, --good).
Pillow is already a backend dependency; nothing new is installed for this.
"""

import os

from PIL import Image, ImageDraw

BRAND = (26, 107, 79)  # --brand  #1a6b4f
BRAND_DARK = (18, 80, 59)  # --brand-dark  #12503b
PAPER = (255, 255, 255)
RULE = (196, 206, 216)
CHECK = (26, 127, 79)  # --good  #1a7f4f

SS = 16  # supersample factor


def gradient(size, top, bottom):
    """Vertical brand gradient, drawn a row at a time."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        d.line(
            [(0, y), (size, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return img


def draw_icon(px, rounded=True, detail=True):
    """Render one icon at `px` pixels square.

    `detail` draws the ruled lines on the receipt; they turn to mud below
    32px, so the 16px icon leaves them out and lets the shape carry it.
    """
    n = px * SS
    u = n / 100.0  # one unit = 1% of the canvas, so the geometry reads as %

    icon = gradient(n, BRAND, BRAND_DARK).convert("RGBA")
    if rounded:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=22 * u, fill=255)
        icon.putalpha(mask)

    d = ImageDraw.Draw(icon)

    # The receipt: a slip of paper with a torn bottom edge. The check sits
    # wholly inside it — a mark that crossed onto the green needed a white
    # keyline to stay readable, and at 16px that keyline swallowed the shape.
    left, right, top = 21 * u, 79 * u, 13 * u
    body_bottom, teeth_bottom = 80 * u, 88 * u
    d.rounded_rectangle([left, top, right, body_bottom], radius=5 * u, fill=PAPER)

    teeth = 4
    step = (right - left) / (teeth * 2)
    edge = [(left, body_bottom - 3 * u)]
    for i in range(teeth * 2 + 1):
        edge.append((left + i * step, teeth_bottom if i % 2 else body_bottom - 3 * u))
    edge.append((right, body_bottom - 3 * u))
    d.polygon(edge, fill=PAPER)

    if detail:
        for y, span in ((24, 0.80), (34, 0.55)):
            d.rounded_rectangle(
                [left + 7 * u, y * u, left + 7 * u + (right - left - 14 * u) * span, (y + 5) * u],
                radius=2.5 * u,
                fill=RULE,
            )

    stroke = (13 if detail else 14) * u
    path = [(32 * u, 57 * u), (44 * u, 69 * u), (68 * u, 37 * u)]
    d.line(path, fill=CHECK, width=round(stroke), joint="curve")
    for point in (path[0], path[-1]):  # round the caps; PIL only joins interiors
        d.ellipse(
            [point[0] - stroke / 2, point[1] - stroke / 2, point[0] + stroke / 2, point[1] + stroke / 2],
            fill=CHECK,
        )

    return icon.resize((px, px), Image.Resampling.LANCZOS)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "public")
    os.makedirs(out, exist_ok=True)

    png32 = draw_icon(32)
    png16 = draw_icon(16, detail=False)
    png32.save(os.path.join(out, "favicon-32x32.png"))
    png16.save(os.path.join(out, "favicon-16x16.png"))

    # Apple wants an opaque square; iOS applies its own corner mask.
    apple = draw_icon(180, rounded=False)
    flat = Image.new("RGB", apple.size, BRAND)
    flat.paste(apple, mask=apple.split()[3])
    flat.save(os.path.join(out, "apple-touch-icon.png"))

    # 48px is the size Windows and some browsers reach for. The .ico is saved
    # from the largest render: Pillow drops any requested size bigger than the
    # image it is called on, so saving from the 32 silently yields a two-entry
    # icon. Each entry is a purpose-drawn render, not a resample of another.
    png48 = draw_icon(48)
    png48.save(
        os.path.join(out, "favicon.ico"),
        format="ICO",
        sizes=[(48, 48), (32, 32), (16, 16)],
        append_images=[png32, png16],
    )
    print("wrote", sorted(os.listdir(out)))


if __name__ == "__main__":
    main()
