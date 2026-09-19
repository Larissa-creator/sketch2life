"""Testumgebung: eigenes STORAGE_DIR, damit echte Workshop-Daten unberührt
bleiben.

Wichtig: STORAGE_DIR und ADMIN_PASSWORD müssen stehen, bevor `api` importiert
wird - `storage_manager.STORAGE_DIR` und `auth._SECRET` werden beim Import
ausgewertet. conftest.py lädt vor den Testmodulen, darum passiert das hier.
"""

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ["STORAGE_DIR"] = tempfile.mkdtemp(prefix="sketch2life-tests-")
os.environ["ADMIN_PASSWORD"] = "test-admin-pw"
os.environ.setdefault("API_KEY", "test-key-not-used")

import pytest  # noqa: E402

import db  # noqa: E402
from api import app  # noqa: E402
from storage_manager import model_glb_path, sketch_path_for_ext  # noqa: E402

ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    return TestClient(app)


@pytest.fixture(scope="session")
def admin(client):
    response = client.post("/auth/admin", json={"password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture(scope="session")
def workshop(client, admin):
    """Workshop mit Kontingent 2, damit das Cap testbar bleibt."""
    response = client.post(
        "/admin/workshops",
        json={"name": "Testworkshop", "generation_cap": 2},
        headers=admin,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _attendee(client, code, name):
    response = client.post("/auth/login", json={"code": code, "name": name})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture(scope="session")
def mia(client, workshop):
    return _attendee(client, workshop["code"], "Mia")


@pytest.fixture(scope="session")
def ben(client, workshop):
    return _attendee(client, workshop["code"], "Ben")


@pytest.fixture(scope="session")
def jobs(workshop, mia, ben):
    """Zwei fertige Modelle auf der Platte, je eines pro Teilnehmerin.

    Läuft bewusst an /convert vorbei: der Meshy-Aufruf ist für die
    Zugriffsregeln irrelevant und würde Credits kosten.
    """
    created = {"Mia": "job-mia-1", "Ben": "job-ben-1"}
    for attendee, job_id in created.items():
        db.register_job(job_id, workshop["id"], attendee)
        glb = model_glb_path(job_id)
        glb.parent.mkdir(parents=True, exist_ok=True)
        glb.write_bytes(b"glb")
        sketch = sketch_path_for_ext(job_id, "jpg")
        sketch.parent.mkdir(parents=True, exist_ok=True)
        sketch.write_bytes(b"\xff\xd8jpg")
    return created


def job_ids(client, headers):
    response = client.get("/projects", headers=headers)
    assert response.status_code == 200, response.text
    return sorted(p["job_id"] for p in response.json()["projects"])
