import { DEMO_JOB_ID, DEMO_SKETCH, getSketchThumbUrl } from "../services/api";
import { getProjectByJobId } from "./projects";

/**
 * URLs zum Laden der Skizze (erste funktionierende wird verwendet).
 */
export function collectSketchCandidates({ jobId, imageUrl, jobs = [] }) {
  const genJob = jobId ? jobs.find((job) => job.jobId === jobId) : null;
  const project = jobId ? getProjectByJobId(jobId) : null;
  const serverSketch =
    jobId && jobId !== DEMO_JOB_ID ? getSketchThumbUrl(jobId) : null;

  const seen = new Set();
  const candidates = [];

  const push = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  push(genJob?.thumb);
  push(genJob?.imageUrl);
  push(project?.thumb);
  push(imageUrl);
  push(serverSketch);
  if (jobId === DEMO_JOB_ID) push(DEMO_SKETCH);

  return candidates;
}

export function resolveSketchSrc(options) {
  return collectSketchCandidates(options)[0] ?? null;
}
