import json
import os
import uuid
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel

import db
from auth import (
    check_admin_password,
    create_token,
    enforce_login_rate_limit,
    generate_workshop_code,
    require_admin,
    require_attendee,
    require_session,
)
from bildverarbeitung import bild_kodieren_bytes
from meshy_api import auftrag_erstellen
from meshy_warten import warten
from meshy_download import (
    datei_herunterladen,
    glb_herunterladen,
    model_url_holen,
    task_abrufen,
)
from meshy_retexture import retexture_erstellen
from config import RETEXTURE_PRESETS, PRINT_API_URL
from storage_manager import (
    STORAGE_DIR,
    ensure_storage_dir,
    farbauswahl_path,
    find_farbauswahl,
    find_meta,
    find_model_3mf,
    find_model_glb,
    find_model_usdz,
    find_sketch_path,
    iter_known_job_ids,
    load_index,
    meta_path,
    migrate_flat_storage,
    migrate_legacy_outputs,
    model_3mf_path,
    model_glb_path,
    model_usdz_path,
    normalize_job_id,
    register_generation,
    remove_from_index,
    sketch_path_for_ext,
)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Image-to-3D API",
    description="Konvertiert 2D-Bilder via Meshy AI in 3D-Modelle (.glb / .3mf)",
    version="1.1.0",
)

# Im Deployment auf die Frontend-Domain einschränken, z. B.
# CORS_ORIGINS=https://sketch2life.vercel.app
_cors_origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or "*").split(",")
    if origin.strip()
]

# Vercel-Previews bekommen pro Branch eine eigene Subdomain, die sich nicht
# aufzählen lässt: CORS_ORIGIN_REGEX=https://.*\.vercel\.app
_cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: dict[str, dict] = {}

ensure_storage_dir()
migrate_legacy_outputs()
migrate_flat_storage()
db.init_db()

PROMPT_VARIANT_IDS = {
    "cartoon": "1",
    "rainbow": "2",
    "holz": "3",
}

VARIANT_PROMPTS_BY_ID = {
    "1": "cartoon",
    "2": "rainbow",
    "3": "holz",
}


class VariantStatus(BaseModel):
    variant_id: str
    task_id: Optional[str] = None
    prompt: str
    status: str
    progress: int = 0
    error: Optional[str] = None
    consumed_credits: Optional[int] = None
    timings: Optional[dict] = None


class JobStatus(BaseModel):
    job_id: str
    task_id: Optional[str] = None
    status: str
    progress: int = 0
    error: Optional[str] = None
    consumed_credits: Optional[int] = None
    timings: Optional[dict] = None
    variants: list[VariantStatus] = []


class RetextureRequest(BaseModel):
    prompt: str


class FarbauswahlEntry(BaseModel):
    teil: str
    farbe: str


class FarbauswahlPayload(BaseModel):
    figur: str = "benutzer_auswahl"
    farben: list[FarbauswahlEntry] = []
    max_farben: int = 2
    restfarbe: str = "Weiß"
    # Einfache Ein-Farb-Wahl der Teilnehmenden (gleiches Format wie
    # send-to-printer es speichert); farben/restfarbe werden dann ignoriert.
    selected_color: Optional[str] = None


class SendToPrinterRequest(BaseModel):
    selected_color: Optional[str] = None
    farben: list[FarbauswahlEntry] = []
    restfarbe: str = "Weiß"
    farbe_text: Optional[str] = None
    variant: Optional[str] = None


class LoginRequest(BaseModel):
    code: str
    name: str


class AdminLoginRequest(BaseModel):
    password: str


class WorkshopCreateRequest(BaseModel):
    name: str
    generation_cap: int = 100


class WorkshopPatchRequest(BaseModel):
    status: Optional[str] = None
    generation_cap: Optional[int] = None
    rotate_code: bool = False


