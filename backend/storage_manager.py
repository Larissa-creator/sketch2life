"""Persist generation metadata and resolve on-disk paths under backend/storage/."""

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

# Im Deployment zeigt STORAGE_DIR auf das persistente Volume.
STORAGE_DIR = Path(
    os.getenv("STORAGE_DIR") or Path(__file__).resolve().parent / "storage"
)
LEGACY_OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
INDEX_PATH = STORAGE_DIR / "index.json"

SKETCHES_DIR = STORAGE_DIR / "sketches"
MODELS_DIR = STORAGE_DIR / "models"
PRINT_DIR = STORAGE_DIR / "print"
META_DIR = STORAGE_DIR / "meta"

SKETCH_EXTENSIONS = ("png", "jpg", "jpeg", "webp")
ROOT_RESERVED = frozenset({"index.json", "README.md", ".gitkeep"})


def ensure_storage_dir() -> Path:
    for folder in (STORAGE_DIR, SKETCHES_DIR, MODELS_DIR, PRINT_DIR, META_DIR):
        folder.mkdir(parents=True, exist_ok=True)
    if not INDEX_PATH.exists():
        INDEX_PATH.write_text(json.dumps({"entries": []}, indent=2), encoding="utf-8")
    for sub in (SKETCHES_DIR, MODELS_DIR, PRINT_DIR, META_DIR):
        keep = sub / ".gitkeep"
        if not keep.exists():
            keep.touch()
    return STORAGE_DIR


def model_glb_path(file_prefix: str) -> Path:
    return MODELS_DIR / f"{file_prefix}.glb"


def model_usdz_path(file_prefix: str) -> Path:
    return MODELS_DIR / f"{file_prefix}.usdz"


def model_3mf_path(file_prefix: str) -> Path:
    return PRINT_DIR / f"{file_prefix}.3mf"


def farbauswahl_path(job_id: str) -> Path:
    return PRINT_DIR / f"{job_id}.farbauswahl.json"


def meta_path(job_id: str) -> Path:
    return META_DIR / f"{job_id}.meta.json"


def sketch_path_for_ext(job_id: str, ext: str) -> Path:
    normalized = "jpg" if ext in ("jpg", "jpeg") else ext
    return SKETCHES_DIR / f"{job_id}.{normalized}"


def find_sketch_path(job_id: str) -> Optional[Path]:
    for ext in SKETCH_EXTENSIONS:
        path = SKETCHES_DIR / f"{job_id}.{ext}"
        if path.exists():
            return path
    for ext in SKETCH_EXTENSIONS:
        legacy = STORAGE_DIR / f"{job_id}_sketch.{ext}"
        if legacy.exists():
            return legacy
    return None


def find_model_glb(file_prefix: str) -> Optional[Path]:
    path = model_glb_path(file_prefix)
    if path.exists():
        return path
    legacy = STORAGE_DIR / f"{file_prefix}.glb"
    return legacy if legacy.exists() else None


def find_model_usdz(file_prefix: str) -> Optional[Path]:
    path = model_usdz_path(file_prefix)
    if path.exists():
        return path
    legacy = STORAGE_DIR / f"{file_prefix}.usdz"
    return legacy if legacy.exists() else None


def find_model_3mf(file_prefix: str) -> Optional[Path]:
    path = model_3mf_path(file_prefix)
    if path.exists():
        return path
    legacy = STORAGE_DIR / f"{file_prefix}.3mf"
    return legacy if legacy.exists() else None


def find_farbauswahl(job_id: str) -> Optional[Path]:
    path = farbauswahl_path(job_id)
    if path.exists():
        return path
    legacy = STORAGE_DIR / f"{job_id}.farbauswahl.json"
    return legacy if legacy.exists() else None


def find_meta(job_id: str) -> Optional[Path]:
    path = meta_path(job_id)
    if path.exists():
        return path
    legacy = STORAGE_DIR / f"{job_id}.meta.json"
    return legacy if legacy.exists() else None


def normalize_job_id(job_id: Optional[str]) -> Optional[str]:
    return _normalize_job_id(job_id)


def _normalize_job_id(job_id: Optional[str]) -> Optional[str]:
    if not job_id:
        return None
    cleaned = job_id.strip()
    if cleaned.endswith(".meta.json"):
        cleaned = cleaned.removesuffix(".meta.json")
    elif cleaned.endswith(".meta"):
        cleaned = cleaned.removesuffix(".meta")
    if not cleaned:
        return None
    return cleaned


def _job_id_from_meta_name(filename: str) -> Optional[str]:
    if filename.endswith(".meta.json"):
        return _normalize_job_id(filename.removesuffix(".meta.json"))
    return None


def iter_known_job_ids() -> Iterator[str]:
    seen: set[str] = set()

    def register(job_id: Optional[str]) -> None:
        normalized = _normalize_job_id(job_id)
        if not normalized or normalized in seen:
            return
        if "_" in normalized and normalized.rsplit("_", 1)[-1].isdigit():
            return
        seen.add(normalized)

    for entry in load_index().get("entries", []):
        register(entry.get("job_id"))

    for meta_file in META_DIR.glob("*.meta.json"):
        register(_job_id_from_meta_name(meta_file.name))

    for legacy_meta in STORAGE_DIR.glob("*.meta.json"):
        register(_job_id_from_meta_name(legacy_meta.name))

    for glb in MODELS_DIR.glob("*.glb"):
        stem = glb.stem
        if "_" in stem and stem.rsplit("_", 1)[-1].isdigit():
            register(stem.rsplit("_", 1)[0])
        else:
            register(stem)

    for legacy_glb in STORAGE_DIR.glob("*.glb"):
        stem = legacy_glb.stem
        if "_" in stem and stem.rsplit("_", 1)[-1].isdigit():
            register(stem.rsplit("_", 1)[0])
        else:
            register(stem)

    for sketch in SKETCHES_DIR.iterdir():
        if sketch.is_file() and sketch.suffix:
            register(sketch.stem)

    for ext in SKETCH_EXTENSIONS:
        for legacy_sketch in STORAGE_DIR.glob(f"*_sketch.{ext}"):
            register(legacy_sketch.name.split("_sketch.", 1)[0])

    yield from seen


