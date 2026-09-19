"""Zugriffsregeln der Workshop-Logik.

Die Tests laufen bewusst ohne Meshy: jede Prüfung greift, bevor ein
Generierungs-Auftrag rausgeht, darum kostet CI keine Credits.

Sie erzählen einen Workshop von vorn bis hinten (anlegen -> generieren ->
beenden) und bauen daher aufeinander auf: in Dateireihenfolge ausführen,
kein pytest-randomly.
"""

import db
from conftest import ADMIN_PASSWORD, job_ids


# --- ohne Login --------------------------------------------------------------

def test_health_is_public(client):
    assert client.get("/health").status_code == 200


def test_downloads_stay_public(client, jobs):
    """Capability-URLs: AR Quick Look und QR-Links können keinen Token mitgeben."""
    assert client.get("/download/job-ben-1/glb").status_code == 200


def test_protected_routes_need_login(client):
    assert client.get("/projects").status_code == 401
    assert client.post("/convert").status_code == 401
    assert client.delete("/projects/job-mia-1").status_code == 401


# --- Login -------------------------------------------------------------------

def test_admin_login_rejects_wrong_password(client):
    assert client.post("/auth/admin", json={"password": "nope"}).status_code == 401


def test_admin_login_succeeds(client):
    response = client.post("/auth/admin", json={"password": ADMIN_PASSWORD})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_workshop_code_is_readable(workshop):
    code = workshop["code"]
    assert code.count("-") == 2 and code.rsplit("-", 1)[1].isdigit()


def test_login_rejects_unknown_code(client):
    response = client.post(
        "/auth/login", json={"code": "falsch-falsch-000", "name": "Mia"}
    )
    assert response.status_code == 401


def test_login_normalises_code_and_name(client, workshop):
    response = client.post(
        "/auth/login", json={"code": workshop["code"].upper(), "name": "  Mia  "}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Mia"


def test_session_reports_workshop_status(client, mia):
    assert client.get("/auth/session", headers=mia).json()["workshop"]["status"] == "active"


# --- Sichtbarkeit zwischen Teilnehmenden -------------------------------------

def test_attendees_see_only_their_own_models(client, jobs, mia, ben):
    assert job_ids(client, mia) == ["job-mia-1"]
    assert job_ids(client, ben) == ["job-ben-1"]


def test_attendee_name_is_case_insensitive(client, jobs, workshop):
    response = client.post(
        "/auth/login", json={"code": workshop["code"], "name": "MIA"}
    )
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    assert job_ids(client, headers) == ["job-mia-1"]


def test_foreign_job_is_hidden_not_forbidden(client, jobs, mia):
    """404 statt 403: fremde Job-IDs sollen sich nicht bestätigen lassen."""
    assert client.get("/status/job-mia-1", headers=mia).status_code == 200
    assert client.get("/status/job-ben-1", headers=mia).status_code == 404


def test_admin_sees_every_job(client, jobs, admin):
    assert client.get("/status/job-mia-1", headers=admin).status_code == 200


def test_attendee_cannot_reach_admin_routes(client, mia):
    assert client.get("/admin/workshops", headers=mia).status_code == 403


# --- Farbwahl ----------------------------------------------------------------

def test_attendee_saves_own_colour(client, jobs, mia):
    response = client.put(
        "/jobs/job-mia-1/farbauswahl", json={"selected_color": "Red"}, headers=mia
    )
    assert response.status_code == 200


def test_attendee_cannot_set_foreign_colour(client, jobs, mia):
    response = client.put(
        "/jobs/job-ben-1/farbauswahl", json={"selected_color": "red"}, headers=mia
    )
    assert response.status_code == 404


# --- Kontingent --------------------------------------------------------------

def test_generation_cap_blocks_when_used_up(client, jobs, workshop, mia):
    assert db.try_consume_generation(workshop["id"]) is True
    assert db.try_consume_generation(workshop["id"]) is True
    assert db.try_consume_generation(workshop["id"]) is False

    response = client.post("/projects/job-mia-1/generate", headers=mia)
    assert response.status_code == 403


# --- Workshop beenden (read-only) --------------------------------------------

def test_readonly_freezes_generation_and_colour(client, jobs, workshop, admin, mia):
    patched = client.patch(
        f"/admin/workshops/{workshop['id']}",
        json={"status": "readonly"},
        headers=admin,
    )
    assert patched.json()["status"] == "readonly"

    # Ansehen bleibt erlaubt - das ist der Sinn des Read-only-Modus.
    assert job_ids(client, mia) == ["job-mia-1"]
    assert client.post(
        "/auth/login", json={"code": workshop["code"], "name": "Mia"}
    ).status_code == 200

    blocked = client.post("/projects/job-mia-1/generate", headers=mia)
    assert blocked.status_code == 403
    assert "beendet" in blocked.json()["detail"]

    frozen = client.put(
        "/jobs/job-mia-1/farbauswahl", json={"selected_color": "blue"}, headers=mia
    )
    assert frozen.status_code == 409


def test_admin_may_still_set_colour_after_workshop(client, jobs, admin):
    response = client.put(
        "/jobs/job-ben-1/farbauswahl", json={"selected_color": "green"}, headers=admin
    )
    assert response.status_code == 200


# --- Admin-Übersicht ---------------------------------------------------------

def test_overview_counts_models_and_picked_colours(client, jobs, admin):
    workshop = client.get("/admin/workshops", headers=admin).json()["workshops"][0]
    assert workshop["job_count"] == 2
    assert workshop["model_count"] == 2
    assert workshop["colors_picked"] == 2


def test_models_are_grouped_with_their_colour(client, jobs, workshop, admin):
    data = client.get(
        f"/admin/workshops/{workshop['id']}/models", headers=admin
    ).json()
    assert {m["attendee"]: m["color"] for m in data["models"]} == {
        "Mia": "red",
        "Ben": "green",
    }


# --- Code rotieren -----------------------------------------------------------

def test_rotating_code_keeps_existing_sessions_alive(client, workshop, admin, mia):
    old_code = client.get("/admin/workshops", headers=admin).json()["workshops"][0]["code"]

    rotated = client.patch(
        f"/admin/workshops/{workshop['id']}", json={"rotate_code": True}, headers=admin
    ).json()
    assert rotated["code"] != old_code

    assert client.post(
        "/auth/login", json={"code": old_code, "name": "Mia"}
    ).status_code == 401
    # Bereits angemeldete Teilnehmende sollen nicht rausfliegen.
    assert client.get("/projects", headers=mia).status_code == 200


# --- Löschen -----------------------------------------------------------------

def test_only_admin_deletes(client, jobs, mia, admin):
    assert client.delete("/projects/job-mia-1", headers=mia).status_code == 403

    response = client.delete("/projects/job-mia-1", headers=admin)
    assert response.status_code == 200
    assert db.get_job("job-mia-1") is None
