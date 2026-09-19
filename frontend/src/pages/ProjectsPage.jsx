import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import ProjectThumb from "../components/ProjectThumb";
import { useAuth } from "../context/AuthContext";
import { useSketch } from "../context/SketchContext";
import { useGeneration } from "../context/GenerationContext";
import {
  checkApiHealth,
  deleteServerProject,
  getGlbDownloadUrl,
  getSketchThumbUrl,
  getThreeMfDownloadUrl,
  listServerProjects,
} from "../services/api";
import { listProvidedProjects } from "../utils/curatedProjects";
import { imageUrlToFile } from "../utils/image";
import { openLoading, openViewer } from "../utils/navigation";
import { resolveSketchSrc } from "../utils/sketchSrc";
import { getProjectByJobId, listProjects, removeProject } from "../utils/projects";
import "../styles/ProjectsPage.css";

function formatDisplayDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function projectReadyLabel(project) {
  if (project.source === "provided") return "3D ready · Sample";
  return `3D ready · ${formatDisplayDate(project.createdAt)}`;
}

function buildSketchName(createdAt, jobId) {
  const date = formatDisplayDate(createdAt);
  const suffix = jobId ? ` · ${jobId.slice(0, 8)}` : "";
  return `Sketch ${date}${suffix}`;
}

function statusLabel(status, progress) {
  if (status === "starting" || status === "processing") {
    return `Creating... ${progress}%`;
  }
  if (status === "failed") return "Failed — tap to retry 3D";
  return formatDisplayDate(new Date().toISOString());
}

function resolveThumb(project, serverEntry) {
  if (project.thumb) return project.thumb;
  if (project.imageUrl) return project.imageUrl;
  if (project.jobId) {
    const local = getProjectByJobId(project.jobId);
    if (local?.thumb) return local.thumb;
    return getSketchThumbUrl(project.jobId);
  }
  if (serverEntry?.has_sketch && project.jobId) {
    return getSketchThumbUrl(project.jobId);
  }
  return null;
}

function normalizeJobId(jobId) {
  if (!jobId) return null;
  let id = String(jobId).trim();
  if (id.endsWith(".meta.json")) id = id.slice(0, -".meta.json".length);
  if (id.endsWith(".meta")) id = id.slice(0, -".meta".length);
  return id || null;
}

function isValidProjectJobId(jobId) {
  const id = normalizeJobId(jobId);
  if (!id) return false;
  if (id.endsWith(".meta")) return false;
  return true;
}

function projectNeedsRegenerate(project) {
  if (project.needsRegenerate === true) return true;
  if (project.status === "sketch-only") return true;
  if (project.status === "failed" && project.jobId) return true;
  return Boolean(project.hasSketch && !project.hasGlb);
}

