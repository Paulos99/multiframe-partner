"""Render public/og-share.jpg — maximum type size for messenger thumbs."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 720

BG_DEEP = (12, 51, 44)
BG_MID = (1, 100, 79)
BG_LIGHT = (42, 179, 139)
INK = (255, 255, 255)
MUTED = (220, 236, 230)
BTN_BG = (255, 255, 255)
BTN_TEXT = (1, 100, 79)

FONT = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"


def recolor(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    im = im.convert("RGBA")
    out = Image.new("RGBA", im.size, (*rgb, 0))
    out.putalpha(im.getchannel("A"))
    return out


def trim(im: Image.Image, threshold: int = 16) -> Image.Image:
    mask = im.getchannel("A").point(lambda p: 255 if p > threshold else 0)
    box = mask.getbbox()
    return im.crop(box) if box else im


def text_size(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int]:
    box = font.getbbox(text)
    return box[2] - box[0], box[3] - box[1]


def draw_text(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], font, fill) -> tuple[int, int]:
    box = font.getbbox(text)
    draw.text((xy[0] - box[0], xy[1] - box[1]), text, font=font, fill=fill)
    return text_size(font, text)


def draw_centered(draw, text, y, font, fill) -> int:
    tw, th = text_size(font, text)
    box = font.getbbox(text)
    x = (W - tw) // 2 - box[0]
    draw.text((x, y), text, font=font, fill=fill)
    return th


base = Image.new("RGBA", (W, H), (*BG_DEEP, 255))
grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(grad)
gdraw.ellipse((200, -260, 1200, 420), fill=(*BG_MID, 90))
gdraw.ellipse((-200, 400, 600, 1000), fill=(*BG_LIGHT, 38))
gdraw.ellipse((700, 380, 1500, 980), fill=(*BG_MID, 55))
base.alpha_composite(grad.filter(ImageFilter.GaussianBlur(80)))

rail = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(rail).rectangle((0, 0, W, 12), fill=(*BG_LIGHT, 210))
base.alpha_composite(rail)

draw = ImageDraw.Draw(base)

# Brand centered row
stp = trim(recolor(Image.open("public/logo-stp.png"), INK))
mf = trim(recolor(Image.open("public/logo-multiframe.png"), INK))
stp_h = 70
stp = stp.resize((round(stp.width * stp_h / stp.height), stp_h), Image.Resampling.LANCZOS)
mf_h = 46
mf = mf.resize((round(mf.width * mf_h / mf.height), mf_h), Image.Resampling.LANCZOS)
brand_font = ImageFont.truetype(FONT, 34)
brand = "Проблемомер"
bw, bh = text_size(brand_font, brand)
gap = 18
div = 18
row_w = stp.width + gap + mf.width + div + 2 + div + bw
row_x = (W - row_w) // 2
row_y = 48
base.alpha_composite(stp, (row_x, row_y))
mf_x = row_x + stp.width + gap
base.alpha_composite(mf, (mf_x, row_y + (stp_h - mf_h) // 2 + 1))
div_x = mf_x + mf.width + div
draw.line((div_x, row_y + 14, div_x, row_y + stp_h - 14), fill=(*MUTED, 170), width=3)
draw_text(draw, brand, (div_x + div, row_y + (stp_h - bh) // 2), brand_font, MUTED)

# Massive centered copy
title_font = ImageFont.truetype(FONT, 96)
sub_font = ImageFont.truetype(FONT, 46)
btn_font = ImageFont.truetype(FONT, 48)

y = 158
y += draw_centered(draw, "Слышите соседей", y, title_font, INK) - 2
title_bottom = y + draw_centered(draw, "сверху?", y, title_font, INK)

label = "Пройти расчёт бесплатно"
lw, lh = text_size(btn_font, label)
btn_w = lw + 80
btn_h = lh + 44
btn_x = (W - btn_w) // 2
btn_y = H - btn_h - 32

# Subtitle sits in the gap between headline and CTA
sub1 = "Узнайте за 2 минуты"
sub2 = "эффект от звукоизоляции потолка"
_, sh1 = text_size(sub_font, sub1)
_, sh2 = text_size(sub_font, sub2)
sub_block_h = sh1 + 4 + sh2
gap_top = title_bottom
gap_bottom = btn_y
sub_y = gap_top + (gap_bottom - gap_top - sub_block_h) // 2
sub_y += draw_centered(draw, sub1, sub_y, sub_font, MUTED) + 4
draw_centered(draw, sub2, sub_y, sub_font, MUTED)

bshadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(bshadow).rounded_rectangle(
    (btn_x, btn_y + 12, btn_x + btn_w, btn_y + btn_h + 18),
    radius=22,
    fill=(0, 0, 0, 85),
)
base.alpha_composite(bshadow.filter(ImageFilter.GaussianBlur(16)))

draw = ImageDraw.Draw(base)
draw.rounded_rectangle((btn_x, btn_y, btn_x + btn_w, btn_y + btn_h), radius=22, fill=BTN_BG)
lb = btn_font.getbbox(label)
draw.text(
    (btn_x + (btn_w - lw) // 2 - lb[0], btn_y + (btn_h - lh) // 2 - lb[1] - 1),
    label,
    font=btn_font,
    fill=BTN_TEXT,
)

rgb = base.convert("RGB")
rgb.save("public/og-share.jpg", quality=92, subsampling=0, optimize=True)
print("saved", rgb.size, "public/og-share.jpg")