def _same_attendee(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and bool(b) and a.casefold() == b.casefold()


def _require_job_access(session: dict, job_id: str) -> Optional[dict]:
    """DB-Zeile des Jobs; Teilnehmende sehen nur eigene Jobs (sonst 404)."""
    row = db.get_job(job_id)
    if session.get("role") == "admin":
        return row
    if (
        not row
        or row["workshop_id"] != session.get("workshop_id")
        or not _same_attendee(row["attendee"], session.get("attendee"))
    ):
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")
    return row


def _consume_generation(session: dict) -> None:
    """Eine Generierung vom Workshop-Kontingent abbuchen (nur wenn aktiv)."""
    workshop = db.get_workshop(session["workshop_id"])
    if not workshop:
        raise HTTPException(status_code=401, detail="Workshop existiert nicht mehr.")
    if workshop["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Der Workshop ist beendet - neue Modelle sind nicht mehr möglich.",
        )
    if not db.try_consume_generation(workshop["id"]):
        raise HTTPException(
            status_code=403,
            detail="Das Generierungs-Kontingent dieses Workshops ist aufgebraucht.",
        )


def _read_selected_color(job_id: str) -> Optional[str]:
    """Gespeicherte Farbwahl - versteht beide gespeicherten Formate."""
    path = find_farbauswahl(job_id)
    if not path:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if data.get("selectedColor"):
        return data["selectedColor"]
    farben = data.get("farben") or []
    if farben and isinstance(farben[0], dict):
        return farben[0].get("farbe")
    return None


def _unique_workshop_code() -> str:
    for _ in range(20):
        code = generate_workshop_code()
        if not db.get_workshop_by_code(code):
            return code
    raise HTTPException(status_code=500, detail="Kein freier Workshop-Code gefunden.")


def _meta_path(job_id: str) -> Path:
    return meta_path(job_id)


def _persist_job_meta(job_id: str, job: dict):
    meta_path(job_id).parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "task_id": job.get("task_id"),
        "job_type": job.get("job_type", "image-to-3d"),
        "status": job.get("status"),
        "variants": {
            vid: {
                "task_id": v.get("task_id"),
                "job_type": v.get("job_type", "retexture"),
                "status": v.get("status"),
                "progress": v.get("progress", 0),
                "prompt": v.get("prompt") or VARIANT_PROMPTS_BY_ID.get(vid, ""),
            }
            for vid, v in job.get("variants", {}).items()
        },
    }
    _meta_path(job_id).write_text(json.dumps(meta), encoding="utf-8")


def _discover_variants_from_disk(job_id: str) -> dict:
    variants = {}
    for vid, prompt in VARIANT_PROMPTS_BY_ID.items():
        if find_model_glb(f"{job_id}_{vid}"):
            variants[vid] = {
                "status": "ready",
                "progress": 100,
                "task_id": None,
                "prompt": prompt,
                "job_type": "retexture",
            }
    return variants


def _restore_job_if_needed(job_id: str) -> Optional[dict]:
    if job_id in jobs:
        job = jobs[job_id]
        disk_variants = _discover_variants_from_disk(job_id)
        for vid, vdata in disk_variants.items():
            existing = job.setdefault("variants", {}).get(vid)
            if not existing or existing.get("status") in ("failed", "pending", None):
                job["variants"][vid] = vdata
            elif find_model_glb(f"{job_id}_{vid}"):
                job["variants"][vid]["status"] = "ready"
                job["variants"][vid]["progress"] = 100
        return job

    meta = _load_job_meta(job_id)
    glb_path = find_model_glb(job_id)
    sketch_path = find_sketch_path(job_id)
    if not meta and not glb_path and not sketch_path:
        return None

    variants: dict = {}
    for vid, vdata in ((meta or {}).get("variants") or {}).items():
        if isinstance(vdata, dict):
            variants[str(vid)] = {
                "task_id": vdata.get("task_id"),
                "job_type": vdata.get("job_type", "retexture"),
                "status": vdata.get("status", "ready"),
                "progress": vdata.get("progress", 100),
                "prompt": vdata.get("prompt") or VARIANT_PROMPTS_BY_ID.get(str(vid), ""),
            }
    for vid, vdata in _discover_variants_from_disk(job_id).items():
        if vid not in variants or find_model_glb(f"{job_id}_{vid}"):
            variants[vid] = vdata

    job = {
        "task_id": (meta or {}).get("task_id"),
        "job_type": (meta or {}).get("job_type", "image-to-3d"),
        "status": (meta or {}).get("status", "ready" if glb_path else "pending"),
        "progress": (meta or {}).get("progress", 100 if glb_path else 0),
        "variants": variants,
    }
    jobs[job_id] = job
    return job


