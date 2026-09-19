# 3D Generation Backend

FastAPI service that converts a 2D image into a 3D model using the Meshy API. Also handles style variants (cartoon, rainbow, wood) and forwards print jobs to the print service.

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Add your Meshy key to `.env`:

```
API_KEY=your_key_here
PRINT_API_URL=http://127.0.0.1:3005
```

Or run `.\setup.ps1` from the project root.

## Start

```powershell
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs

## Requirements

See `requirements.txt` in this folder.

## Print integration

The frontend calls `POST /jobs/{job_id}/send-to-printer` on this backend. The backend uploads the 3MF file to the print service (`print-service/`, port 3005).
