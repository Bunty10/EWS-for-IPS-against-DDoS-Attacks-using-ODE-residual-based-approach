"""
Generate the application icon for Residual-based ODE EWS IPS.

Produces a professional shield + network-pulse mark (brand cyan on a dark rounded
tile) and writes:
  - packaging/icon.ico              (used by PyInstaller + Inno Setup)
  - frontend/public/favicon.ico     (browser/tab favicon)

Run once on the build machine (Pillow required, already in the environment):
    python packaging/make_icon.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SIZE = 512
BG = (15, 17, 21, 255)          # deep charcoal tile
CYAN = (34, 195, 230, 255)      # brand primary
CYAN_SOFT = (34, 195, 230, 90)
WHITE = (244, 246, 248, 255)


def _rounded_tile(dr, size):
    r = int(size * 0.22)
    dr.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)


def _shield(dr, size):
    """A centered shield outline."""
    cx = size / 2
    top = size * 0.16
    bottom = size * 0.86
    half = size * 0.30
    shoulder = size * 0.34
    pts = [
        (cx, top),
        (cx + half, shoulder),
        (cx + half, size * 0.55),
        (cx, bottom),
        (cx - half, size * 0.55),
        (cx - half, shoulder),
    ]
    dr.polygon(pts, fill=(34, 195, 230, 28))
    dr.line(pts + [pts[0]], fill=CYAN, width=max(4, int(size * 0.02)), joint="curve")


def _pulse(dr, size):
    """An EKG-style early-warning pulse across the shield."""
    y = size * 0.52
    w = max(4, int(size * 0.022))
    x0 = size * 0.24
    x1 = size * 0.76
    seg = (x1 - x0) / 6
    pts = [
        (x0, y),
        (x0 + seg * 1.2, y),
        (x0 + seg * 2.0, y - size * 0.14),
        (x0 + seg * 3.0, y + size * 0.16),
        (x0 + seg * 3.8, y),
        (x1, y),
    ]
    dr.line(pts, fill=WHITE, width=w, joint="curve")
    # a node highlight at the peak
    px, py = x0 + seg * 2.0, y - size * 0.14
    dr.ellipse([px - w, py - w, px + w, py + w], fill=CYAN)


def build():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    _rounded_tile(dr, SIZE)
    _shield(dr, SIZE)
    _pulse(dr, SIZE)

    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = os.path.join(HERE, "icon.ico")
    img.save(ico_path, format="ICO", sizes=sizes)
    print("wrote", ico_path)

    public = os.path.join(ROOT, "frontend", "public")
    os.makedirs(public, exist_ok=True)
    fav = os.path.join(public, "favicon.ico")
    img.save(fav, format="ICO", sizes=sizes)
    print("wrote", fav)

    # A PNG is handy for docs / the pywebview window where supported.
    png = os.path.join(HERE, "icon.png")
    img.save(png, format="PNG")
    print("wrote", png)


if __name__ == "__main__":
    build()
