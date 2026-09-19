import { DEMO_JOB_ID, getGlbDownloadUrl, getUsdzDownloadUrl } from "../services/api";
import { isAndroid, isIOS } from "./device";
import { buildArPageUrl } from "./arShare";

const FALLBACK_MODEL = "/demo-model.glb?v=2";

export function toAbsoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

export function resolveModelSrc(modelUrl, jobId) {
  if (jobId === DEMO_JOB_ID && modelUrl) return modelUrl;
  if (jobId) {
    const fromJob = getGlbDownloadUrl(jobId);
    if (fromJob) return fromJob;
  }
  if (modelUrl) return modelUrl;
  return null;
}

export function resolveAbsoluteModelSrc(modelUrl, jobId) {
  const src = resolveModelSrc(modelUrl, jobId);
  return src ? toAbsoluteUrl(src) : null;
}

/**
 * USDZ von Meshy für iOS AR Quick Look. Nur iOS braucht es, deshalb wird die
 * Datei nie vorab geladen - model-viewer holt sie erst beim Start von AR.
 */
export function resolveUsdzSrc(jobId) {
  return getUsdzDownloadUrl(jobId);
}

export function resolveAbsoluteUsdzSrc(jobId) {
  const src = resolveUsdzSrc(jobId);
  return src ? toAbsoluteUrl(src) : null;
}

export function getFallbackModel() {
  return FALLBACK_MODEL;
}

export function getArModes() {
  if (isIOS()) return "quick-look";
  if (isAndroid()) return "scene-viewer webxr quick-look";
  return "webxr scene-viewer quick-look";
}

export function launchSceneViewer(modelUrl) {
  const file = encodeURIComponent(toAbsoluteUrl(modelUrl));
  const fallback = encodeURIComponent(window.location.href);
  const intent =
    `intent://arvr.google.com/scene-viewer/1.0?file=${file}&mode=ar_preferred` +
    `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
    `action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
  window.location.href = intent;
}

export function launchQuickLook(modelUrl) {
  const absolute = toAbsoluteUrl(modelUrl);
  const link = document.createElement("a");
  link.rel = "ar";
  link.href = absolute;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function launchAR(viewerEl, modelUrl) {
  const absolute = toAbsoluteUrl(modelUrl);

  if (viewerEl?.activateAR) {
    try {
      await viewerEl.activateAR();
      return;
    } catch {
      /* fallback below */
    }
  }

  const arPage = buildArPageUrl(absolute);
  if (arPage && (isIOS() || isAndroid())) {
    window.location.assign(arPage);
    return;
  }

  if (isAndroid()) {
    launchSceneViewer(modelUrl);
  }
}

export function needsHttpsForAR() {
  return (
    window.location.protocol === "http:" &&
    !isIOS() &&
    (window.location.hostname === "localhost" ||
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(window.location.hostname))
  );
}

export function getARWarning() {
  if (isIOS()) {
    return "Tip: use Safari and tap 'View in AR'.";
  }
  if (needsHttpsForAR() && isAndroid()) {
    return "Android AR (Scene Viewer) often needs HTTPS. Local network mode can be limited.";
  }
  return null;
}

export { isIOS, isAndroid };
