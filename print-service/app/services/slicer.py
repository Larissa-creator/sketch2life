"""Slicer Service - OrcaSlicer headless CLI Integration

Wandelt eine Mesh-3MF (z.B. vom Ki-Backend / Meshy) in eine druckbare,
geslicte 3MF mit Gcode um. Bambu-Drucker können KEINE rohen Mesh-3MFs drucken -
sie brauchen den geslicten Gcode (Metadata/plate_1.gcode), den der Slicer erzeugt.
"""

import asyncio
import logging
import os
import subprocess
from pathlib import Path

from app.core import config

logger = logging.getLogger(__name__)


class SlicingError(Exception):
    """Slicing ist fehlgeschlagen."""


def _build_command(input_path: str, output_path: str) -> list:
    """Baue den OrcaSlicer-CLI-Aufruf.

    Maschinen- + Process-Profil werden via --load-settings (";"-getrennt) geladen,
    das Filament via --load-filaments. subprocess (Liste) quotet die Argumente -
    auch Pfade mit Leerzeichen - korrekt; kein manuelles Quoting nötig.
    """
    settings = ";".join(
        p for p in (config.SLICER_MACHINE_PROFILE, config.SLICER_PROCESS_PROFILE) if p
    )
    cmd = [config.SLICER_PATH]
    if settings:
        cmd += ["--load-settings", settings]
    if config.SLICER_FILAMENT_PROFILE:
        cmd += ["--load-filaments", config.SLICER_FILAMENT_PROFILE]
    cmd += [
        "--arrange", "1",
        "--slice", "0",
        "--export-3mf", output_path,
        input_path,
    ]
    return cmd


def _run_slicer(input_path: str, output_path: str) -> None:
    """Slicer synchron ausführen (blockierend - via asyncio.to_thread aufrufen)."""
    cmd = _build_command(input_path, output_path)
    logger.info(f"Running slicer: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=config.SLICER_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise SlicingError(f"Slicer timed out after {config.SLICER_TIMEOUT_SECONDS}s")
    except FileNotFoundError:
        raise SlicingError(f"Slicer executable not found at {config.SLICER_PATH}")

    if result.returncode != 0 or not os.path.exists(output_path):
        tail = (result.stdout or "")[-1500:]
        raise SlicingError(
            f"Slicer failed (exit {result.returncode}, no output file). Log tail:\n{tail}"
        )


async def slice_to_printable(input_path: str) -> str:
    """Slice eine Mesh-3MF zu einer druckbaren 3MF.

    Returns:
        Pfad zur geslicten 3MF (neben der Eingabedatei, Suffix _sliced.3mf).
    Raises:
        SlicingError: wenn der Slicer fehlschlägt.
    """
    src = Path(input_path)
    # Endung .gcode.3mf: Bambu-Drucker erkennen nur so eine direkt druckbare,
    # geslicte Datei. Eine reine .3mf wird als Projekt/Modell behandelt (geladen,
    # aber nicht als startbarer Druck-Task).
    output_path = str(src.with_name(f"{src.stem}.gcode.3mf"))
    logger.info(f"Slicing {input_path} -> {output_path}")
    await asyncio.to_thread(_run_slicer, input_path, output_path)
    logger.info(f"✓ Sliced successfully: {output_path}")
    return output_path
