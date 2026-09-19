"""Printer Service - Bambu Lab Printer Integration (Cloud & LAN)"""

import asyncio
import logging
import os
from typing import Dict, Any, Optional

from app.core.config import MOCK_PRINTER
from app.core.exceptions import (
    PrinterNotAvailableException,
    PrinterCommunicationException,
)
from app.services.bambu_printer import BambuLabPrinter

logger = logging.getLogger(__name__)


class PrinterService:
    """Managed Bambu Lab Printer Communication"""

    def __init__(self, mock_mode: bool = MOCK_PRINTER):
        """
        Initialize printer service

        Args:
            mock_mode: If True, use mock printer (no real hardware required)
        """
        self.mock_mode = mock_mode
        self._is_connected = False
        self._bambu_printer: Optional[BambuLabPrinter] = None

        if not mock_mode:
            # Entscheide zwischen Cloud und LAN Mode
            use_cloud = os.getenv("BAMBU_USE_CLOUD", "false").lower() == "true"
            self._bambu_printer = BambuLabPrinter(use_cloud=use_cloud)
            logger.info(f"Printer mode: {'Cloud' if use_cloud else 'LAN'}")

    @property
    def printer_serial(self) -> str:
        """Drucker-Seriennummer"""
        if self._bambu_printer:
            return self._bambu_printer.printer_serial
        return "Mock"

    @property
    def printer_ip(self) -> Optional[str]:
        """Drucker-IP"""
        if self._bambu_printer:
            return self._bambu_printer.printer_ip
        return None

    async def connect(self) -> bool:
        """Connect to Bambu Lab printer (Cloud or LAN)"""
        if self.mock_mode:
            logger.info("Mock printer mode - simulating connection")
            self._is_connected = True
            return True

        try:
            if not self._bambu_printer:
                raise PrinterNotAvailableException("Bambu printer not initialized")

            success = await self._bambu_printer.connect()
            if success:
                self._is_connected = True
                logger.info("✓ Connected to Bambu Lab printer")
                return True
            else:
                raise PrinterNotAvailableException("Failed to connect to Bambu Lab printer")

        except Exception as exc:
            logger.error(f"Failed to connect to printer: {exc}")
            raise PrinterNotAvailableException(str(exc))

    async def disconnect(self):
        """Disconnect from printer"""
        if self.mock_mode:
            logger.info("Disconnecting (mock)")
        elif self._bambu_printer:
            await self._bambu_printer.disconnect()
        self._is_connected = False

    async def send_file(self, file_path: str) -> bool:
        """
        Send 3MF file to printer

        Args:
            file_path: Path to 3MF file

        Returns:
            True if successful
        """
        if not self._is_connected:
            raise PrinterCommunicationException("Not connected to printer")

        if self.mock_mode:
            logger.info(f"Mock: Sending file to printer: {file_path}")
            await asyncio.sleep(1)
            return True

        try:
            if not self._bambu_printer:
                raise PrinterCommunicationException("Bambu printer not available")

            success = await self._bambu_printer.send_file(file_path)
            if success:
                logger.info("✓ File sent to Bambu Lab printer")
                return True
            else:
                raise PrinterCommunicationException("Failed to send file")

        except Exception as exc:
            logger.error(f"Failed to send file: {exc}")
            raise PrinterCommunicationException(str(exc))

    async def get_status(self) -> Dict[str, Any]:
        """Get printer status"""
        if not self._is_connected:
            raise PrinterCommunicationException("Not connected to printer")

        if self.mock_mode:
            return {
                "status": "idle",
                "temperature_nozzle": 0,
                "temperature_bed": 0,
                "progress": 0,
                "current_file": None,
            }

        try:
            if not self._bambu_printer:
                raise PrinterCommunicationException("Bambu printer not available")

            status = await self._bambu_printer.get_status()
            logger.debug(f"Printer status: {status}")
            return status

        except Exception as exc:
            logger.error(f"Failed to get printer status: {exc}")
            raise PrinterCommunicationException(str(exc))

    async def check_availability(self) -> Dict[str, Any]:
        """
        Verfügbarkeitsprüfung für den 2-Step-Confirm.

        Führt einen dedizierten Check aus: Verbindung herstellen + Status abfragen.
        Gibt IMMER ein Dict zurück (wirft nicht), damit der Aufrufer sauber
        zwischen 'verfügbar' und 'blockiert' unterscheiden kann.

        Returns:
            {"available": bool, "reason": str, "printer_status": Optional[str]}
        """
        result: Dict[str, Any] = {"available": False, "reason": "", "printer_status": None}

        # 1) Verbindung sicherstellen (nur wenn nicht bereits verbunden — der P1S
        #    erlaubt im LAN nur EINE MQTT-Verbindung; connect() ist zwar idempotent,
        #    aber wir vermeiden den Reconnect-Pfad ganz, wenn schon verbunden).
        if not self._is_connected:
            try:
                await self.connect()
            except Exception as exc:
                result["reason"] = f"connection failed: {exc}"
                return result

        # 2) Mock ist immer verfügbar
        if self.mock_mode:
            result.update(available=True, reason="mock printer ready", printer_status="idle")
            return result

        # 3) Status abfragen
        try:
            printer_status = await self.get_status()
        except Exception as exc:
            result["reason"] = f"status query failed: {exc}"
            return result

        pstat = str(printer_status.get("status", "") or "").lower()
        result["printer_status"] = pstat or None

        busy_states = {"printing", "running", "prepare", "preparing", "heating", "pause", "paused"}
        error_states = {"error", "failed", "offline", "unknown"}

        if pstat in busy_states:
            result["reason"] = f"printer busy: {pstat}"
        elif pstat in error_states:
            result["reason"] = f"printer not ready: {pstat}"
        else:
            # idle / ready / finish / online / leer -> verfügbar
            result.update(available=True, reason="printer ready")
        return result

    async def get_ams_info(self) -> Dict[str, Any]:
        """AMS-Infos (Filamente je Tray). Im Mock-Modus leer."""
        if self.mock_mode:
            return {"available": False, "units": [], "mock": True}
        if not self._bambu_printer:
            return {"available": False, "units": []}
        return await self._bambu_printer.get_ams_info()

    async def get_print_progress(self) -> Optional[int]:
        """Get current print progress (0-100)"""
        try:
            status = await self.get_status()
            return status.get("progress", 0)
        except Exception as exc:
            logger.error(f"Failed to get print progress: {exc}")
            return None

    async def pause_print(self) -> bool:
        """Pause current print"""
        if self.mock_mode:
            logger.info("Mock: Pausing print")
            return True

        try:
            if not self._bambu_printer:
                raise PrinterCommunicationException("Bambu printer not available")

            success = await self._bambu_printer.pause_print()
            if success:
                logger.info("✓ Print paused")
            return success

        except Exception as exc:
            logger.error(f"Failed to pause print: {exc}")
            raise PrinterCommunicationException(str(exc))

    async def resume_print(self) -> bool:
        """Resume paused print"""
        if self.mock_mode:
            logger.info("Mock: Resuming print")
            return True

        try:
            if not self._bambu_printer:
                raise PrinterCommunicationException("Bambu printer not available")

            success = await self._bambu_printer.resume_print()
            if success:
                logger.info("✓ Print resumed")
            return success

        except Exception as exc:
            logger.error(f"Failed to resume print: {exc}")
            raise PrinterCommunicationException(str(exc))

    async def cancel_print(self) -> bool:
        """Cancel current print"""
        if self.mock_mode:
            logger.info("Mock: Cancelling print")
            return True

        try:
            if not self._bambu_printer:
                raise PrinterCommunicationException("Bambu printer not available")

            success = await self._bambu_printer.cancel_print()
            if success:
                logger.info("✓ Print cancelled")
            return success

        except Exception as exc:
            logger.error(f"Failed to cancel print: {exc}")
            raise PrinterCommunicationException(str(exc))

    @property
    def is_available(self) -> bool:
        """Check if printer is available"""
        return self._is_connected

    @property
    def is_mock(self) -> bool:
        """Check if running in mock mode"""
        return self.mock_mode
