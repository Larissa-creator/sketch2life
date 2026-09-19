"""Append-only log file for Print page visits and print jobs."""

from datetime import datetime
from pathlib import Path
from typing import Optional

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "print-page.log"


def _append_log(line: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def log_print_page(job_id: Optional[str] = None) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    line = f"{timestamp} - Print page opened"
    if job_id:
        line += f" (jobId={job_id})"
    _append_log(line)


def read_recent_log_lines(max_lines: int = 30) -> list[str]:
    if not LOG_FILE.exists():
        return []
    try:
        lines = LOG_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    return lines[-max(1, min(max_lines, 200)) :]


def log_print_job_sent(job_id: Optional[str] = None, color: Optional[str] = None) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    line = f"{timestamp} - Print job sent"
    if job_id:
        line += f" (jobId={job_id})"
    if color:
        line += f" color={color}"
    _append_log(line)
