from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ColorSelection(BaseModel):
    """Farbauswahl für einen Figur-Teil"""

    teil: str = Field(..., description="Figurenteil: z.B. 'Kleidung', 'Haare'")
    farbe: str = Field(..., description="Farbe: z.B. 'Blau', 'Schwarz'")


class PrintJob(BaseModel):
    """Eingehender Druck-Job vom Ki-Backend"""

    objekt_id: str = Field(..., description="Eindeutige Objekt-ID (job_id vom Ki-Backend)")
    farben: List[ColorSelection] = Field(default=[], description="Ausgewählte Farben")
    hautfarbe: str = Field(default="Weiß", description="Hautfarbe der Figur")

    class Config:
        json_schema_extra = {
            "example": {
                "objekt_id": "550e8400-e29b-41d4-a716-446655440000",
                "farben": [
                    {"teil": "Kleidung", "farbe": "Blau"},
                    {"teil": "Haare", "farbe": "Schwarz"}
                ],
                "hautfarbe": "Weiß"
            }
        }


class PrintJobStatus(BaseModel):
    """Status eines Druck-Jobs"""

    job_id: str = Field(..., description="Eindeutige Job-ID (intern)")
    objekt_id: str = Field(..., description="Objekt-ID vom Ki-Backend")
    status: str = Field(
        ...,
        description=(
            "Status: created | pending | sending | printing | completed | "
            "failed | cancelled | blocked"
        ),
        pattern="^(created|pending|sending|printing|completed|failed|cancelled|blocked)$"
    )
    confirmed: bool = Field(
        default=False,
        description="True sobald der Auftrag via /confirm freigegeben wurde",
    )
    color: Optional[str] = Field(
        default=None, description="Ausgewählte Farbe (aus der Farb-TXT), z.B. 'red', 'RAL7016'"
    )
    progress: int = Field(default=0, ge=0, le=100, description="Progress 0-100%")
    printer_status: Optional[str] = Field(default=None, description="Status vom Drucker")
    error: Optional[str] = Field(default=None, description="Fehler-Message bei Fehler")
    created_at: str = Field(..., description="Zeitpunkt der Erstellung")
    updated_at: str = Field(..., description="Letzte Aktualisierung")
    estimated_time_minutes: Optional[int] = Field(default=None, description="Geschätzte Druckzeit in Minuten")

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "pj-550e8400-e29b-41d4-a716",
                "objekt_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "printing",
                "progress": 45,
                "printer_status": "printing",
                "error": None,
                "created_at": "2026-06-18T10:00:00Z",
                "updated_at": "2026-06-18T10:15:30Z",
                "estimated_time_minutes": 120
            }
        }


class PrintJobResponse(BaseModel):
    """Response nach erfolgreicher Job-Erstellung"""

    ok: bool
    job_id: str = Field(..., description="Eindeutige Job-ID")
    objekt_id: str = Field(..., description="Objekt-ID vom Ki-Backend")
    status: str = Field(..., description="Initiales Status: 'pending'")
    message: str = Field(..., description="Bestätigungsmeldung")

    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "job_id": "pj-550e8400-e29b-41d4-a716",
                "objekt_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "pending",
                "message": "Print job created successfully"
            }
        }


class PrintJobCreatedResponse(BaseModel):
    """
    Response von Schritt 1 (SEND / POST /print/create).

    Der Auftrag ist registriert und persistiert, aber NOCH NICHT bestätigt
    und NICHT gedruckt. Er muss über POST /print/{job_id}/confirm ausgelöst werden.
    """

    ok: bool = True
    job_id: str = Field(..., description="Eindeutige Job-ID")
    objekt_id: str = Field(..., description="Objekt-ID vom Ki-Backend")
    status: str = Field(default="created", description="Immer 'created' nach SEND")
    confirmed: bool = Field(default=False, description="Immer False nach SEND")
    color: Optional[str] = Field(default=None, description="Verknüpfte Farbe aus der TXT")
    message: str = Field(
        default="Job created. Not yet confirmed — call POST /print/{job_id}/confirm to start printing.",
        description="Hinweis, dass der Auftrag noch bestätigt werden muss",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "job_id": "pj-550e8400-e29b-41d4-a716",
                "objekt_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "created",
                "confirmed": False,
                "color": "RAL7016",
                "message": "Job created. Not yet confirmed — call POST /print/{job_id}/confirm to start printing.",
            }
        }


class PrintJobConfirmResponse(BaseModel):
    """
    Response von Schritt 2 (CONFIRM / POST /print/{job_id}/confirm) bei Erfolg.

    Verfügbarkeitsprüfung bestanden, Druck ausgelöst, Status = 'printing'.
    """

    ok: bool = True
    job_id: str = Field(..., description="Eindeutige Job-ID")
    objekt_id: str = Field(..., description="Objekt-ID vom Ki-Backend")
    status: str = Field(default="printing", description="'printing' wenn Druck ausgelöst")
    confirmed: bool = Field(default=True, description="Immer True nach erfolgreichem CONFIRM")
    printer_status: Optional[str] = Field(default=None, description="Status vom Drucker zum Zeitpunkt der Freigabe")
    message: str = Field(default="Printer available. Print job started.", description="Bestätigungsmeldung")

    class Config:
        json_schema_extra = {
            "example": {
                "ok": True,
                "job_id": "pj-550e8400-e29b-41d4-a716",
                "objekt_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "printing",
                "confirmed": True,
                "printer_status": "idle",
                "message": "Printer available. Print job started.",
            }
        }
