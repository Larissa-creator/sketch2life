from .print_jobs import router as print_router
from .health import router as health_router
from .printer import router as printer_router

__all__ = ["print_router", "health_router", "printer_router"]
