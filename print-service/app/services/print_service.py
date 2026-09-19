"""Print Service - PrintJob Management (JSON-persistent)"""

import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

from app.core.config import DATA_DIR
from app.core.exceptions import PrintJobNotFoundException, PrintJobFailedException
from app.schemas import PrintJob, PrintJobStatus

logger = logging.getLogger(__name__)


def _serialize_farben(farben: Any) -> List[Dict[str, Any]]:
    """Normalisiere farben (ColorSelection-Objekte oder Dicts) zu JSON-fähigen Dicts."""
    result: List[Dict[str, Any]] = []
    for f in farben or []:
        if hasattr(f, "model_dump"):
            result.append(f.model_dump())
        elif hasattr(f, "dict"):
            result.append(f.dict())
        elif isinstance(f, dict):
            result.append(f)
    return result


class PrintService:
    """
    Verwaltet Druck-Jobs.

    In-Memory-Registry mit JSON-Snapshot-Persistenz: Jobs überleben so den
    Zeitraum zwischen SEND (POST /print/create) und CONFIRM
    (POST /print/{job_id}/confirm) — auch über einen Neustart hinweg.
    """

    _jobs: Dict[str, Dict[str, Any]] = {}
    _store_path = DATA_DIR / "print_jobs.json"
    _loaded: bool = False

    # ── Persistenz ───────────────────────────────────────────────────────────

    @classmethod
    def _ensure_loaded(cls) -> None:
        """Lade den JSON-Snapshot einmalig in die In-Memory-Registry."""
        if cls._loaded:
            return
        cls._loaded = True
        try:
            if cls._store_path.exists():
                with cls._store_path.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    cls._jobs = data
                    logger.info(f"Loaded {len(cls._jobs)} print job(s) from {cls._store_path}")
        except Exception as exc:
            # Korrupter Snapshot darf den Service nicht blockieren.
            logger.error(f"Failed to load job store ({cls._store_path}): {exc}. Starting empty.")
            cls._jobs = {}

    @classmethod
    def _persist(cls) -> None:
        """Schreibe die Registry atomar als JSON-Snapshot."""
        try:
            tmp_path = cls._store_path.with_suffix(".json.tmp")
            with tmp_path.open("w", encoding="utf-8") as fh:
                json.dump(cls._jobs, fh, ensure_ascii=False, indent=2, default=str)
            tmp_path.replace(cls._store_path)
        except Exception as exc:
            logger.error(f"Failed to persist job store: {exc}")

    @classmethod
    def create_job(
        cls,
        objekt_id: str,
        print_job: PrintJob,
        file_path: str,
        color: Optional[str] = None,
        color_file_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        initial_status: str = "pending",
    ) -> Dict[str, Any]:
        """
        Erstelle einen neuen Druck-Job.

        initial_status:
            - "pending" : bestehender 1-Step-Flow (POST /print) — sofortiges Drucken.
            - "created" : 2-Step-Flow (POST /print/create) — wartet auf CONFIRM.
        """
        cls._ensure_loaded()
        job_id = f"pj-{uuid.uuid4().hex[:16]}"
        now = datetime.utcnow().isoformat() + "Z"

        job = {
            "job_id": job_id,
            "objekt_id": objekt_id,
            "status": initial_status,
            "confirmed": False,
            "progress": 0,
            "printer_status": None,
            "error": None,
            "file_path": file_path,
            "color": color,
            "color_file_path": color_file_path,
            "farben": _serialize_farben(print_job.farben),
            "hautfarbe": print_job.hautfarbe,
            "metadata": metadata or {},
            "created_at": now,
            "updated_at": now,
            "estimated_time_minutes": None,
        }

        cls._jobs[job_id] = job
        cls._persist()
        logger.info(f"Created print job {job_id} for objekt {objekt_id} (status={initial_status})")
        return job

    @classmethod
    def get_job(cls, job_id: str) -> Dict[str, Any]:
        """Hole Job-Info"""
        cls._ensure_loaded()
        if job_id not in cls._jobs:
            raise PrintJobNotFoundException(job_id)
        return cls._jobs[job_id]

    @classmethod
    def get_job_by_objekt(cls, objekt_id: str) -> Optional[Dict[str, Any]]:
        """Hole Job nach Objekt-ID"""
        cls._ensure_loaded()
        for job in cls._jobs.values():
            if job["objekt_id"] == objekt_id:
                return job
        return None

    @classmethod
    def update_job_status(
        cls,
        job_id: str,
        status: str,
        progress: int = None,
        printer_status: str = None,
        error: str = None,
        estimated_time_minutes: int = None,
    ) -> Dict[str, Any]:
        """Update Job-Status"""
        job = cls.get_job(job_id)
        job["status"] = status
        job["updated_at"] = datetime.utcnow().isoformat() + "Z"

        if progress is not None:
            job["progress"] = progress
        if printer_status is not None:
            job["printer_status"] = printer_status
        if error is not None:
            job["error"] = error
        if estimated_time_minutes is not None:
            job["estimated_time_minutes"] = estimated_time_minutes

        cls._persist()
        logger.info(f"Updated job {job_id} status to {status}")
        return job

    @classmethod
    def mark_confirmed(cls, job_id: str) -> Dict[str, Any]:
        """Markiere Job als bestätigt (CONFIRM freigegeben)."""
        job = cls.get_job(job_id)
        job["confirmed"] = True
        job["updated_at"] = datetime.utcnow().isoformat() + "Z"
        cls._persist()
        return job

    @classmethod
    def mark_blocked(cls, job_id: str, reason: str) -> Dict[str, Any]:
        """Markiere Job als blockiert (Verfügbarkeitsprüfung fehlgeschlagen)."""
        return cls.update_job_status(job_id, "blocked", progress=0, error=reason)

    @classmethod
    def attach_files(
        cls,
        job_id: str,
        file_path: Optional[str] = None,
        color_file_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Verknüpfe gespeicherte Dateipfade mit dem Job und persistiere."""
        job = cls.get_job(job_id)
        if file_path is not None:
            job["file_path"] = file_path
        if color_file_path is not None:
            job["color_file_path"] = color_file_path
        job["updated_at"] = datetime.utcnow().isoformat() + "Z"
        cls._persist()
        return job

    @classmethod
    def mark_sending(cls, job_id: str) -> Dict[str, Any]:
        """Markiere Job als wird gesendet"""
        return cls.update_job_status(job_id, "sending", progress=20)

    @classmethod
    def mark_printing(cls, job_id: str, estimated_time: int = None) -> Dict[str, Any]:
        """Markiere Job als druckt"""
        return cls.update_job_status(
            job_id,
            "printing",
            progress=30,
            printer_status="printing",
            estimated_time_minutes=estimated_time
        )

    @classmethod
    def mark_completed(cls, job_id: str) -> Dict[str, Any]:
        """Markiere Job als fertig"""
        return cls.update_job_status(job_id, "completed", progress=100, printer_status="idle")

    @classmethod
    def mark_failed(cls, job_id: str, error: str) -> Dict[str, Any]:
        """Markiere Job als fehlgeschlagen"""
        return cls.update_job_status(job_id, "failed", progress=0, error=error)

    @classmethod
    def set_progress(cls, job_id: str, progress: int) -> Dict[str, Any]:
        """Update nur Progress"""
        job = cls.get_job(job_id)
        job["progress"] = progress
        job["updated_at"] = datetime.utcnow().isoformat() + "Z"
        cls._persist()
        return job

    @classmethod
    def get_all_jobs(cls) -> Dict[str, Dict[str, Any]]:
        """Hole alle Jobs"""
        cls._ensure_loaded()
        return cls._jobs.copy()

    @classmethod
    def to_status_dto(cls, job: Dict[str, Any]) -> PrintJobStatus:
        """Konvertiere Job-Dict zu DTO"""
        return PrintJobStatus(
            job_id=job["job_id"],
            objekt_id=job["objekt_id"],
            status=job["status"],
            confirmed=job.get("confirmed", False),
            color=job.get("color"),
            progress=job["progress"],
            printer_status=job["printer_status"],
            error=job["error"],
            created_at=job["created_at"],
            updated_at=job["updated_at"],
            estimated_time_minutes=job["estimated_time_minutes"],
        )

    @classmethod
    def clear_all(cls):
        """Lösche alle Jobs (für Tests)"""
        cls._ensure_loaded()
        cls._jobs.clear()
        cls._persist()
