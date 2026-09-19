"""Print Job Routes - POST /print, GET /print/{job_id}, etc."""

import asyncio
import json
import logging
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
import httpx

from app.core.exceptions import (
    InvalidFileException,
    FileSizeTooLargeException,
    PrintJobNotFoundException,
    PrintJobAlreadyProcessedException,
    JobIncompleteException,
    PrinterNotAvailableException,
    exception_to_http,
)
from app.schemas import (
    PrintJob,
    PrintJobResponse,
    PrintJobStatus,
    PrintJobCreatedResponse,
    PrintJobConfirmResponse,
)
from app.schemas.print_job import ColorSelection
from app.services import PrintService, PrinterService, StorageService
from app.services.job_queue import get_job_queue
from app.services.page_logger import log_print_page, log_print_job_sent, read_recent_log_lines
from app.services.print_requests import list_print_requests, register_print_request
from app.services.slicer import slice_to_printable
from app.core import config

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Print Jobs"])

# Global printer instance (wird in main.py initialisiert)
_printer_service: PrinterService = None


def set_printer_service(printer_service: PrinterService):
    """Set the printer service instance"""
    global _printer_service
    _printer_service = printer_service


@router.post(
    "/log/print-page",
    summary="Log Print Page visit",
    description="Writes a line to logs/print-page.log when the print page is opened",
)
async def log_print_page_visit(job_id: Optional[str] = None):
    log_print_page(job_id)
    logger.info("Print page visited%s", f" (jobId={job_id})" if job_id else "")
    return {"ok": True, "message": "Print page visit logged"}


@router.post(
    "/log/print-sent",
    summary="Log print job submission",
    description="Writes a line to logs/print-page.log when the user sends a print job",
)
async def log_print_sent(job_id: Optional[str] = None, color: Optional[str] = None):
    log_print_job_sent(job_id, color)
    if job_id:
        register_print_request(job_id, color)
    logger.info(
        "Print job sent%s",
        f" (jobId={job_id}, color={color})" if job_id or color else "",
    )
    return {"ok": True, "message": "Print job logged"}


@router.get(
    "/log/print-page/recent",
    summary="Recent Print page activity log",
    description="Returns the last N lines from logs/print-page.log",
)
async def get_print_page_log_recent(lines: int = 30):
    safe_lines = max(1, min(lines, 200))
    return {"lines": read_recent_log_lines(safe_lines)}


@router.post(
    "/print",
    response_model=PrintJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Print Job",
    description="Upload 3MF file and create a new print job",
)
async def create_print_job(
    objekt_id: str,
    file: UploadFile = File(..., description="3MF file for printing"),
):
    """
    Erstelle einen neuen Druck-Job.
    - 3MF-Datei hochladen
    - Farben/Hautfarbe (optional) speichern
    - Job an Drucker senden
    """
    try:
        # Validiere Datei-Typ
        if not file.filename.endswith(".3mf"):
            raise InvalidFileException("Only .3mf files are supported")

        if file.content_type and file.content_type not in (
            "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
            "application/octet-stream",
        ):
            raise InvalidFileException(f"Invalid file type: {file.content_type}")

        # Lese Datei
        file_content = await file.read()

        # Validiere Größe
        if len(file_content) == 0:
            raise InvalidFileException("Empty file")

        # Erstelle Job
        print_job = PrintJob(objekt_id=objekt_id)
        job = PrintService.create_job(objekt_id, print_job, "")

        # Speichere Datei
        file_path = StorageService.save_3mf_file(job["job_id"], file_content)
        job["file_path"] = str(file_path)

        # Starte async Druck-Task
        asyncio.create_task(_process_print_job(job["job_id"], str(file_path)))

        logger.info(
            f"Created print job {job['job_id']} for objekt {objekt_id}, "
            f"file: {len(file_content)} bytes"
        )

        return PrintJobResponse(
            ok=True,
            job_id=job["job_id"],
            objekt_id=objekt_id,
            status="pending",
            message="Print job created successfully",
        )

    except (InvalidFileException, FileSizeTooLargeException) as exc:
        logger.warning(f"Validation error: {exc.message}")
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error creating print job: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create print job")


