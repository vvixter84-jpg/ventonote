"""Рисует исходную иконку VentoNote (1024x1024) для `pnpm tauri icon`.

Запуск:  python tools/make_icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "app-icon.png"

TOP_LEFT = (93, 155, 255)
BOTTOM_RIGHT = (26, 74, 190)


def diagonal_gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(
                round(start + (end - start) * t)
                for start, end in zip(TOP_LEFT, BOTTOM_RIGHT)
            )
    return image


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=int(SIZE * 0.22), fill=255
    )

    canvas.paste(diagonal_gradient(SIZE), (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(SIZE * 0.52))

    letter = "V"
    left, top, right, bottom = draw.textbbox((0, 0), letter, font=font)
    x = (SIZE - (right - left)) / 2 - left
    y = (SIZE - (bottom - top)) / 2 - top
    draw.text((x, y), letter, font=font, fill=(255, 255, 255, 255))

    # Тонкая световая дуга сверху — «ветер» в логотипе.
    gloss = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse(
        (-SIZE * 0.35, -SIZE * 0.9, SIZE * 1.35, SIZE * 0.55),
        fill=(255, 255, 255, 26),
    )
    canvas.alpha_composite(gloss.filter(ImageFilter.GaussianBlur(SIZE * 0.06)))

    canvas.save(OUT)
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
