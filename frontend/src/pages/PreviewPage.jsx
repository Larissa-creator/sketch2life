import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import { fetchApiHealth, hasLiveApi } from "../services/api";
import { prepareUploadFile } from "../utils/image";
import { openLoading } from "../utils/navigation";
import "../styles/ProjectsPage.css";

function PreviewPage() {
  const navigate = useNavigate();
  const { canGenerate } = useAuth();
  const { imageUrl, imageFile, imageSource, clearAll } = useSketch();
  const { startGeneration, activeCount } = useGeneration();
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [meshyReady, setMeshyReady] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!imageUrl) navigate("/", { replace: true });
  }, [imageUrl, navigate]);

  useEffect(() => {
    if (imageSource === "demo" || !hasLiveApi()) return undefined;
    let cancelled = false;
    fetchApiHealth().then((health) => {
      if (cancelled) return;
      if (!health?.ok) {
        setWarn(
          "Server check failed. Make sure backend and frontend are running.",
        );
        setMeshyReady(false);
        return;
      }
      if (!health.meshy_configured) {
        setMeshyReady(false);
        setError(
          "Meshy API key missing. On the PC, edit backend/.env and set API_KEY=your key, then restart the backend.",
        );
        return;
      }
      setMeshyReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [imageSource]);

  if (!imageUrl) return null;

  const retakePath =
    imageSource === "demo"
      ? "/"
      : imageSource === "camera"
        ? "/camera"
        : "/upload";

  const previewBackTo = retakePath;

  const leavePreview = () => {
    if (imageSource === "demo") clearAll();
    navigate(previewBackTo, { replace: true });
  };

  const beginGeneration = (file) => {
    let generationId;
    try {
      generationId = startGeneration({
        imageUrl,
        imageFile: file ?? null,
        imageSource,
      });
    } catch {
      setError("Could not start generation. Please reload and try again.");
      return;
    }

    if (!generationId) {
      navigate("/projects");
      return;
    }

    openLoading(navigate, generationId);
  };

  const onGenerate = async () => {
    setError("");
    setBusy(true);

    try {
      if (imageSource === "demo") {
        beginGeneration(imageFile);
        return;
      }

      if (!canGenerate) {
        setError(
          "The workshop has ended — new models can no longer be generated.",
        );
        return;
      }

      if (!hasLiveApi()) {
        setError(
          "Backend is not configured. Start backend on port 8000 and restart frontend.",
        );
        return;
      }

      if (meshyReady === false) {
        setError(
          "Meshy API key missing. On the PC, edit backend/.env and set API_KEY=your key, then restart the backend.",
        );
        return;
      }

      const file = await prepareUploadFile(imageUrl, imageFile);
      if (!file) {
        setError(
          "Could not read image. Please use 'Upload Image' (recommended on iPhone).",
        );
        return;
      }

      beginGeneration(file);
    } catch {
      setError("Image upload failed. Please use 'Upload Image'.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Image Preview" onBack={leavePreview} />

      <div className="page-body">
        <div className="image-frame image-frame--filled">
          <img src={imageUrl} alt="Your sketch" />
        </div>

        <p className="hint">
          {imageSource === "demo"
            ? "Demo cat sketch (built-in sample). No backend needed — 3D model in a few seconds."
            : "Use this image to generate a 3D model?"}
        </p>
        {activeCount > 0 && (
          <p className="hint preview-active-hint">
            {activeCount} generation{activeCount > 1 ? "s" : ""} already running. You can start more.
          </p>
        )}
        {warn && <p className="hint preview-warn-hint">{warn}</p>}
        {error && <p className="hint preview-error-hint">{error}</p>}

        <div className="button-stack">
          <PrimaryButton
            variant="secondary"
            text="Retake"
            disabled={busy}
            onClick={leavePreview}
          />
          <PrimaryButton
            text={
              busy
                ? "Starting..."
                : imageSource === "demo"
                  ? "Start Demo 3D"
                  : "Generate 3D"
            }
            disabled={busy || (imageSource !== "demo" && meshyReady === false)}
            onClick={onGenerate}
          />
        </div>
      </div>
    </>
  );
}

export default PreviewPage;