def _load_job_meta(job_id: str) -> Optional[dict]:
    path = find_meta(job_id)
    if not path:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _find_sketch_path(job_id: str) -> Optional[Path]:
    return find_sketch_path(job_id)


def _sketch_media_type(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg"):
        return "image/jpeg"
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    return "application/octet-stream"


def _update_progress(job_id: str, progress: int, status: str):
    if job_id in jobs:
        jobs[job_id]["progress"] = progress
        jobs[job_id]["status_detail"] = status


def _update_variant_progress(job_id: str, variant_id: str, progress: int, status: str):
    job = jobs.get(job_id)
    if job and variant_id in job.get("variants", {}):
        job["variants"][variant_id]["progress"] = progress
        job["variants"][variant_id]["status_detail"] = status


def _job_to_response(job_id: str, job: dict) -> JobStatus:
    variants = [
        VariantStatus(
            variant_id=vid,
            **{k: v for k, v in vdata.items() if k != "status_detail"},
        )
        for vid, vdata in job.get("variants", {}).items()
    ]
    data = {k: v for k, v in job.items() if k not in ("variants", "status_detail", "image_data")}
    return JobStatus(job_id=job_id, variants=variants, **data)


async def process_job(job_id: str, image_data: str):
    timings = {}
    try:
        t0 = time.time()
        task_id = await asyncio.to_thread(auftrag_erstellen, image_data)
        timings["auftrag_erstellen"] = round(time.time() - t0, 2)
        jobs[job_id]["task_id"] = task_id
        jobs[job_id]["status"] = "processing"

        t1 = time.time()

        def poll():
            return warten(
                task_id,
                progress_callback=lambda p, s: _update_progress(job_id, p, s),
                job_type="image-to-3d",
            )

        task = await asyncio.to_thread(poll)
        timings["meshy_warten"] = round(time.time() - t1, 2)
        timings["total"] = round(timings["auftrag_erstellen"] + timings["meshy_warten"], 2)

        jobs[job_id].update({
            "status": "ready",
            "progress": 100,
            "consumed_credits": task.get("consumed_credits"),
            "job_type": "image-to-3d",
            "timings": timings,
        })
        _persist_job_meta(job_id, jobs[job_id])

    except Exception as exc:
        jobs[job_id].update({"status": "failed", "error": str(exc)})


async def retexture_job(job_id: str, variant_id: str, prompt: str):
    variant = jobs[job_id]["variants"][variant_id]
    timings = {}
    try:
        t0 = time.time()
        original_task_id = jobs[job_id]["task_id"]
        variant["status"] = "processing"
        variant["progress"] = 0

        new_task_id = await asyncio.to_thread(retexture_erstellen, original_task_id, prompt)
        timings["retexture_erstellen"] = round(time.time() - t0, 2)
        variant["task_id"] = new_task_id

        t1 = time.time()

        def poll():
            return warten(
                new_task_id,
                progress_callback=lambda p, s: _update_variant_progress(job_id, variant_id, p, s),
                job_type="retexture",
            )

        task = await asyncio.to_thread(poll)
        timings["meshy_warten"] = round(time.time() - t1, 2)
        timings["total"] = round(timings["retexture_erstellen"] + timings["meshy_warten"], 2)

        variant.update({
            "status": "ready",
            "progress": 100,
            "consumed_credits": task.get("consumed_credits"),
            "job_type": "retexture",
            "timings": timings,
        })
        _persist_job_meta(job_id, jobs[job_id])

    except Exception as exc:
        variant.update({"status": "failed", "error": str(exc)})


def _resolve_target(job_id: str, variant: Optional[str]):
    job = _restore_job_if_needed(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")

    if variant is None:
        return job["task_id"], job.get("job_type", "image-to-3d"), job["status"], job_id, job

    if variant not in job.get("variants", {}):
        raise HTTPException(status_code=404, detail="Variante nicht gefunden.")
    v = job["variants"][variant]
    return v["task_id"], v.get("job_type", "retexture"), v["status"], f"{job_id}_{variant}", v


NO_USDZ_DETAIL = "Meshy hat für diesen Job kein USDZ erzeugt (Job vor der USDZ-Umstellung)."

_MODEL_FINDERS = {
    "3mf": find_model_3mf,
    "usdz": find_model_usdz,
    "glb": find_model_glb,
}


async def _ensure_downloaded(job_id: str, variant: Optional[str], ext: str = "glb"):
    prefix = job_id if variant is None else f"{job_id}_{variant}"
    cached = _MODEL_FINDERS.get(ext, find_model_glb)(prefix)
    if cached:
        return cached

    task_id, job_type, current_status, file_prefix, target = _resolve_target(job_id, variant)

    if current_status not in ("ready", "succeeded"):
        raise HTTPException(status_code=409, detail=f"Noch nicht bereit (Status: {current_status}).")
    if not task_id:
        raise HTTPException(
            status_code=404,
            detail="Kein Meshy-Task zu diesem Job - Datei nicht mehr nachladbar.",
        )

    glb_dest = model_glb_path(file_prefix)
    tmf_dest = model_3mf_path(file_prefix)
    usdz_dest = model_usdz_path(file_prefix)
    for dest in (glb_dest, tmf_dest, usdz_dest):
        dest.parent.mkdir(parents=True, exist_ok=True)

    if not glb_dest.exists():
        task = await asyncio.to_thread(task_abrufen, task_id, job_type)

        await asyncio.to_thread(
            glb_herunterladen, task, str(glb_dest), str(tmf_dest), str(usdz_dest)
        )
        register_generation(
            job_id if variant is None else job_id,
            glb=glb_dest.name if glb_dest.exists() else None,
            usdz=usdz_dest.name if usdz_dest.exists() else None,
            three_mf=tmf_dest.name if tmf_dest.exists() else None,
        )
        target["status"] = "succeeded"

    elif ext == "usdz":
        # GLB liegt schon lokal, USDZ fehlt: nur das USDZ nachladen.
        url = await asyncio.to_thread(model_url_holen, task_id, job_type, "usdz")
        if not url:
            raise HTTPException(status_code=404, detail=NO_USDZ_DETAIL)
        await asyncio.to_thread(datei_herunterladen, url, str(usdz_dest))
        register_generation(job_id, usdz=usdz_dest.name)

    if ext == "usdz":
        if not usdz_dest.exists():
            raise HTTPException(status_code=404, detail=NO_USDZ_DETAIL)
        return usdz_dest
    return tmf_dest if ext == "3mf" else glb_dest


async def _usdz_available(job_id: str, variant: Optional[str]) -> bool:
    """Prüft ohne Download, ob für den Job ein USDZ zu bekommen ist."""
    prefix = job_id if variant is None else f"{job_id}_{variant}"
    if find_model_usdz(prefix):
        return True

    try:
        task_id, job_type, current_status, _prefix, _target = _resolve_target(job_id, variant)
    except HTTPException:
        return False

    if not task_id or current_status not in ("ready", "succeeded"):
        return False

    try:
        return bool(await asyncio.to_thread(model_url_holen, task_id, job_type, "usdz"))
    except Exception:
        return False


def _job_is_model_ready(job_id: str) -> bool:
    return bool(find_model_glb(job_id))


def _check_ready(job_id: str):
    if find_model_glb(job_id):
        return

    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")
    if job["status"] not in ("ready", "succeeded"):
        raise HTTPException(
            status_code=409,
            detail=f"Job noch nicht fertig (Status: {job['status']}).",
        )


@app.get("/health")
def health():
    from config import API_KEY
    key_ok = bool(API_KEY) and API_KEY.strip() not in ("", "your_meshy_key_here")
    return {
        "ok": True,
        "service": "sketch2life-3d-api",
        "meshy_configured": key_ok,
        "print_api_url": PRINT_API_URL,
    }


@app.post("/auth/login")
def auth_login(body: LoginRequest, request: Request):
    enforce_login_rate_limit(request)
    code = body.code.strip().lower()
    name = " ".join(body.name.split())
    if not code or not (1 <= len(name) <= 40):
        raise HTTPException(
            status_code=400,
            detail="Bitte Workshop-Code und Vornamen (max. 40 Zeichen) angeben.",
        )
    workshop = db.get_workshop_by_code(code)
    if not workshop:
        raise HTTPException(status_code=401, detail="Unbekannter Workshop-Code.")
    token = create_token(
        {"role": "attendee", "workshop_id": workshop["id"], "attendee": name}
    )
    return {
        "token": token,
        "role": "attendee",
        "name": name,
        "workshop": {"name": workshop["name"], "status": workshop["status"]},
    }


@app.post("/auth/admin")
def auth_admin(body: AdminLoginRequest, request: Request):
    enforce_login_rate_limit(request)
    if not check_admin_password(body.password):
        raise HTTPException(status_code=401, detail="Falsches Passwort.")
    return {"token": create_token({"role": "admin"}), "role": "admin"}


@app.get("/auth/session")
def auth_session(session: dict = Depends(require_session)):
    """Aktuelle Session; Workshop-Status kommt frisch aus der DB, damit das
    Frontend den Read-only-Modus sofort nach dem Umschalten sieht."""
    if session.get("role") == "admin":
        return {"role": "admin"}
    workshop = db.get_workshop(session.get("workshop_id"))
    if not workshop:
        raise HTTPException(status_code=401, detail="Workshop existiert nicht mehr.")
    return {
        "role": "attendee",
        "name": session.get("attendee"),
        "workshop": {"name": workshop["name"], "status": workshop["status"]},
    }


@app.post("/admin/workshops", status_code=201)
def admin_create_workshop(
    body: WorkshopCreateRequest, admin: dict = Depends(require_admin)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name darf nicht leer sein.")
    cap = max(1, min(10_000, body.generation_cap))
    return db.create_workshop(name, _unique_workshop_code(), cap)


@app.get("/admin/workshops")
def admin_list_workshops(admin: dict = Depends(require_admin)):
    workshops = []
    for workshop in db.list_workshops():
        rows = db.list_jobs(workshop["id"])
        workshops.append({
            **workshop,
            "job_count": len(rows),
            "model_count": sum(
                1 for r in rows if _job_is_model_ready(r["job_id"])
            ),
            "colors_picked": sum(
                1 for r in rows if _read_selected_color(r["job_id"])
            ),
        })
    return {"workshops": workshops}


@app.patch("/admin/workshops/{workshop_id}")
def admin_patch_workshop(
    workshop_id: int,
    body: WorkshopPatchRequest,
    admin: dict = Depends(require_admin),
):
    if not db.get_workshop(workshop_id):
        raise HTTPException(status_code=404, detail="Workshop nicht gefunden.")
    if body.status is not None and body.status not in ("active", "readonly"):
        raise HTTPException(
            status_code=400, detail="Status muss active oder readonly sein."
        )
    cap = None
    if body.generation_cap is not None:
        cap = max(1, min(10_000, body.generation_cap))
    return db.update_workshop(
        workshop_id,
        status=body.status,
        generation_cap=cap,
        code=_unique_workshop_code() if body.rotate_code else None,
    )


@app.get("/admin/workshops/{workshop_id}/models")
def admin_workshop_models(
    workshop_id: int, admin: dict = Depends(require_admin)
):
    workshop = db.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop nicht gefunden.")
    models = []
    for row in db.list_jobs(workshop_id):
        job_id = row["job_id"]
        models.append({
            "job_id": job_id,
            "attendee": row["attendee"],
            "created_at": row["created_at"],
            "has_glb": _job_is_model_ready(job_id),
            "has_sketch": find_sketch_path(job_id) is not None,
            "has_3mf": find_model_3mf(job_id) is not None,
            "color": _read_selected_color(job_id),
        })
    models.sort(key=lambda m: (m["attendee"].casefold(), m["created_at"]))
    return {"workshop": workshop, "models": models}


@app.post("/convert", response_model=JobStatus, status_code=202)
async def convert(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PNG oder JPEG Bild"),
    session: dict = Depends(require_attendee),
):
    from config import API_KEY

    if not API_KEY or API_KEY.strip() in ("", "your_meshy_key_here"):
        raise HTTPException(
            status_code=503,
            detail="API_KEY not configured. Set it in backend/.env and restart the backend.",
        )

    _consume_generation(session)

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    allowed = {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/pjpeg",
    }
    if content_type not in allowed:
        name = (file.filename or "").lower()
        if name.endswith(".png"):
            content_type = "image/png"
        elif name.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif name.endswith(".webp"):
            content_type = "image/webp"
        else:
            raise HTTPException(
                status_code=415,
                detail="Nur PNG, JPEG oder WebP erlaubt. Auf dem Handy « Upload Image » nutzen.",
            )

    raw = await file.read()
    image_data = bild_kodieren_bytes(raw, content_type)

    job_id = str(uuid.uuid4())
    ext_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/pjpeg": "jpg",
    }
    sketch_ext = ext_map.get(content_type, "jpg")
    sketch_path = sketch_path_for_ext(job_id, sketch_ext)
    sketch_path.parent.mkdir(parents=True, exist_ok=True)
    with open(sketch_path, "wb") as f:
        f.write(raw)
    register_generation(job_id, sketch=f"sketches/{sketch_path.name}")
    db.register_job(job_id, session["workshop_id"], session["attendee"])

    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "task_id": None,
        "variants": {},
        "image_data": image_data,
    }

    background_tasks.add_task(process_job, job_id, image_data)

    return _job_to_response(job_id, jobs[job_id])


@app.get("/status/{job_id}", response_model=JobStatus)
def status(job_id: str, session: dict = Depends(require_session)):
    _require_job_access(session, job_id)
    job = _restore_job_if_needed(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")
    return _job_to_response(job_id, job)


@app.post("/retexture/{job_id}", response_model=JobStatus, status_code=202)
async def retexture(
    job_id: str,
    body: RetextureRequest,
    background_tasks: BackgroundTasks,
    session: dict = Depends(require_session),
):
    _require_job_access(session, job_id)
    job = _restore_job_if_needed(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")
    if not job.get("task_id"):
        raise HTTPException(
            status_code=409,
            detail="Job after server restart is view-only — new styles only on fresh generation.",
        )
    if job["status"] not in ("ready", "succeeded"):
        raise HTTPException(
            status_code=409,
            detail=f"Job nicht bereit für Retexture (Status: {job['status']}).",
        )
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt darf nicht leer sein.")

    prompt_key = body.prompt.strip().lower()
    if prompt_key not in PROMPT_VARIANT_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Ungültiger Prompt. Erlaubt sind nur: {', '.join(PROMPT_VARIANT_IDS.keys())}.",
        )

    variant_id = PROMPT_VARIANT_IDS[prompt_key]
    existing = job["variants"].get(variant_id)
    if existing and existing.get("status") in ("processing", "ready", "succeeded"):
        return _job_to_response(job_id, job)

    # Jede neue Variante ist ein Meshy-Task und zählt aufs Workshop-Kontingent.
    if session.get("role") == "attendee":
        _consume_generation(session)

    meshy_prompt = RETEXTURE_PRESETS.get(prompt_key, body.prompt)

    job["variants"][variant_id] = {
        "status": "pending",
        "progress": 0,
        "task_id": None,
        "prompt": body.prompt,
    }

    background_tasks.add_task(retexture_job, job_id, variant_id, meshy_prompt)

    return _job_to_response(job_id, job)


@app.get("/download/{job_id}/glb")
async def download_glb(
    job_id: str,
    variant: Optional[str] = Query(default=None, description="variant_id, leer = Original"),
):
    path = await _ensure_downloaded(job_id, variant)
    return FileResponse(path, media_type="model/gltf-binary", filename="output.glb")


@app.get("/download/{job_id}/3mf")
async def download_3mf(
    job_id: str,
    variant: Optional[str] = Query(default=None, description="variant_id, leer = Original"),
):
    path = await _ensure_downloaded(job_id, variant, ext="3mf")
    return FileResponse(
        path,
        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        filename="output.3mf",
    )


@app.get("/download/{job_id}/usdz")
async def download_usdz(
    job_id: str,
    variant: Optional[str] = Query(default=None, description="variant_id, leer = Original"),
    check: bool = Query(default=False, description="Nur prüfen, ob ein USDZ verfügbar ist"),
):
    """iOS AR Quick Look. Meshy löscht Assets nach 3 Tagen, darum lokal speichern."""
    if check:
        return {"available": await _usdz_available(job_id, variant)}

    path = await _ensure_downloaded(job_id, variant, ext="usdz")
    return FileResponse(path, media_type="model/vnd.usdz+zip", filename="output.usdz")


@app.get("/download/{job_id}/sketch")
def download_sketch(job_id: str):
    path = _find_sketch_path(job_id)
    if not path:
        raise HTTPException(status_code=404, detail="Skizze nicht gefunden.")
    return FileResponse(path, media_type=_sketch_media_type(path), filename=f"sketch{path.suffix}")


@app.put("/jobs/{job_id}/farbauswahl")
def save_farbauswahl(
    job_id: str,
    payload: FarbauswahlPayload,
    session: dict = Depends(require_session),
):
    _require_job_access(session, job_id)

    # Nach dem Workshop ist die Farbwahl eingefroren (Admin darf korrigieren).
    if session.get("role") == "attendee":
        workshop = db.get_workshop(session["workshop_id"])
        if not workshop or workshop["status"] != "active":
            raise HTTPException(
                status_code=409,
                detail="Die Farbwahl ist nach dem Workshop gesperrt.",
            )

    _check_ready(job_id)
    if payload.selected_color:
        data = {
            "object_id": job_id,
            "selectedColor": payload.selected_color.strip().lower(),
        }
    else:
        data = payload.model_dump(exclude={"selected_color"})
    path = farbauswahl_path(job_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return {"ok": True, "job_id": job_id}


@app.post("/jobs/{job_id}/send-to-printer")
async def send_to_printer(
    job_id: str,
    body: SendToPrinterRequest,
    admin: dict = Depends(require_admin),
):
    """Save colour choice and create a print job in the print service."""
    variant = body.variant.strip() if body.variant else None
    _restore_job_if_needed(job_id)
    _check_ready(job_id)

    if body.selected_color:
        group_json = {
            "object_id": job_id,
            "selectedColor": body.selected_color.strip().lower(),
        }
    else:
        group_json = {
            "object_id": job_id,
            "selectedColor": body.farben[0].farbe.lower() if body.farben else "white",
        }

    farbauswahl_file = farbauswahl_path(job_id)
    farbauswahl_file.parent.mkdir(parents=True, exist_ok=True)
    with open(farbauswahl_file, "w", encoding="utf-8") as f:
        json.dump(group_json, f, indent=2, ensure_ascii=False)

    three_mf_path = await _ensure_downloaded(job_id, variant, ext="3mf")
    selected_color = body.selected_color or group_json["selectedColor"]

    try:
        from print_integration import send_to_print_service

        print_data = await send_to_print_service(job_id, three_mf_path, selected_color)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Print service not reachable ({PRINT_API_URL}). "
                f"Start print-service with python run.py. Error: {exc}"
            ),
        ) from exc

    return {
        "ok": True,
        "job_id": job_id,
        "objekt_id": job_id,
        "print_job_id": print_data.get("job_id"),
        "farbauswahl_saved": True,
        "message": "Print job created",
        "print_response": print_data,
    }


@app.get("/download/{job_id}/farbauswahl.json")
def download_farbauswahl(job_id: str):
    _check_ready(job_id)
    path = find_farbauswahl(job_id)
    if not path:
        raise HTTPException(status_code=404, detail="Farbauswahl noch nicht gespeichert.")
    return FileResponse(path, media_type="application/json", filename="farbauswahl.json")


@app.post("/projects/{job_id}/generate", response_model=JobStatus, status_code=202)
async def generate_from_existing_sketch(
    job_id: str,
    background_tasks: BackgroundTasks,
    session: dict = Depends(require_attendee),
):
    """Start 3D generation from a sketch already stored on the server (same job_id)."""
    from config import API_KEY

    if not API_KEY or API_KEY.strip() in ("", "your_meshy_key_here"):
        raise HTTPException(
            status_code=503,
            detail="API_KEY not configured. Set it in backend/.env and restart the backend.",
        )

    _require_job_access(session, job_id)

    sketch_path = _find_sketch_path(job_id)
    if not sketch_path:
        raise HTTPException(status_code=404, detail="Sketch not found on server.")

    existing = _restore_job_if_needed(job_id)
    if existing and existing.get("status") == "processing":
        return _job_to_response(job_id, existing)

    _consume_generation(session)

    raw = sketch_path.read_bytes()
    image_data = bild_kodieren_bytes(raw, _sketch_media_type(sketch_path))

    for target in (
        model_glb_path(job_id),
        model_usdz_path(job_id),
        model_3mf_path(job_id),
        farbauswahl_path(job_id),
    ):
        if target.exists():
            target.unlink()

    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "task_id": None,
        "variants": (existing or {}).get("variants", {}),
        "image_data": image_data,
    }

    background_tasks.add_task(process_job, job_id, image_data)
    return _job_to_response(job_id, jobs[job_id])


