import catalog from "../data/curatedProjects.json";

export function listProvidedProjects() {
  return (catalog.provided ?? []).map((entry) => ({
    key: entry.key,
    jobId: entry.jobId,
    name: entry.name,
    description: entry.description ?? "",
    thumb: entry.thumb,
    modelUrl: entry.modelUrl,
    threeMfUrl: entry.threeMfUrl,
    imageSource: entry.imageSource ?? "demo",
    status: "done",
    progress: 100,
    source: "provided",
    createdAt: entry.createdAt ?? null,
    canDelete: false,
  }));
}

export function getProvidedProject(jobId) {
  return listProvidedProjects().find((project) => project.jobId === jobId) ?? null;
}
