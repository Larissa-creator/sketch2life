"""Health Check Routes"""

from fastapi import APIRouter
from typing import Dict

from app.services.job_queue import get_job_queue

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    summary="Health Check",
    description="Simple health check endpoint",
)
async def health() -> Dict[str, str]:
    """Simple health check."""
    return {"status": "healthy", "service": "print-service"}


@router.get(
    "/queue-status",
    summary="Queue Status",
    description="Get current print job queue status",
)
async def queue_status() -> Dict:
    """Get queue status for debugging."""
    job_queue = get_job_queue()
    return {
        "queue": job_queue.get_status(),
        "message": "Nur ein Job gleichzeitig wird verarbeitet",
    }