@app.get("/projects")
def list_projects(session: dict = Depends(require_session)):
    # Teilnehmende sehen nur ihre eigenen Jobs; Alt-Jobs ohne DB-Zeile
    # (vor der Login-Umstellung) bleiben dem Admin vorbehalten.
    if session.get("role") == "attendee":
        projects = []
        for row in db.list_jobs(session["workshop_id"], session["attendee"]):
            job_id = row["job_id"]
            projects.append({
                "job_id": job_id,
                "created_at": row["created_at"],
                "has_3mf": find_model_3mf(job_id) is not None,
                "has_sketch": find_sketch_path(job_id) is not None,
                "has_glb": _job_is_model_ready(job_id),
            })
        return {"projects": projects[:50]}

    projects = []
    index_by_id = {
        entry.get("job_id"): entry.get("created_at")
        for entry in load_index().get("entries", [])
        if entry.get("job_id")
    }

    for job_id in iter_known_job_ids():
        normalized = normalize_job_id(job_id)
        if not normalized:
            continue
        meta_file = find_meta(normalized)
        created_at = index_by_id.get(normalized) or index_by_id.get(job_id)
        if created_at is None and meta_file:
            created_at = datetime.fromtimestamp(
                meta_file.stat().st_mtime, tz=timezone.utc
            ).isoformat()
        elif created_at is None:
            created_at = datetime.now(timezone.utc).isoformat()
        projects.append({
            "job_id": normalized,
            "created_at": created_at,
            "has_3mf": find_model_3mf(normalized) is not None,
            "has_sketch": find_sketch_path(normalized) is not None,
            "has_glb": _job_is_model_ready(normalized),
        })

    projects.sort(key=lambda p: p["created_at"], reverse=True)
    return {"projects": projects[:50]}


