# Internal storage (Sketch2Life)

Files are organized by type:

```
storage/
├── index.json          Manifest of all generations
├── sketches/           2D photos (camera / upload)
│   └── {job_id}.jpg
├── models/             3D models for viewer & AR
│   └── {job_id}.glb
├── print/              Print workflow
│   ├── {job_id}.3mf
│   └── {job_id}.farbauswahl.json
└── meta/               Job metadata
    └── {job_id}.meta.json
```

On backend startup, any legacy flat files in `storage/` root are moved into these folders automatically.