def migrate_flat_storage() -> int:
    """Move legacy flat files in storage/ root into subfolders."""
    ensure_storage_dir()
    moved = 0

    for src in list(STORAGE_DIR.iterdir()):
        if not src.is_file() or src.name in ROOT_RESERVED:
            continue

        name = src.name
        dest: Optional[Path] = None

        if name.endswith(".meta.json"):
            dest = meta_path(name.removesuffix(".meta.json"))
        elif name.endswith(".farbauswahl.json"):
            dest = farbauswahl_path(name.removesuffix(".farbauswahl.json"))
        elif name.endswith(".3mf"):
            dest = PRINT_DIR / name
        elif name.endswith((".glb", ".usdz")):
            dest = MODELS_DIR / name
        elif "_sketch." in name:
            job_id, ext = name.split("_sketch.", 1)
            norm = "jpg" if ext in ("jpg", "jpeg") else ext
            dest = SKETCHES_DIR / f"{job_id}.{norm}"

        if not dest:
            continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            src.unlink()
        else:
            shutil.move(str(src), str(dest))
        moved += 1

    _normalize_index_paths()
    return moved


def migrate_legacy_outputs() -> int:
    """Copy files from backend/outputs/ into backend/storage/ subfolders."""
    if not LEGACY_OUTPUT_DIR.exists():
        return 0

    ensure_storage_dir()
    copied = 0
    for src in LEGACY_OUTPUT_DIR.iterdir():
        if not src.is_file():
            continue

        name = src.name
        if name.endswith(".meta.json"):
            dest = meta_path(name.removesuffix(".meta.json"))
        elif name.endswith(".farbauswahl.json"):
            dest = farbauswahl_path(name.removesuffix(".farbauswahl.json"))
        elif name.endswith(".3mf"):
            dest = PRINT_DIR / name
        elif name.endswith((".glb", ".usdz")):
            dest = MODELS_DIR / name
        elif "_sketch." in name:
            job_id, ext = name.split("_sketch.", 1)
            norm = "jpg" if ext in ("jpg", "jpeg") else ext
            dest = SKETCHES_DIR / f"{job_id}.{norm}"
        else:
            continue

        if dest.exists():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied += 1

    return copied


def _normalize_index_paths() -> None:
    data = _load_index()
    changed = False
    for entry in data.get("entries", []):
        sketch = entry.get("sketch")
        if isinstance(sketch, str) and "_sketch." in sketch and not sketch.startswith("sketches/"):
            job_id = entry.get("job_id")
            if job_id:
                found = find_sketch_path(job_id)
                if found:
                    entry["sketch"] = f"sketches/{found.name}"
                    changed = True
        glb = entry.get("glb")
        if isinstance(glb, str) and glb.endswith(".glb") and not glb.startswith("models/"):
            entry["glb"] = f"models/{glb}"
            changed = True
        usdz = entry.get("usdz")
        if isinstance(usdz, str) and usdz.endswith(".usdz") and not usdz.startswith("models/"):
            entry["usdz"] = f"models/{usdz}"
            changed = True
        tmf = entry.get("three_mf")
        if isinstance(tmf, str) and tmf.endswith(".3mf") and not tmf.startswith("print/"):
            entry["three_mf"] = f"print/{tmf}"
            changed = True
    if changed:
        _save_index(data)


def _load_index() -> dict:
    if not INDEX_PATH.exists():
        return {"entries": []}
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"entries": []}
    if not isinstance(data.get("entries"), list):
        data["entries"] = []
    return data


def _save_index(data: dict) -> None:
    ensure_storage_dir()
    INDEX_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def register_generation(
    job_id: str,
    *,
    sketch: Optional[str] = None,
    glb: Optional[str] = None,
    usdz: Optional[str] = None,
    three_mf: Optional[str] = None,
) -> None:
    data = _load_index()
    entries = data["entries"]
    entry = next((item for item in entries if item.get("job_id") == job_id), None)
    if not entry:
        entry = {
            "job_id": job_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sketch": None,
            "glb": None,
            "usdz": None,
            "three_mf": None,
        }
        entries.append(entry)

    if sketch:
        entry["sketch"] = sketch
    if glb:
        entry["glb"] = glb if glb.startswith("models/") else f"models/{glb}"
    if usdz:
        entry["usdz"] = usdz if usdz.startswith("models/") else f"models/{usdz}"
    if three_mf:
        entry["three_mf"] = three_mf if three_mf.startswith("print/") else f"print/{three_mf}"
    entry["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_index(data)


def load_index() -> dict:
    return _load_index()


def remove_from_index(job_id: str) -> bool:
    data = _load_index()
    before = len(data["entries"])
    data["entries"] = [item for item in data["entries"] if item.get("job_id") != job_id]
    if len(data["entries"]) == before:
        return False
    _save_index(data)
    return True