function ProjectList({
  projects,
  deletingKey,
  onOpen,
  onDelete,
  onRegenerate,
  allowDelete = true,
  allowRegenerate = true,
}) {
  if (projects.length === 0) return null;

  return (
    <ul className="projects-list">
      {projects.map((project) => {
        const isBusy = project.status === "starting" || project.status === "processing";
        const canDelete = allowDelete && project.canDelete !== false && !isBusy;
        const isDeleting = deletingKey === project.key;
        const needsRegenerate = projectNeedsRegenerate(project);
        const has3d = !needsRegenerate && project.status === "done";

        return (
          <li key={project.key} className="project-card-wrap">
            {canDelete && (
              <button
                type="button"
                className="project-delete"
                aria-label="Delete project"
                title="Delete project"
                disabled={isDeleting}
                onClick={(event) => onDelete(event, project)}
              >
                ×
              </button>
            )}
            <div
              className={[
                "project-card",
                isBusy ? "project-card--active" : "",
                project.status === "failed" ? "project-card--failed" : "",
                needsRegenerate ? "project-card--sketch-only" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="project-card-main"
                onClick={() => onOpen(project)}
                disabled={isDeleting || (isBusy && !project.generationId)}
              >
                <span className="project-thumb" aria-hidden>
                  <ProjectThumb
                    sketchUrl={project.thumb}
                    modelUrl={needsRegenerate ? null : project.modelUrl}
                  />
                </span>
                <div className="project-info">
                  <h2>{project.name}</h2>
                  <p>
                    {needsRegenerate
                      ? "2D sketch — no 3D model yet"
                      : isBusy
                        ? statusLabel(project.status, project.progress)
                        : has3d
                          ? projectReadyLabel(project)
                          : formatDisplayDate(project.createdAt)}
                  </p>
                  {project.description && (
                    <p className="project-description">{project.description}</p>
                  )}
                  {isBusy && (
                    <div className="project-progress-track">
                      <div
                        className="project-progress-fill"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </button>
              {needsRegenerate && allowRegenerate && (
                <button
                  type="button"
                  className="project-regenerate-btn"
                  disabled={isDeleting}
                  onClick={() => onRegenerate(project)}
                >
                  Generate 3D object
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const { role, canGenerate, isDemo } = useAuth();
  const { setImage, setModel } = useSketch();
  const { jobs, removeJob, startGeneration } = useGeneration();
  const mayGenerate = canGenerate || isDemo;
  const [serverProjects, setServerProjects] = useState([]);
  const [deletingKey, setDeletingKey] = useState(null);
  const [serverReachable, setServerReachable] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const providedProjects = useMemo(() => listProvidedProjects(), []);

  const refreshProjects = async () => {
    setRefreshing(true);
    try {
      const [reachable, server] = await Promise.all([
        checkApiHealth(),
        listServerProjects(),
      ]);
      setServerReachable(reachable);
      setServerProjects(server);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshProjects();
    window.addEventListener("focus", refreshProjects);
    return () => window.removeEventListener("focus", refreshProjects);
  }, [jobs]);

  useEffect(() => {
    const busy = jobs.some(
      (job) => job.status === "starting" || job.status === "processing",
    );
    if (!busy) return undefined;
    const id = window.setInterval(refreshProjects, 5000);
    return () => window.clearInterval(id);
  }, [jobs]);

  const serverById = useMemo(() => {
    const map = new Map();
    for (const project of serverProjects) {
      const jobId = normalizeJobId(project.job_id);
      if (!jobId) continue;
      map.set(jobId, { ...project, job_id: jobId });
    }
    return map;
  }, [serverProjects]);

  const normalizedServerProjects = useMemo(
    () => [...serverById.values()],
    [serverById],
  );

  const userProjects = useMemo(() => {
    const contextIds = new Set(jobs.map((job) => job.jobId).filter(Boolean));
    const providedIds = new Set(providedProjects.map((p) => p.jobId));
    const stored = listProjects().filter(
      (p) => !contextIds.has(p.jobId) && !providedIds.has(p.jobId),
    );
    const serverIds = new Set(normalizedServerProjects.map((p) => p.job_id));

    const fromJobs = jobs
      .filter((job) => !providedIds.has(job.jobId))
      .filter((job) => {
        if (job.status === "starting" || job.status === "processing") return true;
        if (!job.jobId) return false;
        const serverEntry = serverById.get(normalizeJobId(job.jobId));
        if (serverEntry?.has_glb) return false;
        return !serverIds.has(normalizeJobId(job.jobId));
      })
      .map((job) => {
        const hasGlb = job.status === "done" && Boolean(job.modelUrl || job.jobId);
        const hasSketch = Boolean(job.thumb || job.imageUrl || job.jobId);
        const serverEntry = job.jobId ? serverById.get(job.jobId) : null;
        const serverHasGlb = serverEntry ? Boolean(serverEntry.has_glb) : hasGlb;
        return {
          key: job.id,
          jobId: job.jobId,
          name: buildSketchName(job.createdAt, job.jobId),
          createdAt: job.createdAt,
          thumb: resolveThumb(job, serverEntry),
          modelUrl:
            serverHasGlb && job.jobId
              ? job.modelUrl ?? getGlbDownloadUrl(job.jobId)
              : null,
          imageUrl: job.imageUrl,
          imageSource: job.imageSource,
          status: job.status,
          progress: job.progress,
          threeMfUrl: job.threeMfUrl,
          failReason: job.failReason,
          generationId: job.id,
          source: "session",
          canDelete: false,
          hasGlb: serverHasGlb,
          hasSketch,
          needsRegenerate:
            hasSketch &&
            !serverHasGlb &&
            job.status !== "starting" &&
            job.status !== "processing",
        };
      });

    const fromStored = stored
      .filter((p) => !serverIds.has(normalizeJobId(p.jobId)))
      .map((project) => {
        const serverEntry = serverById.get(project.jobId);
        const hasGlb = serverEntry ? Boolean(serverEntry.has_glb) : false;
        const hasSketch = serverEntry
          ? Boolean(serverEntry.has_sketch)
          : Boolean(project.thumb);
        return {
          key: project.jobId,
          jobId: project.jobId,
          name: project.name,
          createdAt: project.createdAt,
          thumb: resolveThumb(project, serverEntry),
          modelUrl: hasGlb ? getGlbDownloadUrl(project.jobId) : null,
          imageSource: project.imageSource,
          status: hasGlb ? "done" : "sketch-only",
          progress: hasGlb ? 100 : 0,
          threeMfUrl: hasGlb ? getThreeMfDownloadUrl(project.jobId) : null,
          failReason: null,
          generationId: null,
          source: "local",
          canDelete: true,
          hasGlb,
          hasSketch,
          needsRegenerate: hasSketch && !hasGlb,
        };
      });

    const fromServer = normalizedServerProjects
      .filter((p) => !contextIds.has(p.job_id) && !providedIds.has(p.job_id))
      .filter((p) => isValidProjectJobId(p.job_id))
      .map((p) => {
        const thumb = resolveThumb({ jobId: p.job_id }, p);
        const hasGlb = Boolean(p.has_glb);
        const hasSketch = Boolean(p.has_sketch) || Boolean(thumb);
        return {
          key: `server-${p.job_id}`,
          jobId: p.job_id,
          name: thumb
            ? buildSketchName(p.created_at, p.job_id)
            : `Sketch ${p.job_id.slice(0, 8)}…`,
          createdAt: p.created_at,
          thumb,
          modelUrl: hasGlb ? getGlbDownloadUrl(p.job_id) : null,
          imageUrl: thumb,
          imageSource: "upload",
          status: hasGlb ? "done" : "sketch-only",
          progress: hasGlb ? 100 : 0,
          threeMfUrl: hasGlb ? getThreeMfDownloadUrl(p.job_id) : null,
          failReason: null,
          generationId: null,
          source: "server",
          canDelete: true,
          hasGlb,
          hasSketch,
          needsRegenerate: hasSketch && !hasGlb,
        };
      });

    const merged = [...fromJobs, ...fromStored, ...fromServer];
    const byJobId = new Map();
    for (const project of merged) {
      const id = normalizeJobId(project.jobId) ?? project.key;
      if (!isValidProjectJobId(id) && !project.generationId) continue;
      const existing = byJobId.get(id);
      if (!existing) {
        byJobId.set(id, project);
        continue;
      }
      byJobId.set(id, {
        ...existing,
        ...project,
        thumb: project.thumb ?? existing.thumb,
        hasGlb: existing.hasGlb || project.hasGlb,
        hasSketch: existing.hasSketch || project.hasSketch,
        needsRegenerate: (existing.hasSketch || project.hasSketch) &&
          !(existing.hasGlb || project.hasGlb),
        status:
          existing.hasGlb || project.hasGlb
            ? "done"
            : project.status ?? existing.status,
      });
    }

    return [...byJobId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [jobs, normalizedServerProjects, providedProjects, serverById]);

  const openProject = (project) => {
    if (project.status === "starting" || project.status === "processing") {
      if (project.generationId) {
        openLoading(navigate, project.generationId);
      }
      return;
    }

    if (projectNeedsRegenerate(project) && project.jobId) {
      navigate(`/project?job=${encodeURIComponent(project.jobId)}`, { replace: false });
      return;
    }

    if (!project.jobId) return;

    const sketchUrl = resolveSketchSrc({
      jobId: project.jobId,
      imageUrl: project.thumb ?? project.imageUrl,
      jobs,
    });

    openViewer(navigate, {
      jobId: project.jobId,
      backTo: "/projects",
      imageUrl: sketchUrl,
      imageSource: project.imageSource ?? "upload",
      modelUrl: project.modelUrl ?? getGlbDownloadUrl(project.jobId),
      threeMfUrl: project.threeMfUrl ?? getThreeMfDownloadUrl(project.jobId),
      setImage,
      setModel,
    });
  };

  const regenerateProject = async (project) => {
    if (!project.jobId) {
      window.alert("Sketch image not found on the server. Try creating a new photo.");
      return;
    }

    const sketchUrl = resolveSketchSrc({
      jobId: project.jobId,
      imageUrl: project.thumb ?? project.imageUrl,
      jobs,
    });
    if (!sketchUrl) {
      window.alert("Sketch image not found on the server. Try creating a new photo.");
      return;
    }

    const file = await imageUrlToFile(sketchUrl, "sketch.jpg");
    if (!file) {
      window.alert("Could not load the sketch. Check your network connection.");
      return;
    }

    setImage(sketchUrl, project.imageSource ?? "upload", file);
    const generationId = startGeneration({
      imageUrl: sketchUrl,
      imageFile: file,
      imageSource: project.imageSource ?? "upload",
      existingJobId: project.jobId,
    });

    if (!generationId) {
      window.alert("Too many generations running. Wait a moment and try again.");
      return;
    }

    openLoading(navigate, generationId);
  };

  const deleteProject = async (event, project) => {
    event.stopPropagation();
    if (project.status === "starting" || project.status === "processing") return;

    const confirmed = window.confirm(
      "Delete this project?\n\nFor server projects, it will be removed for all participants.",
    );
    if (!confirmed) return;

    setDeletingKey(project.key);
    try {
      if (project.jobId) {
        if (project.source === "server" || project.source === "local") {
          await deleteServerProject(project.jobId);
        }
        removeProject(project.jobId);
        setServerProjects((prev) => prev.filter((p) => p.job_id !== project.jobId));
      }
      removeJob(project.generationId ?? project.jobId);
    } finally {
      setDeletingKey(null);
    }
  };

  const sketchCount = userProjects.filter((p) => p.hasSketch || p.thumb).length;
  const modelCount = userProjects.filter((p) => p.hasGlb && !projectNeedsRegenerate(p)).length;
  const pendingCount = userProjects.filter((p) => projectNeedsRegenerate(p)).length;

  const emptyHint =
    serverReachable === false
      ? "Server not reachable. Start the app with start-dev.ps1, then tap Refresh."
      : "No sketches yet. Tap New sketch on the home screen to create your first 3D model.";

  return (
    <>
      <PageHeader title="Recent Projects" backTo="/" backReplace />

      <div className="page-body">

        <div className="projects-toolbar">
          <button
            type="button"
            className="projects-refresh-btn"
            onClick={refreshProjects}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh list"}
          </button>
          {mayGenerate && (
            <PrimaryButton
              text="New sketch"
              variant="secondary"
              onClick={() => navigate("/camera", { replace: true })}
            />
          )}
        </div>

        <section className="projects-section">
          <h2 className="projects-section-title">Sample model</h2>
          <ProjectList
            projects={providedProjects}
            deletingKey={deletingKey}
            onOpen={openProject}
            onDelete={deleteProject}
            onRegenerate={regenerateProject}
            allowDelete={role === "admin"}
            allowRegenerate={mayGenerate}
          />
        </section>

        <section className="projects-section">
          <h2 className="projects-section-title">Your sketches &amp; 3D models</h2>

          {userProjects.length === 0 ? (
            <p className="hint projects-empty">{emptyHint}</p>
          ) : (
            <ProjectList
              projects={userProjects}
              deletingKey={deletingKey}
              onOpen={openProject}
              onDelete={deleteProject}
              onRegenerate={regenerateProject}
              allowDelete={role === "admin"}
              allowRegenerate={mayGenerate}
            />
          )}
        </section>

        <p className="hint projects-scope-hint">
          {serverReachable === false
            ? "Cannot reach the 3D server. Check that the backend is running on the PC."
            : sketchCount > 0
              ? `${sketchCount} sketch(es) saved | ${modelCount} with 3D model` +
                (pendingCount > 0 ? ` · ${pendingCount} waiting for 3D` : "")
              : "Server connected. Every photo you take is saved here."}
        </p>
      </div>
    </>
  );
}

export default ProjectsPage;
