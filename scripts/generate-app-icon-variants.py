#!/usr/bin/env python3
"""Generate every product icon from public/icon-source.png.

Run: python3 scripts/generate-app-icon-variants.py
Requires: Pillow (pip install Pillow)
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "icon-source.png"
PUBLIC = ROOT / "public"
VARIANTS = (
    "original",
    "bright",
    "dark",
    "colorful",
    "high-contrast",
    "white-navy",
    "white-sky",
    "white-rose",
    "white-emerald",
    "white-amber",
    "white-violet",
    "rainbow",
)
LINUX_SIZES = (16, 32, 48, 64, 128, 256, 512)
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64)


def remove_connected_black_background(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    exterior = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if exterior[offset] or max(pixels[x, y]) > 40:
            return
        exterior[offset] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    rgba = rgb.convert("RGBA")
    alpha = Image.new("L", rgb.size, 255)
    alpha.putdata([0 if value else 255 for value in exterior])
    rgba.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise SystemExit("source icon has no visible pixels")

    return rgba.crop(bounds)


def render_canvas(icon: Image.Image, size: int, inset: int = 0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target_size = size - inset * 2
    resized = icon.resize((target_size, target_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, (inset, inset))
    return canvas


def render_tray_template(icon: Image.Image, size: int) -> Image.Image:
    rgb = icon.convert("RGB")
    alpha = Image.new("L", rgb.size, 0)
    rgb_bytes = rgb.tobytes()
    source_pixels = (
        (rgb_bytes[offset], rgb_bytes[offset + 1], rgb_bytes[offset + 2])
        for offset in range(0, len(rgb_bytes), 3)
    )
    alpha.putdata([
        max(0, min(255, (max(green, blue) - 80) * 4))
        if green > 105 and max(green, blue) - red > 25
        else 0
        for red, green, blue in source_pixels
    ])
    bounds = alpha.getbbox()
    if bounds is None:
        raise SystemExit("could not isolate the terminal glyph for the tray icon")
    glyph = alpha.crop(bounds)
    target = size - max(4, size // 5)
    glyph.thumbnail((target, target), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    offset = ((size - glyph.width) // 2, (size - glyph.height) // 2)
    mask.paste(glyph, offset)
    result.putalpha(mask)
    return result


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"source icon not found: {SOURCE}")

    icon = remove_connected_black_background(Image.open(SOURCE))
    windows_icon = render_canvas(icon, 1024)
    macos_icon = render_canvas(icon, 1024, 61)
    macos_runtime_icon = render_canvas(icon, 1024, 100)

    save_png(macos_icon, PUBLIC / "icon.png")
    save_png(windows_icon, PUBLIC / "icon-win.png")
    for variant in VARIANTS:
        save_png(macos_icon, PUBLIC / "icons" / "variants" / f"{variant}.png")
        save_png(macos_runtime_icon, PUBLIC / "icons" / "variants" / "macos" / f"{variant}.png")
    for size in LINUX_SIZES:
        save_png(
            windows_icon.resize((size, size), Image.Resampling.LANCZOS),
            ROOT / "build" / "icons" / f"{size}x{size}.png",
        )

    save_png(windows_icon.resize((16, 16), Image.Resampling.LANCZOS), PUBLIC / "tray-icon.png")
    save_png(windows_icon.resize((32, 32), Image.Resampling.LANCZOS), PUBLIC / "tray-icon@2x.png")
    save_png(render_tray_template(icon, 22), PUBLIC / "tray-iconTemplate.png")
    save_png(render_tray_template(icon, 44), PUBLIC / "tray-iconTemplate@2x.png")
    windows_icon.save(
        PUBLIC / "tray-icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
    )
    print("wrote public/tray-icon.ico")


if __name__ == "__main__":
    main()
