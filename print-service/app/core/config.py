import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
CONFIG_DIR = BASE_DIR / "config"

# Create directories if needed
DATA_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)

# API Configuration
API_TITLE = "3D Print Service"
API_DESCRIPTION = "Manages 3D print jobs and Bambu Lab printer integration"
API_VERSION = "1.0.0"

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Bambu Lab Printer Configuration
PRINTER_SERIAL = os.getenv("PRINTER_SERIAL", "")
PRINTER_IP = os.getenv("PRINTER_IP", "")
PRINTER_ACCESS_CODE = os.getenv("PRINTER_ACCESS_CODE", "")
PRINTER_NETWORK_PLUG = int(os.getenv("PRINTER_NETWORK_PLUG", "1"))

# Bambu Lab Seriennummer.
# WICHTIG: Wird AUCH im LAN-Modus benötigt, da die MQTT-Topics
# device/{serial}/request (publish) und device/{serial}/report (subscribe)
# die Drucker-Seriennummer enthalten. Wird im BambuLabPrinter aus
# BAMBU_PRINTER_SERIAL gelesen (Cloud wie LAN).
BAMBU_PRINTER_SERIAL = os.getenv("BAMBU_PRINTER_SERIAL", "")

# Fallback für Mock/Test-Modus
MOCK_PRINTER = os.getenv("MOCK_PRINTER", "true").lower() == "true"

# File configuration
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB für 3MF
ALLOWED_MIME_TYPES = {"application/vnd.ms-package.3dmanufacturing-3dmodel+xml", "application/octet-stream"}

# Print job configuration
JOB_TIMEOUT_SECONDS = 3600  # 1 Stunde Timeout
JOB_CLEANUP_DAYS = 30  # Alte Jobs nach 30 Tagen löschen

# Bambu Lab specific
BAMBU_STUDIO_PORT = 6000
BAMBU_API_VERSION = "v1"

# ─────────────────────────────────────────────────────────────────────────────
# Slicing (OrcaSlicer headless CLI)
# Wandelt die generierte Mesh-3MF in eine druckbare (geslicte) 3MF mit Gcode um.
# Ohne Slicing kann der Drucker die 3MF vom Ki-Backend NICHT drucken.
# Profile als VOLLE Pfade zu den Profil-JSONs (Leerzeichen sind ok).
# ─────────────────────────────────────────────────────────────────────────────
SLICER_ENABLED = os.getenv("SLICER_ENABLED", "false").lower() == "true"
SLICER_PATH = os.getenv("SLICER_PATH", r"C:\Program Files\OrcaSlicer\orca-slicer.exe")
SLICER_MACHINE_PROFILE = os.getenv("SLICER_MACHINE_PROFILE", "")
SLICER_PROCESS_PROFILE = os.getenv("SLICER_PROCESS_PROFILE", "")
SLICER_FILAMENT_PROFILE = os.getenv("SLICER_FILAMENT_PROFILE", "")
SLICER_TIMEOUT_SECONDS = int(os.getenv("SLICER_TIMEOUT_SECONDS", "300"))
