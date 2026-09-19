const STORAGE_KEY = "sketch2life-projects";
const MAX_PROJECTS = 20;

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function listProjects() {
  return readAll().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getProjectByJobId(jobId) {
  if (!jobId) return null;
  return readAll().find((p) => p.jobId === jobId) ?? null;
}

export function saveProject({ jobId, imageUrl, imageSource }) {
  if (!jobId) return null;

  const thumb = imageUrl && !imageUrl.startsWith("blob:") ? imageUrl : null;
  const createdAt = new Date().toISOString();
  const previous = getProjectByJobId(jobId);
  const entry = {
    jobId,
    name: previous?.name ?? `Sketch ${formatDate(createdAt)}`,
    createdAt: previous?.createdAt ?? createdAt,
    thumb: thumb ?? previous?.thumb ?? null,
    imageSource: imageSource ?? previous?.imageSource ?? null,
  };

  const withoutDup = readAll().filter((p) => p.jobId !== jobId);
  writeAll([entry, ...withoutDup].slice(0, MAX_PROJECTS));
  return entry;
}

export function removeProject(jobId) {
  if (!jobId) return;
  writeAll(readAll().filter((p) => p.jobId !== jobId));
}
