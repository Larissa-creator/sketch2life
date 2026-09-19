# Print Service

FastAPI service for the 3D print workflow: receives 3MF files and colour choices, queues jobs, and talks to Bambu Lab printers (or runs in mock mode for testing).

## Setup

```powershell
cd print-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Or run `.\setup.ps1` from the project root.

## Start

```powershell
python run.py
```

API docs: http://127.0.0.1:3005/docs

## Test without a printer

In `.env`:

```
MOCK_PRINTER=true
```

## Requirements

See `requirements.txt` in this folder.

## How it connects

The 3D generation backend (`backend/`) sends print jobs here when a user taps “Send to 3D print team” in the app.
