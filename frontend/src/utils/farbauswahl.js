import { HAUTFARBE, MAX_FARBEN, FARBEN, ALL_TEILE, PRINT_MODEL_COLORS } from "../constants/farbauswahl";

function resolveDruckLabel(teil) {
  const part = ALL_TEILE.find((t) => t.label === teil);
  return part?.druckLabel ?? teil;
}

function toDruckFarben(farben) {
  return farben.slice(0, MAX_FARBEN).map(({ teil, farbe }) => ({
    teil: resolveDruckLabel(teil),
    farbe,
  }));
}

export function buildKiFarbauswahl(farben) {
  return {
    figur: "benutzer_auswahl",
    farben: toDruckFarben(farben),
    max_farben: MAX_FARBEN,
    restfarbe: HAUTFARBE,
  };
}

export function buildColorPreview(farben) {
  return {
    farben: farben.slice(0, MAX_FARBEN),
    hautfarbe: HAUTFARBE,
  };
}

export function getFarbeSwatch(label) {
  return FARBEN.find((f) => f.label === label)?.swatch ?? "#d4d4d4";
}

/** Textdatei für die 3D-Druck-Gruppe. */
export function buildFarbauswahlTxt(objektId, farben) {
  const ki = buildKiFarbauswahl(farben);
  const lines = [`objekt_id: ${objektId}`, `restfarbe: ${ki.restfarbe}`];
  if (ki.farben.length === 0) {
    lines.push("modus: einfarbig");
  } else {
    const { teil, farbe } = ki.farben[0];
    lines.push(`teil: ${teil}`, `farbe: ${farbe}`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildPrintGroupJson(objectId, selectedColor) {
  return {
    object_id: objectId,
    selectedColor: selectedColor,
  };
}

function printColorLabel(selectedColor) {
  const entry = PRINT_MODEL_COLORS.find((c) => c.id === selectedColor);
  return entry?.label ?? selectedColor;
}

/** Mapping für den Druck-Server (Legacy-Format). */
export function buildDruckPayloadFromColor(objectId, selectedColor) {
  const label = printColorLabel(selectedColor);
  if (selectedColor === "white") {
    return {
      objekt_id: objectId,
      farben: [],
      restfarbe: "White",
      farbe_text: `object_id: ${objectId}\nmodus: einfarbig\nrestfarbe: White\n`,
    };
  }
  return {
    objekt_id: objectId,
    farben: [{ teil: "Body", farbe: label }],
    restfarbe: "White",
    farbe_text: `object_id: ${objectId}\nfarbe: ${label}\n`,
  };
}

export function downloadPrintGroupJson(objectId, selectedColor) {
  const data = buildPrintGroupJson(objectId, selectedColor);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "farbauswahl.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Legacy part-based selection */
export function buildDruckPayload(objektId, farben) {
  const ki = buildKiFarbauswahl(farben);
  return {
    objekt_id: objektId,
    farben: ki.farben,
    restfarbe: ki.restfarbe,
    farbe_text: buildFarbauswahlTxt(objektId, farben),
  };
}
