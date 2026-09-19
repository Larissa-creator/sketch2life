"""SQLite-Registry: Workshops und Zuordnung Job -> Workshop/Teilnehmer:in.

Die Datei liegt unter STORAGE_DIR und wandert damit im Deployment mit auf
das persistente Volume. Modelldateien bleiben im Dateisystem; hier steht
nur, wem ein Job gehört und wie viele Generierungen ein Workshop noch hat.
"""

import sqlite3
from datetime import datetime, timezone
from typing import Optional

from storage_manager import STORAGE_DIR, ensure_storage_dir

DB_PATH = STORAGE_DIR / "app.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS workshops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'readonly')),
    generation_cap INTEGER NOT NULL DEFAULT 100,
    generations_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    workshop_id INTEGER NOT NULL REFERENCES workshops(id),
    attendee TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_workshop ON jobs(workshop_id, attendee);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    ensure_storage_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


# --- Workshops ---------------------------------------------------------------

def create_workshop(name: str, code: str, generation_cap: int = 100) -> dict:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO workshops (name, code, generation_cap, created_at)"
            " VALUES (?, ?, ?, ?)",
            (name, code, generation_cap, _now()),
        )
        workshop_id = cur.lastrowid
    # Erst nach dem Commit lesen - get_workshop öffnet eine neue Verbindung.
    return get_workshop(workshop_id)


def get_workshop(workshop_id: int) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM workshops WHERE id = ?", (workshop_id,)
        ).fetchone()
        return dict(row) if row else None


def get_workshop_by_code(code: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM workshops WHERE code = ?", (code,)
        ).fetchone()
        return dict(row) if row else None


def list_workshops() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM workshops ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def update_workshop(
    workshop_id: int,
    *,
    status: Optional[str] = None,
    generation_cap: Optional[int] = None,
    code: Optional[str] = None,
) -> Optional[dict]:
    sets, params = [], []
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    if generation_cap is not None:
        sets.append("generation_cap = ?")
        params.append(generation_cap)
    if code is not None:
        sets.append("code = ?")
        params.append(code)
    if sets:
        with _connect() as conn:
            conn.execute(
                f"UPDATE workshops SET {', '.join(sets)} WHERE id = ?",
                (*params, workshop_id),
            )
    return get_workshop(workshop_id)


def try_consume_generation(workshop_id: int) -> bool:
    """Zählt eine Generierung, aber nur wenn der Workshop aktiv ist und das
    Kontingent reicht - atomar, damit parallele Anfragen das Cap nicht
    überrennen."""
    with _connect() as conn:
        cur = conn.execute(
            "UPDATE workshops SET generations_used = generations_used + 1"
            " WHERE id = ? AND status = 'active'"
            " AND generations_used < generation_cap",
            (workshop_id,),
        )
        return cur.rowcount == 1


# --- Jobs --------------------------------------------------------------------

def register_job(job_id: str, workshop_id: int, attendee: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO jobs (job_id, workshop_id, attendee, created_at)"
            " VALUES (?, ?, ?, ?)",
            (job_id, workshop_id, attendee, _now()),
        )


def get_job(job_id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        return dict(row) if row else None


def list_jobs(workshop_id: int, attendee: Optional[str] = None) -> list[dict]:
    query = "SELECT * FROM jobs WHERE workshop_id = ?"
    params: list = [workshop_id]
    if attendee is not None:
        # "ben" und "Ben" sind dieselbe Person
        query += " AND attendee = ? COLLATE NOCASE"
        params.append(attendee)
    query += " ORDER BY created_at DESC"
    with _connect() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def delete_job(job_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
