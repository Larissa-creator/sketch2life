import requests
from config import API_KEY


def retexture_erstellen(input_task_id: str, text_style_prompt: str) -> str:
    """Erstellt einen Retexture-Auftrag basierend auf einem fertigen Image-to-3D-Task."""
    headers = {"Authorization": f"Bearer {API_KEY}"}
    resp = requests.post(
        "https://api.meshy.ai/openapi/v1/retexture",
        headers=headers,
        json={
            "input_task_id": input_task_id,
            "text_style_prompt": text_style_prompt,
            "enable_original_uv": True,
            "target_formats": ["glb", "3mf", "usdz"],
        },
    )
    resp.raise_for_status()
    return resp.json()["result"]
