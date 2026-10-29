import requests
from config import API_KEY, TARGET_POLYCOUNT

HEADERS = {"Authorization": f"Bearer {API_KEY}"}


def sketch_to_3d(image_data):
    response = requests.post(
        "https://api.meshy.ai/openapi/v1/image-to-3d",
        headers=HEADERS,
        json={
            "image_url":      image_data,
            "ai_model":       "meshy-7.1",
            "should_texture": True,
            "texture_image_url": image_data,
            "target_formats": ["glb", "3mf", "usdz"],
            # Ohne Remesh liefert meshy-7 Rohmeshes, die Handys überfordern.
            "should_remesh":  True,
            "target_polycount": TARGET_POLYCOUNT,
            "topology":       "quad",  # or "triangle" (default)
        }
    )
    return _task_id_from_response(response)


def text_to_3d_preview(prompt):
    """Text-to-3D Schritt 1: nur die Geometrie (ohne Textur)."""
    response = requests.post(
        "https://api.meshy.ai/openapi/v2/text-to-3d",
        headers=HEADERS,
        json={
            "mode":           "preview",
            "prompt":         prompt,
            "ai_model":       "meshy-7.1",
            # Die Vorschau wird nie angezeigt, GLB reicht.
            "target_formats": ["glb"],
            "should_remesh":  True,
            "target_polycount": TARGET_POLYCOUNT,
            "topology":       "quad",
        }
    )
    return _task_id_from_response(response)


def text_to_3d_refine(preview_task_id):
    """Text-to-3D Schritt 2: texturiert das Vorschau-Mesh. Nur dieses Ergebnis
    bekommen die Teilnehmenden zu sehen - wie bei Image-to-3D."""
    response = requests.post(
        "https://api.meshy.ai/openapi/v2/text-to-3d",
        headers=HEADERS,
        json={
            "mode":            "refine",
            "preview_task_id": preview_task_id,
            "target_formats":  ["glb", "3mf", "usdz"],
        }
    )
    return _task_id_from_response(response)


def _task_id_from_response(response):
    data = response.json()
    if response.status_code >= 400:
        raise RuntimeError(data.get("message") or response.text)
    task_id = data.get("result") or data.get("task_id") or data.get("id")
    if not task_id:
        raise RuntimeError(data.get("message") or f"Meshy-Antwort unerwartet: {data}")
    return task_id
