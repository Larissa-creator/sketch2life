import { getGlbPublicUrl, getUsdzPublicUrl } from "../services/api";
import {
  getLanAppUrl,
  isLocalHost,
  resolvePublicOrigin,
} from "./publicUrls";

export { resolvePublicOrigin };

export function resolvePublicGlbUrl(jobId, modelUrl) {
  return getGlbPublicUrl(jobId, modelUrl);
}

export function buildArPageUrl(glbPublicUrl, usdzPublicUrl = null) {
  if (!glbPublicUrl) return null;

  const configured = (import.meta.env.VITE_AR_PAGE_URL ?? "").replace(/\/$/, "");
  const pageBase = configured || `${resolvePublicOrigin()}/ar.html`;
  const usdzParam = usdzPublicUrl
    ? `&usdz=${encodeURIComponent(usdzPublicUrl)}`
    : "";

  return `${pageBase}?${encodeURIComponent(glbPublicUrl)}${usdzParam}`;
}

export function buildArShareUrl(jobId, modelUrl) {
  const glbUrl = resolvePublicGlbUrl(jobId, modelUrl);
  return buildArPageUrl(glbUrl, getUsdzPublicUrl(jobId));
}

export function getArShareStatus(shareUrl) {
  if (!shareUrl) {
    return {
      level: "error",
      title: "AR link unavailable",
      detail: "Create a 3D model first or use demo mode.",
    };
  }

  const lanAppUrl = getLanAppUrl();

  try {
    const pageUrl = new URL(shareUrl);
    const [rawGlbParam] = pageUrl.search.replace(/^\?/, "").split("&");
    const glbParam = decodeURIComponent(rawGlbParam);
    const glbUrl = glbParam ? new URL(glbParam) : null;

    if (isLocalHost(pageUrl.hostname)) {
      return {
        level: "error",
        title: "App opened on localhost",
        detail: lanAppUrl
          ? `Open the app as ${lanAppUrl} (not localhost), then reload AR page.`
          : "Run start-dev.ps1 on the presenter PC, then reload.",
        lanAppUrl,
      };
    }

    if (glbUrl && isLocalHost(glbUrl.hostname)) {
      return {
        level: "error",
        title: "3D file is unreachable",
        detail: lanAppUrl
          ? `GLB points to localhost. Open app as ${lanAppUrl}.`
          : "Run start-dev.ps1 on the presenter PC, then reload.",
        lanAppUrl,
      };
    }

    if (pageUrl.protocol === "https:") {
      return {
        level: "ok",
        title: "Ready for AR",
        detail: "Scan QR and tap 'View in AR' in Safari.",
      };
    }

    return {
      level: "ok",
      title: "Ready for AR",
      detail: "Scan QR on your phone. Connect to the presenter PC hotspot first.",
      lanAppUrl,
    };
  } catch {
    return {
      level: "error",
      title: "Invalid AR link",
      detail: "Reload page or restart with start-dev.ps1.",
      lanAppUrl,
    };
  }
}
