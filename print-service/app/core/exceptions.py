from fastapi import HTTPException, status


class PrintServiceException(Exception):
    """Basis-Exception für Print Service"""

    def __init__(self, message: str, error_code: str = "UNKNOWN_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class InvalidFileException(PrintServiceException):
    """Ungültige oder nicht-unterstützte Datei"""

    def __init__(self, message: str = "Invalid file format"):
        super().__init__(message, "INVALID_FILE")


class FileSizeTooLargeException(PrintServiceException):
    """Datei überschreitet maximale Größe"""

    def __init__(self, message: str = "File size exceeds limit"):
        super().__init__(message, "FILE_TOO_LARGE")


class PrintJobNotFoundException(PrintServiceException):
    """PrintJob mit dieser ID nicht gefunden"""

    def __init__(self, job_id: str):
        super().__init__(f"Print job {job_id} not found", "JOB_NOT_FOUND")


class PrinterNotAvailableException(PrintServiceException):
    """Drucker ist nicht verfügbar/erreichbar"""

    def __init__(self, reason: str = "Printer not available"):
        super().__init__(f"Printer not available: {reason}", "PRINTER_UNAVAILABLE")


class PrinterCommunicationException(PrintServiceException):
    """Fehler in der Kommunikation mit Drucker"""

    def __init__(self, message: str):
        super().__init__(message, "PRINTER_COMMUNICATION_ERROR")


class PrintJobFailedException(PrintServiceException):
    """Druck-Job fehlgeschlagen"""

    def __init__(self, job_id: str, error: str):
        super().__init__(f"Print job {job_id} failed: {error}", "JOB_FAILED")


class PrintJobAlreadyProcessedException(PrintServiceException):
    """Auftrag wurde bereits bestätigt/gedruckt und kann nicht erneut ausgelöst werden"""

    def __init__(self, job_id: str, current_status: str):
        super().__init__(
            f"Print job {job_id} already processed (status: {current_status})",
            "JOB_ALREADY_PROCESSED",
        )


class JobIncompleteException(PrintServiceException):
    """Auftrag ist nicht bestätigungsfähig (fehlende Datei oder Farbe nicht verknüpft)"""

    def __init__(self, message: str):
        super().__init__(message, "JOB_INCOMPLETE")


class StorageException(PrintServiceException):
    """Fehler beim Speichern/Laden von Dateien"""

    def __init__(self, message: str):
        super().__init__(message, "STORAGE_ERROR")


def exception_to_http(exc: PrintServiceException) -> HTTPException:
    """Konvertiere PrintServiceException zu HTTPException"""
    # 413/422 wurden in neueren Starlette-Versionen umbenannt (RFC 9110).
    # getattr-Fallback hält den Code über Versionen hinweg robust.
    http_413 = getattr(
        status, "HTTP_413_CONTENT_TOO_LARGE",
        getattr(status, "HTTP_413_PAYLOAD_TOO_LARGE", 413),
    )
    http_422 = getattr(
        status, "HTTP_422_UNPROCESSABLE_CONTENT",
        getattr(status, "HTTP_422_UNPROCESSABLE_ENTITY", 422),
    )
    status_map = {
        "INVALID_FILE": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        "FILE_TOO_LARGE": http_413,
        "JOB_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "PRINTER_UNAVAILABLE": status.HTTP_503_SERVICE_UNAVAILABLE,
        "PRINTER_COMMUNICATION_ERROR": status.HTTP_502_BAD_GATEWAY,
        "JOB_FAILED": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "STORAGE_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "JOB_ALREADY_PROCESSED": status.HTTP_409_CONFLICT,
        "JOB_INCOMPLETE": http_422,
    }
    http_status = status_map.get(exc.error_code, status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=http_status, detail=exc.message)
