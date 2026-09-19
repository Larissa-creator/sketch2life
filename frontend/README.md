# Frontend

React + Vite web app: camera, upload, 3D viewer, AR view, and print colour selection.

## Setup

```powershell
cd frontend
npm install
```

Or run `.\setup.ps1` from the project root.

## Start

```powershell
npm run dev
```

App: http://localhost:5173

In a workshop, use `.\start-dev.ps1` from the project root — it sets the LAN URL for the QR code automatically.

## Requirements

See `package.json`. Main dependencies:

- React, React Router
- Vite
- axios
- `@google/model-viewer` (3D viewer and AR)
- qrcode

## Environment

Copy `.env.example` to `.env` if you start the frontend manually. For workshops, `start-dev.ps1` sets `VITE_PUBLIC_ORIGIN` and `VITE_KI_PUBLIC_URL` for you.

## Dev proxies

During development, Vite proxies:

- `/ki-api` → 3D generation backend (port 8000)
- `/print-api` → print service (port 3005)

This lets phones reach all services through port 5173.
