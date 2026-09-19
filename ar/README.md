# AR Module (Augmented Reality)

AR is built into the frontend. There is no separate AR server.

## What it does

- In-app route: `/ar` (React page with `@google/model-viewer`)
- Standalone page for phones and headsets: `frontend/public/ar.html`
- Share links and QR codes point to the standalone page with a GLB model URL

## Requirements

Install via the frontend (see `frontend/package.json`):

- `@google/model-viewer` — 3D model display and AR Quick Look / Scene Viewer
- React app dependencies (installed with `npm install` in `frontend/`)

Run `.\setup.ps1` from the project root to install everything.

## Files

| Path | Purpose |
|------|---------|
| `frontend/src/pages/ARPage.jsx` | AR tab in the app |
| `frontend/src/components/ModelARViewer.jsx` | 3D viewer component |
| `frontend/public/ar.html` | Standalone AR page (opened from share links) |
| `frontend/src/utils/ar.js` | Model URL helpers |

## Workshop note

Phones must be on the same network as the PC (Windows hotspot). The QR code in the app opens the frontend URL, not a separate AR service.