@app.delete("/projects/{job_id}")
def delete_project(job_id: str, admin: dict = Depends(require_admin)):
    removed: list[str] = []
    for target in (
        model_glb_path(job_id),
        model_usdz_path(job_id),
        model_3mf_path(job_id),
        farbauswahl_path(job_id),
        meta_path(job_id),
    ):
        if target.exists():
            target.unlink()
            removed.append(target.name)
    for variant in ("1", "2", "3"):
        for path_fn in (model_glb_path, model_usdz_path, model_3mf_path):
            path = path_fn(f"{job_id}_{variant}")
            if path.exists():
                path.unlink()
                removed.append(path.name)
    sketch = _find_sketch_path(job_id)
    if sketch:
        sketch.unlink()
        removed.append(sketch.name)
    remove_from_index(job_id)
    jobs.pop(job_id, None)
    db.delete_job(job_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden.")
    return {"ok": True, "removed": removed}


@app.get("/jobs/{job_id}/print-package")
def print_package_info(job_id: str, session: dict = Depends(require_session)):
    _require_job_access(session, job_id)
    _check_ready(job_id)
    saved = find_farbauswahl(job_id)
    return {
        "job_id": job_id,
        "three_mf": f"/download/{job_id}/3mf",
        "farbauswahl": f"/download/{job_id}/farbauswahl.json",
        "farbauswahl_saved": saved is not None,
    }
