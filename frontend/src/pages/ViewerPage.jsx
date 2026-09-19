import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import ViewerFooter from "../components/ViewerFooter";
import ViewerModelPanel from "../components/ViewerModelPanel";
import SketchLightbox from "../components/SketchLightbox";
import SketchImage from "../components/SketchImage";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import { useHydrateViewerJob } from "../hooks/useHydrateViewerJob";
import { getARPlatformInfo } from "../utils/device";
import { resolveModelSrc } from "../utils/ar";
import {
  getGlbDownloadUrl,
  modelFilename,
} from "../services/api";
import { downloadFile } from "../utils/download";
import { collectSketchCandidates } from "../utils/sketchSrc";
import { resolveBackTarget } from "../utils/navigation";
import { goToViewerTab } from "../utils/viewerNav";
import "../styles/ViewerPage.css";
import "../styles/SketchLightbox.css";

function ViewerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const backTarget = resolveBackTarget(location, searchParams, "/projects");
  const { imageUrl, modelUrl, imageSource, clearAll } = useSketch();
  const { jobs } = useGeneration();
  const { hydrated, effectiveJobId } = useHydrateViewerJob();
  const [showSketch, setShowSketch] = useState(false);

  const sketchCandidates = useMemo(
    () => collectSketchCandidates({ jobId: effectiveJobId, imageUrl, jobs }),
    [jobs, effectiveJobId, imageUrl],
  );
  const src = resolveModelSrc(modelUrl, effectiveJobId);
  const ar = getARPlatformInfo();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const onDownload = async () => {
    const url = getGlbDownloadUrl(effectiveJobId) ?? src;
    if (!url) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadFile(url, modelFilename(effectiveJobId, "glb"));
    } catch {
      setDownloadError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleBack = () => {
    if (imageSource === "demo" && backTarget === "/") {
      clearAll();
    }
    navigate(backTarget, { replace: true });
  };

  if (!hydrated) {
    return (
      <div className="viewer-page">
        <PageHeader title="3D Model Viewer" onBack={handleBack} />
        <div className="page-body page-body--center">
          <p className="hint">Loading model...</p>
        </div>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="viewer-page">
        <PageHeader title="3D Model Viewer" onBack={handleBack} />
        <div className="page-body page-body--center viewer-empty">
          <p className="hint">No 3D model loaded.</p>
          <p className="hint">Open Last Projects and pick a model from the server.</p>
          <div className="viewer-empty-actions">
            <PrimaryButton
              text="View projects"
              onClick={() => navigate("/projects", { replace: true })}
            />
            <PrimaryButton
              text="New sketch"
              variant="secondary"
              onClick={() => navigate("/camera", { replace: true })}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-page">
      <PageHeader title="3D Model Viewer" onBack={handleBack} />

      <div className="page-body page-body--with-footer">
        <ViewerModelPanel src={src} />

        <p className="hint viewer-controls-hint">
          Rotate and zoom with buttons or touch gestures.
        </p>

        {sketchCandidates.length > 0 && (
          <button
            type="button"
            className="viewer-sketch-thumb viewer-sketch-thumb--clickable"
            onClick={() => setShowSketch(true)}
            aria-label="Enlarge original sketch"
          >
            <SketchImage candidates={sketchCandidates} alt="Original sketch" />
            <span>
              Original sketch
              <span className="viewer-sketch-hint">Tap to enlarge</span>
            </span>
          </button>
        )}

        <div className="viewer-actions">
          <PrimaryButton
            text="Open AR View"
            onClick={() => goToViewerTab(navigate, location, "/ar")}
          />
          <p className="hint viewer-ar-hint">
            {ar.platform === "desktop" && "Best tested on a phone"}
          </p>
          <PrimaryButton
            text={downloading ? "Downloading..." : "Download GLB"}
            disabled={downloading}
            onClick={onDownload}
          />
          {downloadError && <p className="hint viewer-download-error">{downloadError}</p>}
        </div>
      </div>

      {showSketch && sketchCandidates.length > 0 && (
        <SketchLightbox
          candidates={sketchCandidates}
          alt="Original sketch"
          onClose={() => setShowSketch(false)}
        />
      )}

      <ViewerFooter />
    </div>
  );
}

export default ViewerPage;
