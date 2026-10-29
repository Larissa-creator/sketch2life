import requests

from config import API_KEY


def task_url(task_id: str, job_type: str) -> str:
    """Text-to-3D liegt bei Meshy unter v2, alle anderen Jobs unter v1."""
    version = "v2" if job_type == "text-to-3d" else "v1"
    return f"https://api.meshy.ai/openapi/{version}/{job_type}/{task_id}"


def task_abrufen(task_id: str, job_type: str = "image-to-3d") -> dict:
    """Holt den Task von Meshy - enthaelt die signierten model_urls."""
    resp = requests.get(
        task_url(task_id, job_type),
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def model_url_holen(task_id: str, job_type: str, fmt: str) -> str | None:
    """Signierte CDN-URL eines Formats (z. B. "usdz"), ohne die Datei zu laden."""
    task = task_abrufen(task_id, job_type)
    return (task.get("model_urls") or {}).get(fmt)


def datei_herunterladen(url: str, pfad: str) -> None:
    """Laedt eine einzelne Datei von der Meshy-CDN-URL."""
    with open(pfad, "wb") as f:
        f.write(requests.get(url).content)


def glb_herunterladen(
    task: dict, glb_pfad: str, tmf_pfad: str, usdz_pfad: str
) -> None:
    """Speichert GLB, 3MF und - falls Meshy es erzeugt hat - USDZ."""
    model_urls = task.get("model_urls") or {}

    datei_herunterladen(model_urls["glb"], glb_pfad)
    print(f"GLB gespeichert als {glb_pfad}")

    datei_herunterladen(model_urls["3mf"], tmf_pfad)
    print(f"3MF gespeichert als {tmf_pfad}")

    # Aeltere Tasks (vor der USDZ-Umstellung) liefern kein USDZ.
    if model_urls.get("usdz"):
        datei_herunterladen(model_urls["usdz"], usdz_pfad)
        print(f"USDZ gespeichert als {usdz_pfad}")
