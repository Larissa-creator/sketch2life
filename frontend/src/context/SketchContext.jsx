import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { imageUrlToPersistableSketch } from "../utils/image";

const SketchContext = createContext(null);

const SKETCH_STORAGE_KEY = "sketch2life-sketch";

function readStoredSketch() {
  try {
    const raw = sessionStorage.getItem(SKETCH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.imageUrl ? data : null;
  } catch {
    return null;
  }
}

function writeStoredSketch(imageUrl, imageSource) {
  try {
    sessionStorage.setItem(
      SKETCH_STORAGE_KEY,
      JSON.stringify({ imageUrl, imageSource }),
    );
  } catch {
    /* Kein Speicherplatz: Persistenz ist nur ein Sicherheitsnetz. */
  }
}

function clearStoredSketch() {
  try {
    sessionStorage.removeItem(SKETCH_STORAGE_KEY);
  } catch {
    /* siehe oben */
  }
}

export function SketchProvider({ children }) {
  // Nach einem Reload (Android-Kamera-App) den gesicherten Sketch zurückholen.
  const [restored] = useState(readStoredSketch);

  const [imageUrl, setImageUrlState] = useState(restored?.imageUrl ?? null);
  const [imageFile, setImageFile] = useState(null);
  const [imageSource, setImageSource] = useState(restored?.imageSource ?? null);
  const [jobId, setJobIdState] = useState(null);
  const [modelUrl, setModelUrlState] = useState(null);
  const [printModelUrl, setPrintModelUrlState] = useState(null);
  const [selectedPrintColor, setSelectedPrintColorState] = useState("white");

  const setImage = useCallback((url, source, file = null) => {
    setImageUrlState((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
    setImageFile(file);
    setImageSource(source);

    // Nur frisch aufgenommene/hochgeladene Bilder sichern - Server-Sketches
    // lassen sich jederzeit über die job_id nachladen.
    if (url?.startsWith("blob:") || url?.startsWith("data:")) {
      imageUrlToPersistableSketch(url).then((dataUrl) => {
        if (dataUrl) writeStoredSketch(dataUrl, source);
      });
    } else {
      clearStoredSketch();
    }
  }, []);

  const setModel = useCallback((id, url, printUrl = null) => {
    setJobIdState(id);
    setModelUrlState(url);
    setPrintModelUrlState(printUrl);
  }, []);

  const setSelectedPrintColor = useCallback((color) => {
    setSelectedPrintColorState(color);
  }, []);

  const clearAll = useCallback(() => {
    clearStoredSketch();
    setImageUrlState((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
    setImageSource(null);
    setJobIdState(null);
    setModelUrlState(null);
    setPrintModelUrlState(null);
    setSelectedPrintColorState("white");
  }, []);

  const value = useMemo(
    () => ({
      imageUrl,
      imageFile,
      imageSource,
      jobId,
      modelUrl,
      printModelUrl,
      selectedPrintColor,
      setImage,
      setModel,
      setSelectedPrintColor,
      clearAll,
    }),
    [
      imageUrl,
      imageFile,
      imageSource,
      jobId,
      modelUrl,
      printModelUrl,
      selectedPrintColor,
      setImage,
      setModel,
      setSelectedPrintColor,
      clearAll,
    ],
  );

  return (
    <SketchContext.Provider value={value}>{children}</SketchContext.Provider>
  );
}

export function useSketch() {
  const ctx = useContext(SketchContext);
  if (!ctx) throw new Error("useSketch must be used inside SketchProvider");
  return ctx;
}
