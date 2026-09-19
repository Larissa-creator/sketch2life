import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { backFromViewerTab, backToProjects } from "../utils/viewerNav";
import PageHeader from "../components/PageHeader";
import ModelARViewer from "../components/ModelARViewer";
import ARSharePanel from "../components/ARSharePanel";
import SketchLightbox from "../components/SketchLightbox";
import SketchImage from "../components/SketchImage";
import ViewerFooter from "../components/ViewerFooter";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import { useHydrateViewerJob } from "../hooks/useHydrateViewerJob";
import { isMobile } from "../utils/device";
import { collectSketchCandidates } from "../utils/sketchSrc";
import "../styles/ViewerPage.css";
import "../styles/ARPage.css";
import "../styles/SketchLightbox.css";

function ARPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { modelUrl, jobId, imageUrl } = useSketch();
  const { jobs } = useGeneration();
  const { hydrated, effectiveJobId } = useHydrateViewerJob();
  const hasModel = Boolean(modelUrl || effectiveJobId);
  const mobile = isMobile();
  const [showSketch, setShowSketch] = useState(false);

  const sketchCandidates = useMemo(
    () =>
      collectSketchCandidates({
        jobId: jobId ?? effectiveJobId,
        imageUrl,
        jobs,
      }),
    [jobs, jobId, effectiveJobId, imageUrl],
  );

  const handleBack = () => {
    if (location.search.includes("job=")) {
      backFromViewerTab(navigate, location);
      return;
    }
    backToProjects(navigate, location);
  };

  return (
    <div className="viewer-page">
      <PageHeader title="AR View" onBack={handleBack} />

      <div className="page-body page-body--with-footer">
        {!hydrated ? (
          <p className="hint">Loading model...</p>
        ) : (
          <ModelARViewer
            src={modelUrl}
            jobId={jobId ?? effectiveJobId}
            mobileArMode={mobile}
            useFallback={false}
          />
        )}

        {!mobile && hasModel && (
          <ARSharePanel jobId={jobId ?? effectiveJobId} modelUrl={modelUrl} />
        )}

        {sketchCandidates.length > 0 && (
          <button
            type="button"
            className="viewer-sketch-thumb viewer-sketch-thumb--compact viewer-sketch-thumb--clickable"
            onClick={() => setShowSketch(true)}
            aria-label="Open original sketch"
          >
            <SketchImage candidates={sketchCandidates} alt="Original sketch" />
            <span>
              Original sketch
              <span className="viewer-sketch-hint">Tap to enlarge</span>
            </span>
          </button>
        )}
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

export default ARPage;
