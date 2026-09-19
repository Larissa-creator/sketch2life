/** Personen, Tiere, Figuren */
export const FIGUR_TEILE = [
  {
    id: 1,
    label: "Body",
    hint: "Main body, fur, skin",
    druckLabel: "Body",
  },
  {
    id: 2,
    label: "Face",
    hint: "Eyes, mouth, nose",
    druckLabel: "Face details",
  },
  { id: 3, label: "Hair", hint: "Hair, mane, head fur", druckLabel: "Hair" },
  { id: 4, label: "Clothes", hint: "Shirt, pants, costume", druckLabel: "Clothes" },
  {
    id: 5,
    label: "Accessories",
    hint: "Hat, shoes, jewelry",
    druckLabel: "Accessories",
  },
  {
    id: 6,
    label: "Base",
    hint: "Bottom, stand, ground",
    druckLabel: "Background parts",
  },
  {
    id: 7,
    label: "No colored parts",
    hint: "Single color (White)",
    monoOption: true,
  },
];

/** Blumen, Objekte ohne Gesicht */
export const OBJEKT_TEILE = [
  { id: 1, label: "Main part", hint: "e.g. flower, body, central shape" },
  { id: 2, label: "Details", hint: "e.g. patterns, small areas" },
  { id: 3, label: "Accent", hint: "highlighted area" },
  { id: 4, label: "Base / Edge", hint: "e.g. stem, underside, border" },
  { id: 5, label: "Background parts" },
  {
    id: 6,
    label: "No colored parts",
    hint: "Single color (White)",
    monoOption: true,
  },
];

export const TEIL_PRESETS = {
  figur: {
    id: "figur",
    title: "Character / Person / Animal",
    description: "Body, face, hair, clothes...",
    teile: FIGUR_TEILE,
  },
  objekt: {
    id: "objekt",
    title: "Object / Nature",
    description: "Flower, shape, item...",
    teile: OBJEKT_TEILE,
  },
};

export const ALL_TEILE = [...FIGUR_TEILE, ...OBJEKT_TEILE];

export const FARBEN = [
  { id: 1, label: "Black", swatch: "#1a1a1a" },
  { id: 2, label: "Blue", swatch: "#2563eb" },
  { id: 3, label: "Red", swatch: "#dc2626" },
  { id: 4, label: "Yellow", swatch: "#eab308" },
  { id: 5, label: "Green", swatch: "#16a34a" },
  { id: 6, label: "White", swatch: "#f5f5f5" },
];

/** Eine Farbe für das ganze Modell (3D-Druck-Gruppe / Celina). */
export const PRINT_MODEL_COLORS = [
  { id: "white", label: "White", swatch: "#f5f5f5" },
  { id: "black", label: "Black", swatch: "#1a1a1a" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "purple", label: "Purple", swatch: "#9333ea" },
  { id: "yellow", label: "Yellow", swatch: "#eab308" },
];

export const DEFAULT_PRINT_COLOR = "white";

export const MAX_FARBEN = 1;
export const HAUTFARBE = "White";
