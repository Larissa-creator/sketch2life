import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import SketchImage from "../components/SketchImage";
import { useAuth } from "../context/AuthContext";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import { getSketchThumbUrl, hasLiveApi } from "../services/api";
import { imageUrlToFile } from "../utils/image";
import { openLoading } from "../utils/navigation";
import { resolveSketchSrc } from "../utils/sketchSrc";
import "../styles/ProjectsPage.css";

function ProjectSketchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");
  const { canGenerate } = useAuth();
  const { setImage } = useSketch();
  const { jobs, startGeneration } = useGeneration();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sketchUrl = jobId
    ? resolveSketchSrc({ jobId, imageUrl: null, jobs })
    : null;

  useEffect(() => {
    if (!jobId) {
      navigate("/projects", { replace: true });
    }
  }, [jobId, navigate]);

  if (!jobId) return null;

  const onGenerate = async () => {
    setError("");
    setBusy(true);
    try {
      if (!hasLiveApi()) {
        setError("3D server not reachable. Start the app on the presenter PC.");
        return;
      }

      const url = sketchUrl ?? getSketchThumbUrl(jobId);
      if (!url) {
        setError("Original sketch not found on the server.");
        return;
      }

      const file = await imageUrlToFile(url, "sketch.jpg");
      if (!file) {
        setError("Could not load the sketch. Check your network connection.");
        return;
      }

      setImage(url, "upload", file);
      const generationId = startGeneration({
        imageUrl: url,
        imageFile: file,
        imageSource: "upload",
        existingJobId: jobId,
      });

      if (!generationId) {
        setError("Too many generations running. Wait a moment and try again.");
        return;
      }

      openLoading(navigate, generationId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Your sketch"
        onBack={() => navigate("/projects", { replace: true })}
      />

      <div className="page-body project-sketch-body">
        <div className="image-frame image-frame--filled project-sketch-frame">
          {sketchUrl ? (
            <SketchImage candidates={[sketchUrl]} alt="Your sketch" />
          ) : (
            <p className="hint">Loading sketch...</p>
          )}
        </div>

        <p className="hint project-sketch-hint">
          {canGenerate
            ? "This 2D image is saved on the server. No 3D model yet — you can generate one now."
            : "This 2D image is saved on the server. The workshop has ended, so no new 3D models can be generated."}
        </p>

        {error && <p className="hint preview-error-hint">{error}</p>}

        <div className="project-sketch-actions">
          {canGenerate && (
            <PrimaryButton
              text={busy ? "Starting..." : "Generate 3D object"}
              disabled={busy || !sketchUrl}
              onClick={onGenerate}
            />
          )}
          <PrimaryButton
            text="Back to projects"
            variant="secondary"
            disabled={busy}
            onClick={() => navigate("/projects", { replace: true })}
          />
        </div>
      </div>
    </>
  );
}

export default ProjectSketchPage;
