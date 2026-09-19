import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import DATA_DIR

logger = logging.getLogger(__name__)

REGISTRY_PATH = DATA_DIR / "print_requests.json"
LOG_FILE = Path(__file__).resolve().parent.parent.parent / "logs" / "print-page.log"
_BACKFILL_DONE = False

_LOG_SENT = re.compile(
    r"Print job sent \(jobId=([^)]+)\)(?: color=(\S+))?",
    re.IGNORECASE,
)


def _ki_base_url() -> str:
    return os.getenv("KI_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")


def _load() -> Dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {"requests": []}
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("requests"), list):
            return data
    except Exception as exc:
        logger.warning("Could not read print_requests.json: %s", exc)
    return {"requests": []}


def _save(data: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = REGISTRY_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(REGISTRY_PATH)


def register_print_request(
    objekt_id: str,
    color: Optional[str] = None,
) -> Dict[str, Any]:
    """Append one print request with download addresses for the 3D files."""
    if not objekt_id or not str(objekt_id).strip():
        return {}

    base = _ki_base_url()
    oid = str(objekt_id).strip()
    entry = {
        "objekt_id": oid,
        "color": color,
        "glb_url": f"{base}/download/{oid}/glb",
        "three_mf_url": f"{base}/download/{oid}/3mf",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }

    data = _load()
    requests = data["requests"]
    if requests:
        last = requests[-1]
        if last.get("objekt_id") == oid and last.get("color") == color:
            return last

    requests.append(entry)
    _save(data)
    logger.info("Saved print request for %s", oid)
    return entry


def _backfill_from_log() -> None:
    global _BACKFILL_DONE
    if _BACKFILL_DONE or not LOG_FILE.exists():
        _BACKFILL_DONE = True
        return
    _BACKFILL_DONE = True

    data = _load()
    known = {item.get("objekt_id") for item in data["requests"]}
    try:
        for line in LOG_FILE.read_text(encoding="utf-8").splitlines():
            match = _LOG_SENT.search(line)
            if not match:
                continue
            oid = match.group(1).strip()
            if not oid or oid in known:
                continue
            color = match.group(2)
            register_print_request(oid, color)
            known.add(oid)
    except OSError as exc:
        logger.warning("Could not backfill print requests from log: %s", exc)


def list_print_requests() -> List[Dict[str, Any]]:
    _backfill_from_log()
    return list(_load().get("requests", []))
