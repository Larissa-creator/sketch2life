"""Login und Sessions: Workshop-Code + Vorname für Teilnehmende, ein
Admin-Passwort (ADMIN_PASSWORD in .env) für die Verwaltung.

Tokens sind HMAC-signierte JSON-Payloads (nur Standardbibliothek). Das
Geheimnis kommt aus SECRET_KEY oder wird einmalig erzeugt und unter
STORAGE_DIR/.secret abgelegt, damit Tokens Neustarts überleben.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request

from storage_manager import STORAGE_DIR, ensure_storage_dir

TOKEN_TTL_SECONDS = 90 * 24 * 3600  # Teilnehmende dürfen später wiederkommen

# Login-Versuche pro IP (best effort, in-memory)
_LOGIN_WINDOW_SECONDS = 60
_LOGIN_MAX_ATTEMPTS = 10
_login_attempts: dict[str, list[float]] = {}


def _load_secret() -> bytes:
    env = os.getenv("SECRET_KEY")
    if env:
        return env.encode("utf-8")
    ensure_storage_dir()
    secret_file = STORAGE_DIR / ".secret"
    if secret_file.exists():
        return secret_file.read_bytes()
    value = secrets.token_bytes(32)
    secret_file.write_bytes(value)
    return value


_SECRET = _load_secret()


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(payload: dict) -> str:
    body = dict(payload, exp=int(time.time()) + TOKEN_TTL_SECONDS)
    encoded = _b64encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_SECRET, encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_b64encode(signature)}"


def read_token(token: str) -> Optional[dict]:
    try:
        encoded, signature_b64 = token.split(".", 1)
        expected = hmac.new(_SECRET, encoded.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64decode(signature_b64), expected):
            return None
        payload = json.loads(_b64decode(encoded))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def check_admin_password(password: str) -> bool:
    expected = os.getenv("ADMIN_PASSWORD") or ""
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="ADMIN_PASSWORD ist nicht gesetzt. In backend/.env eintragen"
            " und das Backend neu starten.",
        )
    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))


def enforce_login_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = [t for t in _login_attempts.get(ip, []) if now - t < _LOGIN_WINDOW_SECONDS]
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Zu viele Login-Versuche. Bitte kurz warten.",
        )
    attempts.append(now)
    _login_attempts[ip] = attempts


# --- Workshop-Codes ----------------------------------------------------------

_ADJEKTIVE = (
    "blaue", "rote", "gruene", "gelbe", "lila", "bunte", "helle", "flinke",
    "kleine", "grosse", "wilde", "stille", "schlaue", "mutige", "frohe",
    "runde", "eckige", "sanfte", "starke", "leise", "schnelle", "warme",
    "kuehle", "goldene",
)
_TIERE = (
    "katze", "ente", "eule", "biene", "robbe", "otter", "koala", "panda",
    "fuchs", "igel", "hase", "dachs", "lama", "gecko", "falke", "delfin",
    "kranich", "marder", "wombat", "pinguin", "molch", "luchs", "biber",
    "spatz",
)


def generate_workshop_code() -> str:
    """Gut vorlesbar und tippbar, aber mit genug Varianten gegen Raten."""
    return (
        f"{secrets.choice(_ADJEKTIVE)}-{secrets.choice(_TIERE)}"
        f"-{secrets.randbelow(900) + 100}"
    )


# --- FastAPI-Dependencies ----------------------------------------------------

def get_session(request: Request) -> Optional[dict]:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None
    return read_token(header[7:].strip())


def require_session(request: Request) -> dict:
    session = get_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="Bitte anmelden.")
    return session


def require_attendee(session: dict = Depends(require_session)) -> dict:
    if session.get("role") != "attendee" or not session.get("workshop_id"):
        raise HTTPException(
            status_code=403,
            detail="Nur mit Workshop-Login möglich.",
        )
    return session


def require_admin(session: dict = Depends(require_session)) -> dict:
    if session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Nur für Admins.")
    return session
