import requests
from config import API_KEY, TARGET_POLYCOUNT


def auftrag_erstellen(image_data):
    headers = {"Authorization": f"Bearer {API_KEY}"}

    response = requests.post(
        "https://api.meshy.ai/openapi/v1/image-to-3d",
        headers=headers,
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

    data = response.json()
    if response.status_code >= 400:
        raise RuntimeError(data.get("message") or response.text)
    task_id = data.get("result") or data.get("task_id") or data.get("id")
    if not task_id:
        raise RuntimeError(data.get("message") or f"Meshy-Antwort unerwartet: {data}")
    return task_id
