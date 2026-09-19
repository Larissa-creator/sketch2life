import axios from "axios";
import {
  publicFrontendAssetUrl,
  publicKiAssetUrl,
  resolvePublicKiOrigin,
} from "../utils/publicUrls";
import { prepareUploadFile } from "../utils/image";
import { getToken, setToken } from "../utils/authToken";

export const DEMO_JOB_ID = "demo-praesentation";
export const DEMO_SKETCH = "/demo-sketch.png";
export const DEMO_MODEL = "/demo-model.glb?v=2";
export const DEMO_THREE_MF = "/demo-model.3mf?v=2";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const KI_PUBLIC_URL = (import.meta.env.VITE_KI_PUBLIC_URL ?? API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const USE_DEV_PROXY =
  import.meta.env.DEV && import.meta.env.VITE_USE_PROXY !== "false";
const GENERATE_ROUTE = import.meta.env.VITE_GENERATE_ROUTE ?? "/convert";
const STATUS_PATH = import.meta.env.VITE_STATUS_ROUTE ?? "/status";
const FILE_FIELD = import.meta.env.VITE_FILE_FIELD ?? "file";
const PRINT_API_URL = (import.meta.env.VITE_PRINT_API_URL ?? "").replace(/\/$/, "");
const PRINT_USE_DEV_PROXY =
  import.meta.env.DEV && import.meta.env.VITE_PRINT_USE_PROXY !== "false";
const PRINT_ROUTE = import.meta.env.VITE_PRINT_ROUTE ?? "/print";

const POLL_MS = 1000;
const POLL_MAX = 450;
const POLL_NETWORK_RETRIES = 12;

/** Im Dev über Vite-Proxy /ki-api (auch vom Handy über Port 5173). */
function useDevProxy() {
  return USE_DEV_PROXY;
}

function resolveApiBaseUrl() {
  if (useDevProxy()) return "/ki-api";
  if (API_BASE_URL) return API_BASE_URL;
  if (KI_PUBLIC_URL) return KI_PUBLIC_URL;
  return "";
}

export function hasLiveApi() {
  return useDevProxy() || Boolean(API_BASE_URL) || Boolean(KI_PUBLIC_URL);
}

export async function checkApiHealth() {
  const health = await fetchApiHealth();
  return Boolean(health?.ok);
}

export async function fetchApiHealth() {
  if (!hasLiveApi()) return null;

  const urls = [];
  if (useDevProxy()) {
    if (typeof window !== "undefined") {
      urls.push(`${window.location.origin}/ki-api/health`);
    } else {
      urls.push("/ki-api/health");
    }
  }
  const direct = API_BASE_URL || KI_PUBLIC_URL;
  if (direct) urls.push(`${direct.replace(/\/$/, "")}/health`);

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { timeout: 8_000 });
      if (data?.ok) return data;
    } catch {
      /* try next URL */
    }
  }
  return null;
}

function resolvePrintApiBaseUrl() {
  if (PRINT_USE_DEV_PROXY) return "/print-api";
  return PRINT_API_URL;
}

function hasPrintApi() {
  return PRINT_USE_DEV_PROXY || Boolean(PRINT_API_URL);
}

