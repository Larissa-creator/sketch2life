"""Job Queue - Verwaltet Print-Job-Warteschlange mit Worker"""

import asyncio
import logging
from typing import Optional
from collections import deque

from app.services.print_service import PrintService

logger = logging.getLogger(__name__)


class JobQueue:
    """FIFO Queue für Print-Jobs mit Worker-basierter Verarbeitung"""

    def __init__(self):
        self._queue: deque = deque()
        self._processing = False
        self._current_job_id: Optional[str] = None
        self._worker_task: Optional[asyncio.Task] = None

    async def enqueue(self, job_id: str, process_func) -> None:
        """Füge Job zur Queue hinzu"""
        logger.info(f"Enqueueing job {job_id}")
        self._queue.append((job_id, process_func))

        # Starte Worker falls noch nicht laufen
        if not self._processing:
            await self._start_worker()

    async def _start_worker(self) -> None:
        """Starte Worker Loop"""
        if self._processing:
            return

        self._processing = True
        logger.info("Starting job queue worker")
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def _worker_loop(self) -> None:
        """Worker Loop - verarbeite Jobs sequenziell"""
        try:
            while self._processing:
                if not self._queue:
                    # Queue leer - Worker stoppen
                    self._processing = False
                    logger.info("Job queue is empty, worker stopping")
                    break

                # Nächsten Job aus Queue
                job_id, process_func = self._queue.popleft()
                self._current_job_id = job_id

                try:
                    logger.info(f"Processing job {job_id} from queue ({len(self._queue)} remaining)")
                    PrintService.update_job_status(job_id, "sending", progress=10)

                    # Führe Job aus
                    await process_func(job_id)

                    logger.info(f"Completed job {job_id}")

                except Exception as exc:
                    logger.error(f"Job {job_id} failed: {exc}", exc_info=True)
                    PrintService.mark_failed(job_id, str(exc))

                finally:
                    self._current_job_id = None

        except Exception as exc:
            logger.error(f"Worker loop error: {exc}", exc_info=True)
            self._processing = False

    def get_queue_size(self) -> int:
        """Anzahl wartender Jobs"""
        return len(self._queue)

    def get_current_job(self) -> Optional[str]:
        """Aktuell verarbeiteter Job"""
        return self._current_job_id

    def get_status(self) -> dict:
        """Queue-Status"""
        return {
            "queue_size": self.get_queue_size(),
            "current_job": self.get_current_job(),
            "is_processing": self._processing,
        }


# Globale Queue-Instanz
_job_queue: Optional[JobQueue] = None


def get_job_queue() -> JobQueue:
    """Hole oder erstelle globale Job-Queue"""
    global _job_queue
    if _job_queue is None:
        _job_queue = JobQueue()
    return _job_queue


async def initialize_job_queue() -> JobQueue:
    """Initialisiere Job-Queue (bei Startup)"""
    return get_job_queue()