# ─────────────────────────────────────────────────────────────────────────────
# 2-STEP WORKFLOW: SEND (create) + CONFIRM (trigger)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/print/create",
    response_model=PrintJobCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Step 1 — SEND: Create & register a print job (no printing)",
    description=(
        "Registriert einen Druckauftrag persistent aus 3MF + Farb-TXT + Metadaten. "
        "Es wird KEIN Druck ausgelöst und KEINE Verfügbarkeitsprüfung durchgeführt. "
        "Der Auftrag erhält Status 'created' und muss über "
        "POST /print/{job_id}/confirm bestätigt werden."
    ),
)
async def create_print_job_send(
    objekt_id: str = Form(..., description="Objekt-ID (job_id vom Ki-Backend)"),
    file: UploadFile = File(..., description="Generierte 3MF-Datei"),
    color_file: Optional[UploadFile] = File(
        None, description="TXT mit ausschließlich der Farbe, z.B. 'red' / 'RAL7016'"
    ),
    color: Optional[str] = Form(
        None, description="Farbe als Feld (Fallback, falls keine TXT gesendet wird)"
    ),
    hautfarbe: Optional[str] = Form(None, description="Optional: Hautfarbe (Metadatum)"),
    farben_json: Optional[str] = Form(
        None, description="Optional: JSON-Array strukturierter Farben [{teil, farbe}]"
    ),
    metadata_json: Optional[str] = Form(
        None, description="Optional: freie Metadaten als JSON-Objekt"
    ),
):
    """
    SEND: Auftrag erstellen und persistent registrieren. Kein Druck, keine Prüfung.
    """
    try:
        # Validiere 3MF
        if not file.filename or not file.filename.endswith(".3mf"):
            raise InvalidFileException("Only .3mf files are supported")
        if file.content_type and file.content_type not in (
            "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
            "application/octet-stream",
        ):
            raise InvalidFileException(f"Invalid file type: {file.content_type}")

        file_content = await file.read()
        if len(file_content) == 0:
            raise InvalidFileException("Empty file")

        # Farbe bestimmen: TXT hat Vorrang, sonst Form-Feld
        color_value: Optional[str] = None
        if color_file is not None:
            raw = await color_file.read()
            color_value = raw.decode("utf-8", errors="replace").strip() or None
        if not color_value and color:
            color_value = color.strip() or None

        # Strukturierte Farben (optional, "support both")
        farben_list = []
        if farben_json:
            try:
                parsed = json.loads(farben_json)
                farben_list = [ColorSelection(**item) for item in parsed]
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid farben_json: {exc}",
                )

        # Freie Metadaten (optional)
        metadata = {}
        if metadata_json:
            try:
                metadata = json.loads(metadata_json)
                if not isinstance(metadata, dict):
                    metadata = {"value": metadata}
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Invalid metadata_json (must be a JSON object)",
                )

        # Job persistent anlegen (Status 'created', NICHT drucken)
        print_job = PrintJob(
            objekt_id=objekt_id,
            farben=farben_list,
            hautfarbe=hautfarbe or "Weiß",
        )
        job = PrintService.create_job(
            objekt_id,
            print_job,
            file_path="",
            color=color_value,
            metadata=metadata,
            initial_status="created",
        )
        job_id = job["job_id"]

        # Dateien speichern und verknüpfen
        file_path = StorageService.save_3mf_file(job_id, file_content)
        color_file_path = None
        if color_value:
            color_file_path = str(StorageService.save_color_file(job_id, color_value))
        PrintService.attach_files(
            job_id, file_path=str(file_path), color_file_path=color_file_path
        )

        logger.info(
            f"[SEND] Created job {job_id} for objekt {objekt_id} "
            f"(color={color_value!r}, 3mf={len(file_content)} bytes) — awaiting confirm"
        )

        return PrintJobCreatedResponse(
            job_id=job_id,
            objekt_id=objekt_id,
            status="created",
            confirmed=False,
            color=color_value,
        )

    except (InvalidFileException, FileSizeTooLargeException) as exc:
        logger.warning(f"[SEND] Validation error: {exc.message}")
        raise exception_to_http(exc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[SEND] Error creating print job: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create print job")


@router.post(
    "/print/{job_id}/confirm",
    response_model=PrintJobConfirmResponse,
    status_code=status.HTTP_200_OK,
    summary="Step 2 — CONFIRM: Availability check, then trigger the print",
    description=(
        "Prüft den registrierten Auftrag (existiert, Dateien vorhanden, Farbe verknüpft, "
        "noch nicht gedruckt), führt die Drucker-Verfügbarkeitsprüfung aus und löst bei "
        "Verfügbarkeit den Druck aus (Status 'printing'). Ist der Drucker nicht verfügbar, "
        "wird der Auftrag NICHT gedruckt und auf 'blocked' gesetzt (HTTP 503)."
    ),
)
async def confirm_print_job(job_id: str):
    """
    CONFIRM: Auftrag finalisieren und Druck auslösen — oder blockieren.
    """
    try:
        # 1) Auftrag existiert?
        job = PrintService.get_job(job_id)  # -> 404 wenn nicht vorhanden

        # 2) Noch nicht gedruckt? (nur 'created' oder ein 'blocked'-Retry erlaubt)
        current_status = job.get("status")
        if current_status not in ("created", "blocked"):
            raise exception_to_http(
                PrintJobAlreadyProcessedException(job_id, current_status)
            )

        # 3) Alle Dateien vorhanden?
        if not StorageService.file_exists(job_id):
            raise exception_to_http(
                JobIncompleteException(f"3MF file missing for job {job_id}")
            )

        # 4) Farbe korrekt verknüpft? (TXT-Datei, gespeicherte Farbe oder strukturierte Farben)
        has_color = (
            bool(job.get("color"))
            or StorageService.color_file_exists(job_id)
            or bool(job.get("farben"))
        )
        if not has_color:
            raise exception_to_http(
                JobIncompleteException(f"No color linked for job {job_id}")
            )
        # War eine Farb-TXT verknüpft, muss sie noch existieren
        if job.get("color_file_path") and not StorageService.color_file_exists(job_id):
            raise exception_to_http(
                JobIncompleteException(f"Color TXT missing for job {job_id}")
            )

        # 5) Drucker-Service vorhanden?
        if _printer_service is None:
            raise exception_to_http(
                PrinterNotAvailableException("Printer service not initialized")
            )

        # 6) Verfügbarkeitsprüfung (separater Check)
        availability = await _printer_service.check_availability()
        if not availability.get("available"):
            reason = availability.get("reason") or "printer unavailable"
            PrintService.mark_blocked(job_id, reason)
            logger.warning(f"[CONFIRM] Job {job_id} BLOCKED: {reason}")
            raise exception_to_http(PrinterNotAvailableException(reason))

        # 7) Finalisieren + Druck auslösen
        PrintService.mark_confirmed(job_id)
        PrintService.mark_printing(
            job_id,
            estimated_time=120,
        )
        asyncio.create_task(_execute_confirmed_print(job_id))

        logger.info(
            f"[CONFIRM] Job {job_id} confirmed & printing "
            f"(printer_status={availability.get('printer_status')})"
        )

        return PrintJobConfirmResponse(
            job_id=job_id,
            objekt_id=job["objekt_id"],
            status="printing",
            confirmed=True,
            printer_status=availability.get("printer_status"),
        )

    except HTTPException:
        raise
    except PrintJobNotFoundException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"[CONFIRM] Error confirming job {job_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to confirm print job")


