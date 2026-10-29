import { useEffect, useMemo, useState } from "react";
import { useGeneration } from "../context/GenerationContext";
import { fetchJobPrompt } from "../services/api";
import { getProjectByJobId } from "../utils/projects";

const PROMPT_PREVIEW_MAX = 100;

/** Prompt für die Anzeige im Viewer/AR, gekürzt auf 100 Zeichen. */
export function shortenPrompt(prompt) {
  if (!prompt || prompt.length <= PROMPT_PREVIEW_MAX) return prompt;
  return `${prompt.slice(0, PROMPT_PREVIEW_MAX).trimEnd()}…`;
}

/**
 * Text-Prompt eines Text-to-3D-Jobs (null bei Skizzen-Jobs). Lokal bekannt aus
 * der laufenden Session/localStorage, sonst (z. B. per QR geöffnet) vom Server.
 */
export function useJobPrompt(jobId) {
  const { jobs } = useGeneration();
  const [serverPrompt, setServerPrompt] = useState(null);

  const localPrompt = useMemo(
    () =>
      jobs.find((job) => job.jobId === jobId)?.prompt ??
      getProjectByJobId(jobId)?.prompt ??
      null,
    [jobs, jobId],
  );

  useEffect(() => {
    if (localPrompt || !jobId) return undefined;
    let cancelled = false;
    fetchJobPrompt(jobId).then((prompt) => {
      if (!cancelled) setServerPrompt(prompt);
    });
    return () => {
      cancelled = true;
    };
  }, [localPrompt, jobId]);

  return localPrompt ?? serverPrompt;
}
