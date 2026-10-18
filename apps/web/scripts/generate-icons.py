"""Generate favicon / PWA / app icons from the MultiFrame logo.

The logo is used as is: the source PNG (public/logo-multiframe.png) is a
single-colour mask, rendered here in black (exactly what the app header does
with `filter: brightness(0)`), centred on a white square. No redraw, no
recolour beyond black.

Run from apps/web:  python3 scripts/generate-icons.py
Requires Pillow.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SRC = PUBLIC / "logo-multiframe.png"

WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0)

# Fraction of the square width taken by the logo.
#  - tiny favicons: as wide as possible so the wordmark stays readable
#  - regular icons: comfortable padding
#  - maskable: the whole logo (incl. corners) inside the 80% safe-zone circle
FRAC_TINY = 0.92
FRAC_ANY = 0.82
FRAC_APPLE = 0.80
FRAC_MASKABLE = 0.70


def load_mask() -> Image.Image:
    im = Image.open(SRC).convert("RGBA")
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    return alpha.crop(bbox) if bbox else alpha


MASK = load_mask()


def black_logo(width: int) -> Image.Image:
    """Black logo of the given width, alpha resampled from the source mask."""
    h = max(1, round(width * MASK.height / MASK.width))
    a = MASK.resize((width, h), Image.LANCZOS)
    logo = Image.new("RGBA", (width, h), BLACK + (0,))
    logo.putalpha(a)
    return logo


def square(size: int, frac: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), WHITE)
    logo = black_logo(max(1, round(size * frac)))
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas.convert("RGB")


def save_png(img: Image.Image, name: str) -> None:
    img.save(PUBLIC / name, optimize=True)
    print("wrote", name, img.size)


def main() -> None:
    for s in (16, 32, 48, 64):
        save_png(square(s, FRAC_TINY if s <= 48 else FRAC_ANY), f"favicon-{s}.png")

    ico_frames = [square(s, FRAC_TINY) for s in (16, 32, 48)]
    ico_frames[-1].save(
        PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=ico_frames[:-1],
    )
    print("wrote favicon.ico 16/32/48")

    save_png(square(180, FRAC_APPLE), "apple-touch-icon.png")
    for s in (128, 192, 256, 512):
        save_png(square(s, FRAC_ANY), f"icon-{s}.png")
    for s in (192, 512):
        save_png(square(s, FRAC_MASKABLE), f"icon-maskable-{s}.png")
    save_png(square(1024, FRAC_ANY), "app-icon-1024.png")

    # SVG favicon: white square + the black logo embedded as PNG (no redraw).
    logo = black_logo(MASK.width)
    buf = io.BytesIO()
    logo.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    vb = 512
    w = round(vb * FRAC_TINY)
    h = round(w * MASK.height / MASK.width)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}" width="{vb}" height="{vb}">'
        f'<rect width="{vb}" height="{vb}" fill="#fff"/>'
        f'<image x="{(vb - w) / 2:g}" y="{(vb - h) / 2:g}" width="{w}" height="{h}" '
        f'href="data:image/png;base64,{b64}"/></svg>\n'
    )
    (PUBLIC / "favicon.svg").write_text(svg)
    print("wrote favicon.svg")


if __name__ == "__main__":
    main()
