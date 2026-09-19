import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  generateDemo3DModel,
  regenerate3DFromJob,
  start3DConversion,
  watch3DJob,
} from "../services/api";
import { imageUrlToPersistableThumb } from "../utils/image";
import { createId } from "../utils/id";
import { saveProject } from "../utils/projects";

const GenerationContext = createContext(null);
const MAX_JOBS = 5;

function createJob({ imageUrl, imageSource, thumb }) {
  return {
    id: createId(),
    jobId: null,
    status: "starting",
    progress: 0,
    message: "Starting…",
    failReason: null,
    imageUrl,
    imageSource: imageSource ?? null,
    thumb,
    modelUrl: null,
    threeMfUrl: null,
    createdAt: new Date().toISOString(),
  };
}

export function GenerationProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const patchJob = useCallback((id, patch) => {
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== id) return job;
        const nextPatch = typeof patch === "function" ? patch(job) : patch;
        return { ...job, ...nextPatch };
      }),
    );
  }, []);

  const runJob = useCallback(
    async (id, imageUrl, imageFile, imageSource, existingJobId = null) => {
      const onProgress = (progress, message) => {
        patchJob(id, (job) => ({
          status: "processing",
          progress: Math.max(job?.progress ?? 0, progress),
          message,
        }));
      };

      const finish = (result) => {
        if (result.ok) {
          patchJob(id, {
            jobId: result.jobId,
            status: "done",
            progress: 100,
            message: "Model ready!",
            modelUrl: result.modelUrl,
            threeMfUrl: result.threeMfUrl ?? null,
            failReason: null,
          });
          if (result.jobId && imageSource !== "demo") {
            const current = jobsRef.current.find((j) => j.id === id);
            saveProject({
              jobId: result.jobId,
              imageUrl: current?.thumb ?? current?.imageUrl ?? imageUrl,
              imageSource,
            });
          }
          return;
        }

        patchJob(id, {
          status: "failed",
          progress: 0,
          message: "Failed",
          failReason: result.reason ?? "generation",
        });
      };

      try {
        if (imageSource === "demo") {
          const result = await generateDemo3DModel(imageUrl, imageFile, onProgress);
          finish(result);
          return;
        }

        if (existingJobId) {
          const start = await regenerate3DFromJob(existingJobId, onProgress);
          if (!start.ok) {
            finish({ ok: false, reason: start.reason ?? "generation" });
            return;
          }

          patchJob(id, {
            jobId: existingJobId,
            status: "processing",
          });

          const result = await watch3DJob(existingJobId, onProgress);
          finish(result);
          return;
        }

        const start = await start3DConversion(imageUrl, imageFile, onProgress);
        if (!start.ok) {
          finish({ ok: false, reason: start.reason ?? "generation" });
          return;
        }

        patchJob(id, {
          jobId: start.jobId,
          status: "processing",
        });

        const result = await watch3DJob(start.jobId, onProgress);
        finish(result);
      } catch {
        finish({ ok: false, reason: "network" });
      }
    },
    [patchJob],
  );

  const startGeneration = useCallback(
    ({ imageUrl, imageFile, imageSource, existingJobId = null }) => {
      const active = jobsRef.current.filter(
        (job) => job.status === "starting" || job.status === "processing",
      );
      if (active.length >= MAX_JOBS) {
        return null;
      }

      const thumb =
        imageUrl?.startsWith("data:") || imageUrl?.startsWith("/")
          ? imageUrl
          : null;
      const job = createJob({ imageUrl, imageSource, thumb });
      if (existingJobId) {
        job.jobId = existingJobId;
      }
      setJobs((prev) => [job, ...prev].slice(0, MAX_JOBS));
      if (imageUrl && !thumb && !imageUrl.startsWith("/")) {
        imageUrlToPersistableThumb(imageUrl).then((persisted) => {
          if (persisted) patchJob(job.id, { thumb: persisted });
        });
      }
      runJob(job.id, imageUrl, imageFile, imageSource, existingJobId);
      return job.id;
    },
    [patchJob, runJob],
  );

  const getJob = useCallback(
    (id) => jobs.find((job) => job.id === id) ?? null,
    [jobs],
  );

  const removeJob = useCallback((idOrJobId) => {
    if (!idOrJobId) return;
    setJobs((prev) =>
      prev.filter((job) => job.id !== idOrJobId && job.jobId !== idOrJobId),
    );
  }, []);

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "starting" || job.status === "processing",
      ),
    [jobs],
  );

  const value = useMemo(
    () => ({
      jobs,
      activeJobs,
      activeCount: activeJobs.length,
      startGeneration,
      getJob,
      removeJob,
    }),
    [jobs, activeJobs, startGeneration, getJob, removeJob],
  );

  return (
    <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) {
    throw new Error("useGeneration must be used inside GenerationProvider");
  }
  return ctx;
}
