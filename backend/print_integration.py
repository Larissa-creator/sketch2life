"""Send 3MF + colour text to the print service (POST /print/create)."""

import logging
from pathlib import Path

import httpx

from config import PRINT_API_URL

logger = logging.getLogger(__name__)


def _color_label(selected_color: str) -> str:
    labels = {
        "white": "white",
        "black": "black",
        "blue": "blue",
        "purple": "purple",
        "yellow": "yellow",
    }
    key = (selected_color or "white").strip().lower()
    return labels.get(key, key)


async def send_to_print_service(
    job_id: str,
    three_mf_path: Path,
    selected_color: str,
) -> dict:
    """Upload 3MF and colour to the print service. Returns the print job id."""
    color_value = _color_label(selected_color)
    url = f"{PRINT_API_URL}/print/create"

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(three_mf_path, "rb") as model_file:
            files = {
                "file": (f"{job_id}.3mf", model_file, "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"),
            }
            data = {
                "objekt_id": job_id,
                "color": color_value,
            }
            response = await client.post(url, data=data, files=files)
            response.raise_for_status()
            payload = response.json()

    print_job_id = payload.get("job_id")
    if not print_job_id:
        raise RuntimeError(f"Print service returned no job_id: {payload}")

    logger.info("Print job created: %s for object %s", print_job_id, job_id)
    return {"job_id": print_job_id, **payload}
