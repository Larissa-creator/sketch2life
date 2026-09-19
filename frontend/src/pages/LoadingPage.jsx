import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import ProgressBar from "../components/ProgressBar";
import SketchImage from "../components/SketchImage";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import { DEMO_SKETCH, getSketchThumbUrl } from "../services/api";
import { openViewer } from "../utils/navigation";
import "../styles/ProjectsPage.css";

function resolveGenerationId(searchParams, locationState) {
  return (
    locationState?.generationId ??
    searchParams.get("gen") ??
    searchParams.get("gen-id") ??
    null
  );
}

function LoadingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const generationId = resolveGenerationId(searchParams, location.state);
  const { setImage, setModel, clearAll } = useSketch();
  const { jobs, activeCount } = useGeneration();

  const job = useMemo(
    () => (generationId ? jobs.find((entry) => entry.id === generationId) ?? null : null),
    [generationId, jobs],
  );

  const sketchPreview = useMemo(() => {
    if (!job) return null;
    if (job.thumb) return job.thumb;
    if (job.imageUrl) return job.imageUrl;
    if (job.imageSource === "demo") return DEMO_SKETCH;
    if (job.jobId) return getSketchThumbUrl(job.jobId);
    return null;
  }, [job]);

  const leaveLoading = (target = "/projects") => {
    if (job?.imageSource === "demo") clearAll();
    navigate(target, { replace: true });
  };

  useEffect(() => {
    if (!generationId) {
      navigate("/", { replace: true });
    }
  }, [generationId, navigate]);

  useEffect(() => {
    if (!generationId || job) return undefined;

    const timeout = window.setTimeout(() => {
      navigate("/projects", { replace: true });
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [generationId, job, navigate]);

  useEffect(() => {
    if (!job) return;

    if (job.status === "done") {
      const sketchUrl =
        job.thumb ?? job.imageUrl ?? (job.jobId ? getSketchThumbUrl(job.jobId) : null);
      openViewer(navigate, {
        jobId: job.jobId,
        backTo: "/projects",
        imageUrl: sketchUrl ?? (job.imageSource === "demo" ? DEMO_SKETCH : null),
        imageSource: job.imageSource ?? "upload",
        modelUrl: job.modelUrl,
        threeMfUrl: job.threeMfUrl,
        setImage,
        setModel,
      });
      return;
    }

    if (job.status === "failed") {
      const path =
        job.failReason === "timeout"
          ? "/error/timeout"
          : job.failReason === "network"
            ? "/error/network"
            : job.failReason === "invalid-image"
              ? "/error/invalid-image"
              : job.failReason === "no-api-key"
                ? "/error/generation"
                : "/error/generation";
      navigate(path, {
        replace: true,
        state:
          job.failReason === "no-api-key" ? { reason: "no-api-key" } : undefined,
      });
    }
  }, [
    job,
    job?.status,
    job?.jobId,
    job?.modelUrl,
    job?.threeMfUrl,
    job?.failReason,
    job?.thumb,
    job?.imageUrl,
    job?.imageSource,
    navigate,
    setImage,
    setModel,
  ]);

  const otherActive = Math.max(
    0,
    activeCount - (job?.status === "processing" || job?.status === "starting" ? 1 : 0),
  );

  const estimatedSec = job?.imageSource === "demo" ? 5 : 180;

  return (
    <>
      <PageHeader
        title="Creating 3D model"
        onBack={() => leaveLoading("/projects")}
      />

      <div className="page-body page-body--center loading-body">
        {sketchPreview && (
          <div className="loading-sketch-preview" aria-label="Your sketch">
            <SketchImage candidates={[sketchPreview]} alt="Your sketch" />
          </div>
        )}

        {job ? (
          <ProgressBar
            progress={job.progress}
            message={job.message}
            estimatedTotalSec={estimatedSec}
          />
        ) : (
            <p className="hint">Starting generation...</p>
        )}

        {otherActive > 0 && (
          <p className="hint loading-other-jobs">
            +{otherActive} more generation{otherActive > 1 ? "s" : ""} running in background
          </p>
        )}
      </div>
    </>
  );
}

export default LoadingPage;