const apiClient = axios.create({
  timeout: 120_000,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = resolveApiBaseUrl();
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Abgelaufene/ungültige Session: Token verwerfen und zum Login schicken.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      getToken() &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/admin")
    ) {
      setToken(null);
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export async function loginWorkshop(code, name) {
  const { data } = await apiClient.post("/auth/login", { code, name });
  setToken(data.token);
  return data;
}

export async function loginAdmin(password) {
  const { data } = await apiClient.post("/auth/admin", { password });
  setToken(data.token);
  return data;
}

export function logoutSession() {
  setToken(null);
}

export async function fetchSession() {
  if (!getToken() || !hasLiveApi()) return null;
  try {
    const { data } = await apiClient.get("/auth/session");
    return data;
  } catch {
    return null;
  }
}

export async function savePrintColor(jobId, colorId) {
  await apiClient.put(`/jobs/${encodeURIComponent(jobId)}/farbauswahl`, {
    selected_color: colorId,
  });
  return true;
}

export async function adminListWorkshops() {
  const { data } = await apiClient.get("/admin/workshops");
  return data.workshops ?? [];
}

export async function adminCreateWorkshop(name, generationCap) {
  const { data } = await apiClient.post("/admin/workshops", {
    name,
    generation_cap: generationCap,
  });
  return data;
}

export async function adminPatchWorkshop(workshopId, patch) {
  const { data } = await apiClient.patch(
    `/admin/workshops/${encodeURIComponent(workshopId)}`,
    patch,
  );
  return data;
}

export async function adminListModels(workshopId) {
  const { data } = await apiClient.get(
    `/admin/workshops/${encodeURIComponent(workshopId)}/models`,
  );
  return data;
}

const printClient = axios.create({
  baseURL: resolvePrintApiBaseUrl(),
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

export async function logPrintPageVisit(jobId = null) {
  if (!hasPrintApi()) return;
  try {
    const params = jobId ? { job_id: jobId } : undefined;
    await printClient.post("/log/print-page", null, { params });
  } catch {
    /* logging must not block the print page */
  }
}

export async function logPrintJobSent(jobId = null, color = null) {
  if (!hasPrintApi()) return;
  try {
    const params = {};
    if (jobId) params.job_id = jobId;
    if (color) params.color = color;
    await printClient.post("/log/print-sent", null, {
      params: Object.keys(params).length ? params : undefined,
    });
  } catch {
    /* logging must not block printing */
  }
}

function toShareableUrl(url) {
  if (!url || url.startsWith("http")) return url;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }
  return url;
}

function statusUrl(jobId) {
  const base = STATUS_PATH.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(jobId)}`;
}

function normalizeStatus(raw) {
  const s = (raw ?? "pending").toLowerCase();
  if (["done", "succeeded", "ready", "completed", "success"].includes(s)) return "done";
  if (s === "failed" || s === "error") return "failed";
  if (s === "processing") return "processing";
  if (s === "pending" || s === "downloading") return "pending";
  return "pending";
}

function pickJobId(data) {
  return data.jobId ?? data.jobid ?? data.job_id ?? null;
}

function assetUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (useDevProxy()) return `/ki-api${normalized}`;
  const base = API_BASE_URL || KI_PUBLIC_URL;
  if (!base) return normalized;
  return `${base}${normalized}`;
}

function kiPublicAssetUrl(path) {
  return publicKiAssetUrl(path);
}

export function getGlbPublicUrl(jobId, modelUrl = null) {
  if (jobId === DEMO_JOB_ID) {
    if (modelUrl?.startsWith("http")) return modelUrl;
    return publicFrontendAssetUrl(DEMO_MODEL);
  }
  if (modelUrl?.startsWith("http")) return modelUrl;
  if (modelUrl?.startsWith("/")) return publicFrontendAssetUrl(modelUrl);
  if (jobId) return kiPublicAssetUrl(downloadPath(jobId, "glb"));
  return null;
}

export async function listServerProjects() {
  if (!hasLiveApi()) return [];
  try {
    const { data } = await apiClient.get("/projects");
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

export async function deleteServerProject(jobId) {
  if (!hasLiveApi() || !jobId) return false;
  try {
    await apiClient.delete(`/projects/${encodeURIComponent(jobId)}`);
    return true;
  } catch {
    return false;
  }
}

export { resolvePublicKiOrigin };

function sketchPath(jobId) {
  return `/download/${encodeURIComponent(jobId)}/sketch`;
}

export function getSketchThumbUrl(jobId) {
  if (!jobId || jobId === DEMO_JOB_ID) return null;
  return assetUrl(sketchPath(jobId));
}

function downloadPath(jobId, suffix) {
  const base = `/download/${encodeURIComponent(jobId)}/${suffix}`;
  return base;
}

function farbauswahlPath(jobId) {
  return `/download/${encodeURIComponent(jobId)}/farbauswahl.json`;
}

function glbUrl(jobId) {
  return assetUrl(downloadPath(jobId, "glb"));
}

function threeMfUrl(jobId) {
  return assetUrl(downloadPath(jobId, "3mf"));
}

/** iOS AR Quick Look: Backend leitet auf Meshys CDN um, nichts wird lokal gespeichert. */
export function getUsdzDownloadUrl(jobId) {
  if (!jobId || jobId === DEMO_JOB_ID) return null;
  return assetUrl(downloadPath(jobId, "usdz"));
}

export function getUsdzPublicUrl(jobId) {
  if (!jobId || jobId === DEMO_JOB_ID) return null;
  return kiPublicAssetUrl(downloadPath(jobId, "usdz"));
}

export function getDruckAssetUrls(jobId) {
  if (!jobId) return null;
  return {
    threeMf: kiPublicAssetUrl(downloadPath(jobId, "3mf")),
    farbauswahl: kiPublicAssetUrl(farbauswahlPath(jobId)),
  };
}

export function getGlbDownloadUrl(jobId) {
  if (!jobId || jobId === DEMO_JOB_ID) return null;
  return glbUrl(jobId);
}

export function getThreeMfDownloadUrl(jobId) {
  if (!jobId || jobId === DEMO_JOB_ID) return DEMO_THREE_MF;
  return threeMfUrl(jobId);
}

export function getFarbauswahlDownloadUrl(jobId) {
  if (!jobId) return null;
  return assetUrl(farbauswahlPath(jobId));
}

export function getPrintShareUrls(jobId) {
  if (!jobId) return null;
  const druck = getDruckAssetUrls(jobId);
  return {
    jobId,
    threeMf: druck.threeMf,
    farbauswahl: druck.farbauswahl,
  };
}

function getPrintErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Could not reach the server. Check your network connection.";
    }
    const detail =
      error.response.data?.detail ??
      error.response.data?.message ??
      error.response.statusText;
    return `Print request failed (${error.response.status}): ${detail}`;
  }
  return error?.message ?? "Send failed.";
}

export async function saveFarbauswahlToKi(jobId, farben) {
  if (!jobId || !hasLiveApi()) return false;
  const { buildKiFarbauswahl } = await import("../utils/farbauswahl");
  await apiClient.put(
    `/jobs/${encodeURIComponent(jobId)}/farbauswahl`,
    buildKiFarbauswahl(farben),
  );
  return true;
}

export async function submitPrintPackage(jobId, selectedColor) {
  if (!jobId) throw new Error("Missing jobId");

  const share = getPrintShareUrls(jobId);

  if (!hasLiveApi()) {
    const err = new Error("Backend is not configured.");
    err.code = "no-print-api";
    err.urls = share;
    throw err;
  }

  try {
    const { data } = await apiClient.post(
      `/jobs/${encodeURIComponent(jobId)}/send-to-printer`,
      {
        selected_color: selectedColor,
      },
    );

    const printJobId = data.print_job_id ?? data.print_response?.job_id;
    if (!printJobId || !hasPrintApi()) {
      return {
        ok: true,
        sentToPrint: Boolean(printJobId),
        localOnly: !printJobId,
        kiSaved: true,
        jobId,
        objektId: jobId,
        selectedColor,
        ...share,
        printResponse: data.print_response ?? data,
      };
    }

    const { data: confirmData } = await printClient.post(
      `/print/${encodeURIComponent(printJobId)}/confirm`,
    );

    return {
      ok: true,
      sentToPrint: true,
      localOnly: false,
      kiSaved: true,
      jobId,
      objektId: jobId,
      selectedColor,
      printJobId,
      ...share,
      printResponse: confirmData,
    };
  } catch (error) {
    const err = new Error(getPrintErrorMessage(error));
    err.code = "print-failed";
    err.kiSaved = axios.isAxiosError(error) && error.response?.status === 502;
    err.urls = share;
    throw err;
  }
}

export function modelFilename(jobId, ext) {
  const id = jobId ? jobId.slice(0, 8) : "model";
  return `sketch2life-${id}.${ext}`;
}

export async function regenerate3DFromJob(jobId, onProgress) {
  if (!hasLiveApi()) {
    return { ok: false, reason: "no-api" };
  }

  try {
    onProgress?.(5, "Using saved sketch…");
    const { data } = await apiClient.post(
      `/projects/${encodeURIComponent(jobId)}/generate`,
    );
    const resolvedId = pickJobId(data) ?? jobId;
    onProgress?.(10, "Generation started…");
    return { ok: true, jobId: resolvedId };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (!error.response) {
        return { ok: false, reason: "network" };
      }
      if (error.response.status === 404) {
        return { ok: false, reason: "invalid-image" };
      }
      if (error.response.status === 503) {
        return { ok: false, reason: "no-api-key" };
      }
      if (error.response.status < 500) {
        return { ok: false, reason: "generation" };
      }
    }
    return { ok: false, reason: "network" };
  }
}

export async function start3DConversion(imageUrl, imageFile, onProgress) {
  if (!hasLiveApi()) {
    return { ok: false, reason: "no-api" };
  }

  try {
    onProgress?.(5, "Uploading image…");

    const formData = new FormData();
    const fileToSend = await prepareUploadFile(imageUrl, imageFile);
    if (!fileToSend) {
      return { ok: false, reason: "invalid-image" };
    }
    formData.append(FILE_FIELD, fileToSend, fileToSend.name);

    const { data: start } = await apiClient.post(GENERATE_ROUTE, formData);

    const jobId = pickJobId(start);
    if (!jobId) {
      return { ok: false, reason: "generation" };
    }

    onProgress?.(10, "Generation started…");
    return { ok: true, jobId };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (!error.response) {
        return { ok: false, reason: "network" };
      }
      if (error.response.status === 415) {
        return { ok: false, reason: "invalid-image" };
      }
      if (error.response.status === 503) {
        return { ok: false, reason: "no-api-key" };
      }
      if (error.response.status < 500) {
        return { ok: false, reason: "generation" };
      }
    }
    return { ok: false, reason: "network" };
  }
}

export function watch3DJob(jobId, onProgress) {
  return pollJobStatus(jobId, onProgress);
}

export async function generate3DModel(imageUrl, imageFile, onProgress) {
  if (!hasLiveApi()) {
    return mockGenerate3DModel(imageUrl, onProgress);
  }

  const start = await start3DConversion(imageUrl, imageFile, onProgress);
  if (!start.ok) {
    return { ok: false, reason: start.reason ?? "generation" };
  }

  return watch3DJob(start.jobId, onProgress);
}

async function pollJobStatus(jobId, onProgress) {
  let networkErrors = 0;
  let maxProgress = 10;

  for (let i = 0; i < POLL_MAX; i += 1) {
    await wait(POLL_MS);

    try {
      const { data } = await apiClient.get(statusUrl(jobId));
      networkErrors = 0;
      const status = normalizeStatus(data.status);

      const rawProgress =
        typeof data.progress === "number"
          ? data.progress
          : Math.min(85, 15 + i * 2);
      const nextProgress = status === "done" ? 100 : Math.min(95, rawProgress);
      maxProgress = Math.max(maxProgress, nextProgress);

      const phaseHint =
        typeof data.status_detail === "string" && data.status_detail
          ? data.status_detail
          : null;
      let message = "Generating 3D model…";
      if (status === "done") {
        message = "Model ready!";
      } else if (phaseHint && /refine|textur/i.test(phaseHint)) {
        message = "Refining textures…";
      } else if (nextProgress < maxProgress) {
        message = "Next generation step…";
      }

      onProgress?.(maxProgress, message);

      if (status === "done") {
        await prefetchGlbDownload(jobId);
        return {
          ok: true,
          jobId,
          modelUrl: glbUrl(jobId),
          threeMfUrl: threeMfUrl(jobId),
        };
      }

      if (status === "failed") {
        const errText = String(data.error ?? data.detail ?? "").toLowerCase();
        if (
          errText.includes("api_key") ||
          errText.includes("api key") ||
          errText.includes("unauthorized") ||
          errText.includes("not configured")
        ) {
          return { ok: false, reason: "no-api-key" };
        }
        return { ok: false, reason: "generation" };
      }
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        networkErrors += 1;
        if (networkErrors >= POLL_NETWORK_RETRIES) {
          return { ok: false, reason: "network" };
        }
        continue;
      }
    }
  }

  return { ok: false, reason: "timeout" };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prefetchGlbDownload(jobId) {
  try {
    await apiClient.get(glbUrl(jobId), {
      responseType: "blob",
      timeout: 120_000,
    });
  } catch {
    /* GLB may still download when the viewer opens */
  }
}

async function mockGenerate3DModel(imageUrl, onProgress) {
  const steps = [
    { at: 10, msg: "Analyzing image…" },
    { at: 40, msg: "Generating 3D model…" },
    { at: 70, msg: "Optimizing mesh…" },
    { at: 85, msg: "Preparing viewer…" },
  ];

  if (!imageUrl) return { ok: false, reason: "network" };

  const params = new URLSearchParams(window.location.search);
  if (params.get("fail") === "1") {
    await delay(2000, onProgress, steps);
    return { ok: false, reason: "generation" };
  }
  if (params.get("fail") === "network") {
    await delay(1500, onProgress, steps);
    return { ok: false, reason: "network" };
  }

  await delay(2000, onProgress, steps);
  onProgress?.(100, "Done!");
  return {
    ok: true,
    jobId: DEMO_JOB_ID,
    modelUrl: DEMO_MODEL,
    threeMfUrl: DEMO_THREE_MF,
  };
}

export async function generateDemo3DModel(imageUrl, _imageFile, onProgress) {
  return mockGenerate3DModel(imageUrl, onProgress);
}

function delay(ms, onProgress, steps) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(90, Math.round((elapsed / ms) * 90));
      const step = [...steps].reverse().find((s) => pct >= s.at);
      onProgress?.(pct, step?.msg ?? "Please wait…");
      if (elapsed >= ms) {
        clearInterval(tick);
        resolve();
      }
    }, 80);
  });
}
