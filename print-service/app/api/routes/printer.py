"""Printer Status Routes - Drucker-Informationen & Status"""

import logging
from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any

from app.core.exceptions import exception_to_http, PrinterNotAvailableException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Printer"])

# Global printer instance (wird in main.py initialisiert)
_printer_service = None


def set_printer_service(printer_service):
    """Set the printer service instance"""
    global _printer_service
    _printer_service = printer_service


@router.get(
    "/printer/status",
    summary="Drucker-Status",
    description="Aktuellen Status des Druckers abrufen",
)
async def get_printer_status() -> Dict[str, Any]:
    """Drucker-Status: online, aktuelle Aufgabe, Fortschritt, etc."""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        # Im Mock-Modus: Keine Mock-Daten! Fehler zurückgeben
        if _printer_service.is_mock:
            raise PrinterNotAvailableException("Running in mock mode - no real printer connected")

        status_info = await _printer_service.get_status()

        return {
            "available": _printer_service.is_available,
            "status": status_info.get("status", "unknown"),
            "temperature_nozzle": status_info.get("temperature_nozzle", 0),
            "temperature_bed": status_info.get("temperature_bed", 0),
            "progress": status_info.get("progress", 0),
            "current_file": status_info.get("current_file"),
        }

    except PrinterNotAvailableException as exc:
        logger.warning(f"Printer not available: {exc.message}")
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error getting printer status: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get printer status")


@router.get(
    "/printer/ams",
    summary="AMS auslesen",
    description="Geladene Filamente je AMS-Tray (Typ, Farbe, Restmenge)",
)
async def get_ams() -> Dict[str, Any]:
    """AMS-Einheiten und Trays auslesen."""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        if _printer_service.is_mock:
            raise PrinterNotAvailableException("Running in mock mode - no real printer connected")

        return await _printer_service.get_ams_info()

    except PrinterNotAvailableException as exc:
        logger.warning(f"AMS not available: {exc.message}")
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error reading AMS: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read AMS")


@router.get(
    "/printer/info",
    summary="Drucker-Informationen",
    description="Statische Drucker-Informationen (Modell, Seriennummer, etc.)",
)
async def get_printer_info() -> Dict[str, Any]:
    """Drucker-Informationen: Modell, Seriennummer, Firmware, etc."""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        return {
            "mock": _printer_service.is_mock,
            "available": _printer_service.is_available,
            "serial": _printer_service.printer_serial or "Not configured",
            "ip": _printer_service.printer_ip or "Not configured",
            "model": "Bambu Lab (Mock)" if _printer_service.is_mock else "Bambu Lab",
            "firmware": "2.0.0 (Mock)" if _printer_service.is_mock else "Unknown",
        }

    except PrinterNotAvailableException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error getting printer info: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get printer info")


@router.get(
    "/printer/temperature",
    summary="Drucker-Temperaturen",
    description="Aktuelle Temperaturen (Düse, Bett, etc.)",
)
async def get_printer_temperature() -> Dict[str, Any]:
    """Temperaturen: Nozzle, Bed, Chamber, etc."""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        # Im Mock-Modus: Keine Mock-Daten!
        if _printer_service.is_mock:
            raise PrinterNotAvailableException("Running in mock mode - no real printer connected")

        status_info = await _printer_service.get_status()

        return {
            "nozzle": {
                "current": status_info.get("temperature_nozzle", 0),
                "target": 200,
                "unit": "°C",
            },
            "bed": {
                "current": status_info.get("temperature_bed", 0),
                "target": 60,
                "unit": "°C",
            },
            "chamber": {
                "current": 25,
                "unit": "°C",
            },
        }

    except PrinterNotAvailableException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error getting temperatures: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get temperatures")


@router.get(
    "/printer/health",
    summary="Drucker-Gesundheit",
    description="Drucker erreichbar & funktionsfähig?",
)
async def get_printer_health() -> Dict[str, Any]:
    """Health Check für Drucker"""
    try:
        if _printer_service is None:
            return {
                "healthy": False,
                "available": False,
                "reason": "Printer service not initialized",
            }

        # Im Mock-Modus: Nicht erreichbar
        if _printer_service.is_mock:
            return {
                "healthy": False,
                "available": False,
                "reason": "Mock mode - no real printer",
            }

        if not _printer_service.is_available:
            return {
                "healthy": False,
                "available": False,
                "reason": "Printer not connected",
            }

        status_info = await _printer_service.get_status()

        is_healthy = status_info.get("status") in ["idle", "printing", "paused"]

        return {
            "healthy": is_healthy,
            "available": _printer_service.is_available,
            "status": status_info.get("status", "unknown"),
        }

    except Exception as exc:
        logger.error(f"Error checking printer health: {exc}", exc_info=True)
        return {
            "healthy": False,
            "available": False,
            "reason": str(exc),
        }


@router.post(
    "/printer/pause",
    summary="Druck pausieren",
    description="Pausiere aktuellen Druck",
)
async def pause_printer() -> Dict[str, Any]:
    """Pausiere aktuellen Druck"""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        result = await _printer_service.pause_print()
        logger.info("Printer paused")

        return {
            "success": result,
            "message": "Print paused",
        }

    except PrinterNotAvailableException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error pausing printer: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to pause printer")


@router.post(
    "/printer/resume",
    summary="Druck fortsetzen",
    description="Fortsetzen eines pausierten Drucks",
)
async def resume_printer() -> Dict[str, Any]:
    """Fortsetzen eines pausierten Drucks"""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        result = await _printer_service.resume_print()
        logger.info("Printer resumed")

        return {
            "success": result,
            "message": "Print resumed",
        }

    except PrinterNotAvailableException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error resuming printer: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to resume printer")


@router.post(
    "/printer/cancel",
    summary="Druck abbrechen",
    description="Breche aktuellen Druck ab",
)
async def cancel_printer() -> Dict[str, Any]:
    """Breche aktuellen Druck ab"""
    try:
        if _printer_service is None:
            raise PrinterNotAvailableException("Printer service not initialized")

        result = await _printer_service.cancel_print()
        logger.info("Print canceled")

        return {
            "success": result,
            "message": "Print canceled",
        }

    except PrinterNotAvailableException as exc:
        raise exception_to_http(exc)
    except Exception as exc:
        logger.error(f"Error canceling print: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to cancel print")
