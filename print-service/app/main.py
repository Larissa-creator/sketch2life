"""FastAPI Application - 3D Print Service"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import API_TITLE, API_DESCRIPTION, API_VERSION, LOG_LEVEL, MOCK_PRINTER
from app.api.routes import print_router, health_router, printer_router
from app.api.routes.print_jobs import set_printer_service
from app.api.routes.printer import set_printer_service as set_printer_service_printer
from app.services import PrinterService
from app.services.job_queue import initialize_job_queue

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize printer service
printer_service = PrinterService(mock_mode=MOCK_PRINTER)
set_printer_service(printer_service)
set_printer_service_printer(printer_service)

logger.info(f"Print Service v{API_VERSION} initialized")
logger.info(f"Printer mode: {'MOCK' if MOCK_PRINTER else 'REAL'}")


@app.on_event("startup")
async def startup():
    """Initialize connections on startup"""
    # Initialisiere Job-Queue
    job_queue = await initialize_job_queue()
    logger.info("Job queue initialized")

    try:
        await printer_service.connect()
        logger.info("Printer service connected")
    except Exception as exc:
        logger.warning(f"Failed to connect to printer: {exc}")
        if not MOCK_PRINTER:
            raise


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    try:
        await printer_service.disconnect()
        logger.info("Printer service disconnected")
    except Exception as exc:
        logger.error(f"Error disconnecting printer: {exc}")


# Register routers
app.include_router(health_router)
app.include_router(print_router)
app.include_router(printer_router)

logger.info(f"API {API_VERSION} started")


@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint"""
    return {
        "message": "3D Print Service",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "printer_mode": "mock" if MOCK_PRINTER else "real",
    }
