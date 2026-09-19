from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("API_KEY")

RETEXTURE_PRESETS = {
    "cartoon": (
        "cartoon style, vivid fully-saturated colors in the same color family as the "
        "original sketch, fill in any faded or unfinished coloring, clean bold outlines, "
        "flat cel-shaded look"
    ),
    "rainbow": (
        "smooth vertical rainbow gradient from top to bottom in the order red, orange, "
        "yellow, green, blue, purple, like a rainbow-dipped effect, preserve all original "
        "texture, shading, folds and surface details, clean color bands blending softly "
        "into each other"
    ),
    "holz": (
        "wooden toy style, smooth painted warm brown wood tones, visible wood grain, "
        "matte finish"
    ),
}

PRINT_API_URL = (os.getenv("PRINT_API_URL") or "http://127.0.0.1:3005").rstrip("/")

DEFAULT_POLYCOUNT = 50_000


def _target_polycount() -> int:
    """
    Faces pro Modell. meshy-7 ("latest") remesht nicht von selbst und liefert
    sonst Rohmeshes mit ~2 Mio. Faces (>70 MB pro Modell). Meshy erlaubt
    100 bis 300000; ein Tippfehler in .env darf das Backend nicht blockieren.
    """
    try:
        value = int(os.getenv("TARGET_POLYCOUNT") or DEFAULT_POLYCOUNT)
    except ValueError:
        value = DEFAULT_POLYCOUNT
    return max(100, min(300_000, value))


TARGET_POLYCOUNT = _target_polycount()
