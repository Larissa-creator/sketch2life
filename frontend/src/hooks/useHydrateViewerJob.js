import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSketch } from "../context/SketchContext";
import { getProvidedProject } from "../utils/curatedProjects";
import {
  getGlbDownloadUrl,
  getSketchThumbUrl,
  getThreeMfDownloadUrl,
} from "../services/api";

/** Load model from URL ?job=… (needed when phone opens a link from the presenter PC). */
export function useHydrateViewerJob() {
  const [searchParams] = useSearchParams();
  const urlJobId = searchParams.get("job");
  const { jobId, modelUrl, setImage, setModel } = useSketch();
  const [hydrated, setHydrated] = useState(!urlJobId);

  useEffect(() => {
    if (!urlJobId) {
      setHydrated(true);
      return;
    }

    if (jobId === urlJobId && modelUrl) {
      setHydrated(true);
      return;
    }

    const provided = getProvidedProject(urlJobId);
    if (provided) {
      setImage(provided.thumb, provided.imageSource);
      setModel(provided.jobId, provided.modelUrl, provided.threeMfUrl);
      setHydrated(true);
      return;
    }

    const sketchUrl = getSketchThumbUrl(urlJobId);
    if (sketchUrl) {
      setImage(sketchUrl, "upload");
    }
    setModel(
      urlJobId,
      getGlbDownloadUrl(urlJobId),
      getThreeMfDownloadUrl(urlJobId),
    );
    setHydrated(true);
  }, [urlJobId, jobId, modelUrl, setImage, setModel]);

  return {
    urlJobId,
    hydrated,
    effectiveJobId: jobId ?? urlJobId,
  };
}
