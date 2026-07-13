#!/usr/bin/env python3
"""Generate every product icon from public/icon-source.png.

Run: python3 scripts/generate-app-icon-variants.py
Requires: Pillow (pip install Pillow)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

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


# The source art is a dark-navy squircle plate centered on a pure-black
# canvas. The plate interior is very dark (max channel ~21-30) but the outer
# background is true black (0-1), so this threshold separates the two.
PLATE_THRESHOLD = 8


def extract_squircle_plate(source: Image.Image) -> Image.Image:
    """Crop the squircle plate out of the black canvas, alpha-masked to its
    rounded shape.

    The previous flood-fill approach removed everything darker than 40, which
    ate the plate itself and shipped just the glyph with a ragged glow halo —
    the "ugly icon" bug. The plate (including its internal glow) is the
    artwork; only the black margin and the soft outer glow are dropped.
    """
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()

    def first_lit_x(y: int, from_left: bool) -> int:
        rng = range(width) if from_left else range(width - 1, -1, -1)
        for x in rng:
            if max(pixels[x, y]) > PLATE_THRESHOLD:
                return x
        raise SystemExit(f"no plate pixels found on row {y}")

    def first_lit_y(x: int, from_top: bool) -> int:
        rng = range(height) if from_top else range(height - 1, -1, -1)
        for y in rng:
            if max(pixels[x, y]) > PLATE_THRESHOLD:
                return y
        raise SystemExit(f"no plate pixels found on column {x}")

    def consistent_edge(candidates: list[int]) -> int:
        if max(candidates) - min(candidates) > 4:
            raise SystemExit(f"plate edge probes disagree: {candidates}")
        return round(sum(candidates) / len(candidates))

    # Probe lines chosen in regions the glyph's outer glow cannot reach, so
    # every probe hits the plate edge itself.
    left = consistent_edge([first_lit_x(int(height * 0.2), True), first_lit_x(int(height * 0.8), True)])
    right = consistent_edge([first_lit_x(int(height * 0.2), False), first_lit_x(int(height * 0.8), False)])
    top = consistent_edge([first_lit_y(int(width * 0.2), True), first_lit_y(int(width * 0.8), True)])
    bottom = consistent_edge([first_lit_y(int(width * 0.2), False), first_lit_y(int(width * 0.8), False)])

    # Corner radius: walk down the (glow-free) top-left corner until the plate
    # reaches its flat left edge.
    radius = 0
    for dy in range(0, (bottom - top) // 2):
        if first_lit_x(top + dy, True) <= left + 1:
            radius = dy
            break
    if radius == 0:
        raise SystemExit("could not measure the plate corner radius")

    plate = rgb.crop((left, top, right + 1, bottom + 1)).convert("RGBA")

    # Supersampled rounded-rect mask clips the corners and any outer-glow
    # fringe cleanly instead of leaving black-backed halo pixels.
    scale = 4
    mask_big = Image.new("L", (plate.width * scale, plate.height * scale), 0)
    ImageDraw.Draw(mask_big).rounded_rectangle(
        [0, 0, plate.width * scale - 1, plate.height * scale - 1],
        radius=radius * scale,
        fill=255,
    )
    plate.putalpha(mask_big.resize(plate.size, Image.Resampling.LANCZOS))
    return plate


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

    icon = extract_squircle_plate(Image.open(SOURCE))
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