@router.get(
    "/print/requests",
    summary="List print requests (simple)",
    description="All submitted 3D models with download addresses",
)
async def get_print_requests():
    requests = list_print_requests()
    return {"requests": requests, "total": len(requests)}


@router.get(
    "/print",
    summary="List All Print Jobs",
    description="Get list of all print jobs",
)
async def list_print_jobs():
    """Get all print jobs."""
    try:
        jobs = PrintService.get_all_jobs()
        job_statuses = [
            PrintService.to_status_dto(job) for job in jobs.values()
        ]
        return {"jobs": job_statuses, "total": len(job_statuses)}
    except Exception as exc:
        logger.error(f"Error listing jobs: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list jobs")


@router.get(
    "/print/{job_id}",
    response_model=PrintJobStatus,
    summary="Get Print Job Status",
    description="Get the status of a print job",
)
async def get_print_job_status(job_id: str):
    """Get status of a print job."""
    try:
        job = PrintService.get_job(job_id)
        return PrintService.to_status_dto(job)
    except PrintJobNotFoundException as exc:
        logger.warning(f"Job not found: {job_id}")
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error fetching job {job_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get job status")


@router.get(
    "/print/{job_id}/download",
    summary="Download 3MF File",
    description="Download the 3MF file for a completed print job",
    responses={
        200: {"content": {"application/vnd.ms-package.3dmanufacturing-3dmodel+xml": {}}},
        404: {"description": "Job or file not found"},
    },
)
async def download_3mf(job_id: str):
    """Download 3MF file from completed print job."""
    try:
        job = PrintService.get_job(job_id)
        file_path = StorageService.get_3mf_file(job_id)

        logger.info(f"Downloading 3MF for job {job_id}")
        return FileResponse(
            file_path,
            media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
            filename=f"print-{job_id}.3mf",
        )
    except PrintJobNotFoundException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error downloading 3MF: {exc}")
        raise HTTPException(status_code=404, detail="File not found")


@router.post(
    "/print-by-objekt-id",
    response_model=PrintJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Print Job from Ki-Backend Output",
    description="Erstelle Print-Job indem die 3MF vom Ki-Backend geholt wird",
)
async def create_print_job_from_objekt_id(
    objekt_id: str,
):
    """
    Erstelle Print-Job basierend auf objekt_id.
    Holt die 3MF vom Ki-Backend und erstellt den Job.
    """
    try:
        logger.info(f"Creating print job from objekt_id: {objekt_id}")

        # Hole 3MF vom Ki-Backend
        ki_backend_url = os.getenv("KI_BACKEND_URL", "http://127.0.0.1:8000")
        three_mf_url = f"{ki_backend_url}/download/{objekt_id}/3mf"

        logger.info(f"Downloading 3MF from Ki-Backend: {three_mf_url}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(three_mf_url)

            if response.status_code != 200:
                logger.error(f"Failed to download 3MF: {response.status_code}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Ki-Backend returned {response.status_code}",
                )

            file_content = response.content
            logger.info(f"Downloaded 3MF: {len(file_content)} bytes")

        # Erstelle Job
        print_job = PrintJob(objekt_id=objekt_id)
        job = PrintService.create_job(objekt_id, print_job, "")

        # Speichere Datei
        file_path = StorageService.save_3mf_file(job["job_id"], file_content)
        job["file_path"] = str(file_path)

        # Enqueue Job zur Verarbeitung (statt direkt async)
        job_queue = get_job_queue()
        await job_queue.enqueue(job["job_id"], _process_print_job_wrapper)

        logger.info(f"Created print job {job['job_id']} from objekt {objekt_id} (queued)")

        return PrintJobResponse(
            ok=True,
            job_id=job["job_id"],
            objekt_id=objekt_id,
            status="pending",
            message="Print job created successfully from Ki-Backend",
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error creating print job from objekt_id: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create print job")


# ─────────────────────────────────────────────────────────────────────────────

async def _process_print_job_wrapper(job_id: str) -> None:
    """Wrapper für Queue - lädt file_path aus Job-Info"""
    try:
        job = PrintService.get_job(job_id)
        file_path = job.get("file_path", "")
        await _process_print_job(job_id, file_path)
    except Exception as exc:
        logger.error(f"Print job wrapper error for {job_id}: {exc}", exc_info=True)
        PrintService.mark_failed(job_id, str(exc))


async def _execute_confirmed_print(job_id: str) -> None:
    """
    Background Task für den 2-Step-CONFIRM: schickt die (ggf. geslicte) Datei an den
    Drucker. Verbindung + Verfügbarkeit wurden im /confirm-Handler bereits geprüft;
    hier wird nur noch gesliced und gesendet.
    """
    try:
        job = PrintService.get_job(job_id)
        file_path = job.get("file_path", "")

        if _printer_service is None:
            PrintService.mark_failed(job_id, "Printer service not available")
            return

        # Verbindung nur herstellen, falls (unerwartet) getrennt
        if not _printer_service.is_available:
            try:
                await _printer_service.connect()
            except Exception as exc:
                PrintService.mark_failed(job_id, f"Printer connection failed: {exc}")
                return

        file_to_print = file_path
        if config.SLICER_ENABLED:
            try:
                PrintService.set_progress(job_id, 25)
                file_to_print = await slice_to_printable(file_path)
            except Exception as exc:
                PrintService.mark_failed(job_id, f"Slicing failed: {exc}")
                return

        try:
            await _printer_service.send_file(file_to_print)
        except Exception as exc:
            PrintService.mark_failed(job_id, f"File transfer failed: {exc}")
            return

        if _printer_service.is_mock:
            PrintService.mark_completed(job_id)
        else:
            PrintService.mark_printing(job_id, estimated_time=120)

        logger.info(f"[CONFIRM] Print job {job_id} dispatched to printer")

    except Exception as exc:
        logger.error(f"[CONFIRM] Execute failed for {job_id}: {exc}", exc_info=True)
        PrintService.mark_failed(job_id, str(exc))


async def _process_print_job(job_id: str, file_path: str):
    """Background Task: Sende Datei an Drucker"""
    try:
        logger.info(f"Starting print job {job_id}")

        if _printer_service is None:
            logger.error("Printer service not initialized")
            PrintService.mark_failed(job_id, "Printer service not available")
            return

        # Markiere als "sending" - Datei wird vorbereitet
        PrintService.mark_sending(job_id)
        logger.info(f"Preparing file for printer: {file_path}")

        # Versuche Drucker zu verbinden
        try:
            await _printer_service.connect()
            logger.info(f"Printer connected for job {job_id}")
        except Exception as exc:
            logger.error(f"Failed to connect to printer: {exc}")
            PrintService.mark_failed(job_id, f"Printer connection failed: {str(exc)}")
            return

        # Slicing: Mesh-3MF -> druckbare 3MF mit Gcode (falls aktiviert).
        # Der Drucker kann die rohe Mesh-3MF vom Ki-Backend nicht drucken.
        file_to_print = file_path
        if config.SLICER_ENABLED:
            try:
                PrintService.set_progress(job_id, 25)
                logger.info(f"Slicing file for job {job_id}: {file_path}")
                file_to_print = await slice_to_printable(file_path)
                logger.info(f"Sliced file for job {job_id}: {file_to_print}")
            except Exception as exc:
                logger.error(f"Slicing failed for job {job_id}: {exc}")
                PrintService.mark_failed(job_id, f"Slicing failed: {str(exc)}")
                return

        # Sende Datei nur wenn verbunden
        try:
            await _printer_service.send_file(file_to_print)
            logger.info(f"File sent to printer for job {job_id}")
        except Exception as exc:
            logger.error(f"Failed to send file to printer: {exc}")
            PrintService.mark_failed(job_id, f"File transfer failed: {str(exc)}")
            return

        # Nur im echten Drucker-Betrieb: Druckerstatus abfragen
        if not _printer_service.is_mock:
            PrintService.mark_printing(job_id, estimated_time=120)
            logger.info(f"Print job {job_id} is printing")
            # Hier würde echtes Progress-Tracking stattfinden
        else:
            # Mock-Modus: Job als "completed" markieren nach erfolgreicher Übertragung
            logger.info(f"Mock printer: marking job {job_id} as completed")
            PrintService.mark_completed(job_id)

        logger.info(f"Print job {job_id} completed successfully")

    except Exception as exc:
        logger.error(f"Print job {job_id} failed: {exc}", exc_info=True)
        PrintService.mark_failed(job_id, str(exc))
