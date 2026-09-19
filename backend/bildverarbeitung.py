import base64
import mimetypes


def bild_kodieren(pfad: str) -> str:
    """Bild von Dateipfad laden und als base64 Data-URL kodieren."""
    mime_type, _ = mimetypes.guess_type(pfad)
    if mime_type is None:
        mime_type = "image/jpeg"
    with open(pfad, "rb") as f:
        return bild_kodieren_bytes(f.read(), mime_type)


def bild_kodieren_bytes(raw: bytes, mime_type: str) -> str:
    """Bild-Bytes direkt als base64 Data-URL kodieren (für API-Uploads)."""
    b64 = base64.b64encode(raw).decode()
    return f"data:{mime_type};base64,{b64}"
