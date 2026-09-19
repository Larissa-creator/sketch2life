import requests
import time
from typing import Callable, Optional
from config import API_KEY


def warten(
    task_id: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
    job_type: str = "image-to-3d",
) -> dict:
    """
    Pollt Meshy bis der Job fertig ist.
    `job_type` z. B. "image-to-3d" oder "retexture".
    `progress_callback(progress_percent, status_string)` wird bei jeder Änderung aufgerufen.
    """
    headers = {"Authorization": f"Bearer {API_KEY}"}
    last_progress = -1

    while True:
        task = requests.get(
            f"https://api.meshy.ai/openapi/v1/{job_type}/{task_id}",
            headers=headers,
        ).json()

        progress = task["progress"]
        status = task["status"]

        if progress != last_progress:
            print(f"   Status: {status} | {progress}%")
            if progress_callback:
                progress_callback(progress, status)
            last_progress = progress

        if status == "SUCCEEDED":
            return task
        if status in ("FAILED", "CANCELED"):
            raise RuntimeError(task["task_error"]["message"])

        time.sleep(5)
