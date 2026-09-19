/** Öffentliche URLs für AR / QR (api.js, arShare.js). */

export function isLocalHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** Origin vom Handy erreichbar (kein localhost, wenn LAN-IP gesetzt). */
export function resolvePublicOrigin() {
  const explicit = (import.meta.env.VITE_PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
  if (explicit) return explicit;

  if (typeof window === "undefined") return "";

  const { protocol, hostname, port } = window.location;
  const devPort = port || "5173";

  if (!isLocalHost(hostname)) {
    return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
  }

  const kiPublic = (import.meta.env.VITE_KI_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (kiPublic) {
    try {
      const ki = new URL(kiPublic);
      if (!isLocalHost(ki.hostname)) {
        return `${protocol}//${ki.hostname}:${devPort}`;
      }
    } catch {
      /* Ungültige KI-URL ignorieren */
    }
  }

  return window.location.origin;
}

export function resolvePublicKiOrigin() {
  const kiPublic = (import.meta.env.VITE_KI_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (kiPublic) {
    try {
      const ki = new URL(kiPublic);
      if (!isLocalHost(ki.hostname)) return kiPublic;
    } catch {
      /* Ungültige KI-URL ignorieren */
    }
  }
  return resolvePublicOrigin();
}

export function publicFrontendAssetUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${resolvePublicOrigin()}${normalized}`;
}

export function publicKiAssetUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = resolvePublicOrigin();

  // Dev/Workshop: GLB über Vite-Proxy (Port 5173), gleicher Port wie QR-AR.
  if (import.meta.env.DEV && origin) {
    return `${origin.replace(/\/$/, "")}/ki-api${normalized}`;
  }

  const base = resolvePublicKiOrigin();
  if (base.includes("/ki-api")) {
    return publicFrontendAssetUrl(normalized);
  }
  return `${base.replace(/\/$/, "")}${normalized}`;
}

export function getLanAppUrl() {
  const origin = resolvePublicOrigin();
  if (!isLocalHost(new URL(origin).hostname)) return origin;
  const ki = (import.meta.env.VITE_KI_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!ki) return null;
  try {
    const u = new URL(ki);
    if (isLocalHost(u.hostname)) return null;
    return `http://${u.hostname}:5173`;
  } catch {
    return null;
  }
}
