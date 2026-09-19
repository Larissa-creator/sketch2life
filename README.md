# Sketch2Life

Turn a sketch or photo into a 3D model, view it on screen or in AR, and send it to a 3D printer.

## What you need on the PC

Install once (see `requirements-global.txt`):

- **Git**
- **Node.js** (LTS, includes npm)
- **Python 3.10+**
- **Meshy API key** — https://www.meshy.ai/

Check:

```powershell
node -v
npm -v
python --version
git --version
```

## Fresh university PC (nothing installed yet)

### Step 1 — Install system tools

Install Git, Node.js LTS, and Python 3.10+ (enable **Add Python to PATH** during setup).

### Step 2 — Clone this branch

```powershell
cd C:\Users\YourName\Documents
git clone -b ilde-frontend https://git.uni-due.de/isy/praxisprojekte/sketch-to-life.git
cd sketch-to-life
```

### Step 3 — Install project dependencies

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\setup.ps1
```

This installs:

- Python packages for **backend** (`backend/requirements.txt`)
- Python packages for **print-service** (`print-service/requirements.txt`)
- npm packages for **frontend** (`frontend/package.json`)
- empty data folders (`backend/storage/`, `print-service/data/`)

### Step 4 — API key

Edit `backend\.env` and set your Meshy key:

```
API_KEY=your_meshy_key_here
```

### Step 5 — Start

```powershell
.\start-dev.ps1
```

Open **http://localhost:5173** on the PC. Students scan the QR on the home page.

Print requests are saved in `print-service\data\print_requests.json`.

### Step 6 — Firewall (if phones cannot connect)

Open PowerShell **as Administrator**:

```powershell
cd C:\path\to\sketch-to-life
.\open-firewall.ps1
```

Then restart `.\start-dev.ps1`.

## Install the project (already cloned)

```powershell
git pull
.\setup.ps1
```

## Start everything

```powershell
.\start-dev.ps1
```

This starts three services:

| Service | Folder | Port |
|---------|--------|------|
| Frontend (UI + AR) | `frontend/` | 5173 |
| 3D generation API | `backend/` | 8000 |
| Print service | `print-service/` | 3005 |

Open on the PC: **http://localhost:5173**

## Workshop setup (phones)

1. Connect the PC to **Eduroam** (internet for 3D generation).
2. Turn on the **Windows mobile hotspot** (Settings → Network → Mobile hotspot).
3. Run `.\start-dev.ps1` (hotspot must be on first).
4. Open the app on the PC and find the QR code block (“Workshop — Join app”).
5. Students connect their phones to the **PC hotspot** (not Eduroam) and scan the QR.

The QR opens the app URL (e.g. `http://192.168.137.1:5173`). It is **not** a Wi‑Fi password QR.

### Deploy on another PC (e.g. university machine)

You do **not** need to commit or hand-edit a QR code image. The QR on the home page is **generated at runtime** from the PC’s LAN IP.

**On workshop day, on the university PC:**

1. Clone or pull the latest code (`git pull`).
2. Run `.\setup.ps1` once (installs everything + copies `.env` files).
3. Set `API_KEY` in `backend/.env` if not done during setup.
4. Run `.\start-dev.ps1` — sets the phone URL automatically.
5. Students scan the QR on the home page.

Print requests are saved in `print-service/data/print_requests.json`.

Optional helpers:

```powershell
.\show-workshop-qr.ps1           # print the phone URL
.\show-workshop-qr.ps1 -SavePng  # save workshop-qr.png for slides
.\smoke-test.ps1                 # verify all services (after start-dev.ps1)
.\start-dev.ps1 -SmokeTest       # start + run smoke test
```

**Do not** put your home IP in `frontend/.env` before pushing to Git. Leave `VITE_PUBLIC_ORIGIN` empty in the repo; `start-dev.ps1` sets it on each machine.

If students’ phones cannot connect, run `.\open-firewall.ps1` as Administrator.

## Project structure

```
sketch-to-life/
├── frontend/        React app (viewer, camera, print UI, AR tab)
├── backend/         3D generation API (Meshy) — requirements.txt inside
├── print-service/   Print service (Bambu / OrcaSlicer) — requirements.txt inside
├── ar/              AR documentation (code lives in frontend/)
├── setup.ps1        One-time install
├── start-dev.ps1    Start all services
├── smoke-test.ps1   Quick health check (all services must be running)
├── show-workshop-qr.ps1  Print phone URL / optional QR PNG for slides
└── requirements-global.txt   System tools to install first
```

## Manual start (if needed)

**3D generation backend:**

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

**Print service:**

```powershell
cd print-service
.\.venv\Scripts\Activate.ps1
python run.py
```

**Frontend:**

```powershell
cd frontend
npm run dev
```

## Troubleshooting

**Phone cannot load the app**

- Phone on the PC hotspot (not Eduroam)?
- Hotspot on before `start-dev.ps1`?
- URL includes port `:5173`?
- Windows Firewall allows ports 5173, 8000, 3005?

**3D generation fails**

- `API_KEY` set in `backend/.env`?
- PC has internet (Eduroam)?

**Print button fails**

- Print service running on port 3005?
- `MOCK_PRINTER=true` in `print-service/.env` for testing without a printer

## Public deployment (Vercel + Railway)

The workshop app can also run on the internet so attendees use their own phones
without a local network. Frontend on **Vercel**, backend on **Railway**.

**Railway (backend)** — root directory `backend`. Build and start command come
from `backend/railway.json`; Python is pinned by `backend/.python-version`.

| Setting | Value |
| --- | --- |
| Volume mount | `/data` |
| `STORAGE_DIR` | `/data` |
| `API_KEY` | Meshy key |
| `ADMIN_PASSWORD` | password for `/admin` |
| `SECRET_KEY` | long random string (signs login tokens) |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` |
| `CORS_ORIGIN_REGEX` | `https://.*\.vercel\.app` (preview deployments) |
| `TARGET_POLYCOUNT` | `50000` |

Two rules that break the app if ignored:

- **A volume is mandatory.** The container filesystem is wiped on every deploy;
  without `STORAGE_DIR` on a mounted volume, all models and workshops are lost.
- **Keep it at one replica.** The in-memory job list and the SQLite database
  (`app.db` on the volume) both assume a single process.

**Vercel (frontend)** — root directory `frontend`, Vite preset. Set for both
Production and Preview:

- `VITE_API_URL` — the Railway URL
- `VITE_KI_PUBLIC_URL` — the same Railway URL. Without it, AR breaks
  specifically: model links fall back to the Vercel origin and 404.

`frontend/vercel.json` rewrites unknown paths to `index.html` so `/login`,
`/admin` and `/viewer?job=…` survive a reload. Real files in `frontend/public/`
(including `ar.html`) still serve directly.

The print service is **not** deployed — printing stays manual: the admin
downloads the 3MF plus the attendee's saved colour and slices locally.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

- frontend — `npm run lint` (non-blocking for now, see below) and `npm run build`
- backend — `pytest` over `backend/tests/`, which covers the workshop access
  rules (login, per-attendee isolation, generation cap, read-only freeze,
  admin-only delete). No Meshy key needed: every check fires before an API call,
  so CI costs no credits.

Lint is set to `continue-on-error` because of pre-existing violations from
before the workshop rework. Once those are cleaned up, drop that line so lint
blocks like the rest.

Run the tests locally with:

```bash
cd backend
./.venv/bin/python -m pytest -q
```

## More details

- `backend/README.md` — 3D generation backend
- `print-service/README.md` — print service
- `ar/README.md` — AR module
- `frontend/README.md` — web app
