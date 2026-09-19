"""Storage Service - 3MF file management"""

import logging
from pathlib import Path
from typing import Optional, Tuple

from app.core.config import OUTPUT_DIR, MAX_FILE_SIZE_BYTES
from app.core.exceptions import FileSizeTooLargeException, StorageException

logger = logging.getLogger(__name__)


class StorageService:
    """Manages 3MF file storage"""

    @staticmethod
    def save_3mf_file(job_id: str, file_content: bytes) -> Path:
        """
        Save 3MF file to disk

        Args:
            job_id: Print job ID
            file_content: Binary content of 3MF file

        Returns:
            Path to saved file

        Raises:
            FileSizeTooLargeException: If file exceeds size limit
            StorageException: If save fails
        """
        try:
            if len(file_content) > MAX_FILE_SIZE_BYTES:
                raise FileSizeTooLargeException(
                    f"File size {len(file_content)} exceeds limit {MAX_FILE_SIZE_BYTES}"
                )

            file_path = OUTPUT_DIR / f"{job_id}.3mf"
            file_path.write_bytes(file_content)

            logger.info(f"Saved 3MF file for job {job_id}: {len(file_content)} bytes")
            return file_path

        except FileSizeTooLargeException:
            raise
        except Exception as exc:
            logger.error(f"Failed to save 3MF file: {exc}")
            raise StorageException(f"Failed to save 3MF file: {str(exc)}")

    @staticmethod
    def get_3mf_file(job_id: str) -> Path:
        """
        Get path to 3MF file

        Args:
            job_id: Print job ID

        Returns:
            Path to 3MF file

        Raises:
            StorageException: If file doesn't exist
        """
        file_path = OUTPUT_DIR / f"{job_id}.3mf"

        if not file_path.exists():
            raise StorageException(f"3MF file not found for job {job_id}")

        return file_path

    @staticmethod
    def file_exists(job_id: str) -> bool:
        """Check if 3MF file exists"""
        file_path = OUTPUT_DIR / f"{job_id}.3mf"
        return file_path.exists()

    # ── Color (.txt) ─────────────────────────────────────────────────────────

    @staticmethod
    def save_color_file(job_id: str, color: str) -> Path:
        """
        Persist the selected color as a plain .txt (single value, e.g. 'RAL7016').

        Returns:
            Path to saved color file
        """
        try:
            file_path = OUTPUT_DIR / f"{job_id}.color.txt"
            file_path.write_text((color or "").strip(), encoding="utf-8")
            logger.info(f"Saved color file for job {job_id}: {color!r}")
            return file_path
        except Exception as exc:
            logger.error(f"Failed to save color file: {exc}")
            raise StorageException(f"Failed to save color file: {str(exc)}")

    @staticmethod
    def color_file_exists(job_id: str) -> bool:
        """Check if a color .txt exists for this job"""
        return (OUTPUT_DIR / f"{job_id}.color.txt").exists()

    @staticmethod
    def get_color(job_id: str) -> Optional[str]:
        """Read the persisted color for this job, or None if not present."""
        file_path = OUTPUT_DIR / f"{job_id}.color.txt"
        if not file_path.exists():
            return None
        value = file_path.read_text(encoding="utf-8").strip()
        return value or None

    @staticmethod
    def delete_3mf_file(job_id: str) -> bool:
        """
        Delete 3MF file

        Args:
            job_id: Print job ID

        Returns:
            True if deleted, False if not found
        """
        try:
            file_path = OUTPUT_DIR / f"{job_id}.3mf"
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted 3MF file for job {job_id}")
                return True
            return False
        except Exception as exc:
            logger.error(f"Failed to delete 3MF file: {exc}")
            raise StorageException(f"Failed to delete 3MF file: {str(exc)}")

    @staticmethod
    def get_file_info(job_id: str) -> dict:
        """Get file information"""
        try:
            file_path = StorageService.get_3mf_file(job_id)
            stat = file_path.stat()
            return {
                "path": str(file_path),
                "size_bytes": stat.st_size,
                "created_at": stat.st_ctime,
                "modified_at": stat.st_mtime,
            }
        except Exception as exc:
            logger.error(f"Failed to get file info: {exc}")
            raise StorageException(f"Failed to get file info: {str(exc)}")
