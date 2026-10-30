"""Рисует исходную иконку VentoNote (1024x1024) в стиле нового логотипа.

Тёмно-фиолетовый фон, страница с загнутым углом, строки текста и искра.
Запуск: python tools/make_icon.py && pnpm tauri icon app-icon.png
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "app-icon.png"

BG_TOP = (46, 20, 88)
BG_BOTTOM = (16, 10, 30)
PAGE_TOP = (146, 100, 246)
PAGE_BOTTOM = (104, 58, 210)
FOLD_TOP = (233, 220, 255)
FOLD_BOTTOM = (183, 148, 246)
BAR_TOP = (226, 213, 255)
BAR_BOTTOM = (167, 139, 250)
SPARK = (243, 232, 255)


def vertical_gradient(
    size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]
) -> Image.Image:
    width, height = size
    strip = Image.new("RGB", (1, height))
    pixels = strip.load()
    for y in range(height):
        t = y / max(1, height - 1)
        pixels[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return strip.resize((width, height), Image.BILINEAR)


def glow(size: int, center: tuple[float, float], radius: float, color: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def sparkle(cx: float, cy: float, radius: float) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    waist = radius * 0.13
    points = [
        (cx, cy - radius),
        (cx + waist, cy - waist),
        (cx + radius, cy),
        (cx + waist, cy + waist),
        (cx, cy + radius),
        (cx - waist, cy + waist),
        (cx - radius, cy),
        (cx - waist, cy - waist),
    ]
    ImageDraw.Draw(mask).polygon(points, fill=255)

    solid = Image.new("RGBA", (SIZE, SIZE), SPARK + (255,))
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Свечение строим из маски, а не размытием RGBA: иначе прозрачные пиксели
    # подмешивают чёрный и вокруг искры появляется грязный ореол.
    halo_mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.5)).point(lambda value: int(value * 0.6))
    layer.paste(solid, (0, 0), halo_mask)
    layer.paste(solid, (0, 0), mask)

    return layer


def page_layer() -> Image.Image:
    """Страница с загнутым углом, строками и искрой — до поворота."""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Задний лист чуть смещён — как в логотипе.
    back = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(back).rounded_rectangle(
        (318, 296, 700, 806), radius=58, fill=(109, 40, 217, 150)
    )
    layer.alpha_composite(back.rotate(-11, resample=Image.BICUBIC, center=(512, 512)))

    # Передний лист.
    page_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(page_mask).rounded_rectangle((336, 244, 736, 772), radius=64, fill=255)

    page_gradient = vertical_gradient((SIZE, SIZE), PAGE_TOP, PAGE_BOTTOM)
    layer.paste(page_gradient, (0, 0), page_mask)

    # Загнутый угол: светлый треугольник и линия сгиба.
    fold_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(fold_mask).polygon([(596, 244), (736, 244), (736, 384)], fill=255)
    fold_mask = Image.composite(fold_mask, Image.new("L", (SIZE, SIZE), 0), page_mask)
    fold_gradient = vertical_gradient((SIZE, SIZE), FOLD_TOP, FOLD_BOTTOM)
    layer.paste(fold_gradient, (0, 0), fold_mask)

    draw = ImageDraw.Draw(layer)
    draw.line([(596, 244), (736, 384)], fill=(120, 72, 220, 200), width=5)

    # Строки текста.
    bars = [(404, 404, 640, 446), (404, 492, 664, 534), (404, 580, 560, 622)]
    for x0, y0, x1, y1 in bars:
        bar_mask = Image.new("L", (SIZE, SIZE), 0)
        ImageDraw.Draw(bar_mask).rounded_rectangle((x0, y0, x1, y1), radius=21, fill=255)
        bar_gradient = vertical_gradient((SIZE, SIZE), BAR_TOP, BAR_BOTTOM)
        layer.paste(bar_gradient, (0, 0), bar_mask)

    return layer.rotate(-7, resample=Image.BICUBIC, center=(512, 512))


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    shape = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=232, fill=255)

    background = vertical_gradient((SIZE, SIZE), BG_TOP, BG_BOTTOM).convert("RGBA")
    background.alpha_composite(glow(SIZE, (470, 470), 300, (124, 58, 237, 120)))
    background.putalpha(shape)
    canvas.alpha_composite(background)

    canvas.alpha_composite(page_layer())

    # Искра рисуется после поворота, чтобы размытие не темнело на прозрачном фоне.
    canvas.alpha_composite(sparkle(744, 664, 96))

    # Тонкая светлая окантовка плитки.
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        (6, 6, SIZE - 7, SIZE - 7), radius=228, outline=(196, 181, 253, 90), width=6
    )
    canvas.alpha_composite(border)

    canvas.save(OUT)
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
