import { getGlbDownloadUrl, getThreeMfDownloadUrl } from "../services/api";

export function resolveBackTarget(location, searchParams, fallback = "/projects") {
  const fromUrl = searchParams.get("back");
  const fromState = location.state?.backTo;
  if (fromState) return fromState;
  if (fromUrl) return fromUrl;
  // Phone opened ?job=… without history — always go to projects, not browser back
  if (searchParams.get("job")) return "/projects";
  return fallback;
}

export function openViewer(
  navigate,
  {
    jobId,
    backTo = "/projects",
    imageUrl = null,
    imageSource = "upload",
    modelUrl = null,
    threeMfUrl = null,
    setImage,
    setModel,
  },
) {
  if (!jobId) return;

  const sketchUrl = imageUrl;
  if (sketchUrl && setImage) {
    setImage(sketchUrl, imageSource);
  }

  const resolvedModel = modelUrl ?? getGlbDownloadUrl(jobId);
  const resolvedPrint = threeMfUrl ?? getThreeMfDownloadUrl(jobId);
  if (setModel) {
    setModel(jobId, resolvedModel, resolvedPrint);
  }

  const params = new URLSearchParams();
  params.set("job", jobId);
  if (backTo) params.set("back", backTo);

  navigate(`/viewer?${params.toString()}`, {
    replace: true,
    state: { backTo, jobId },
  });
}

export function openLoading(navigate, generationId) {
  navigate(`/loading?gen=${encodeURIComponent(generationId)}`, {
    replace: true,
    state: { generationId },
  });
}
