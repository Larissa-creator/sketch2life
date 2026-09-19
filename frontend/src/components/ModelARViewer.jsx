import { useEffect, useRef, useState } from "react";
import "@google/model-viewer";
import { getARPlatformInfo, isMobile } from "../utils/device";
import {
  getFallbackModel,
  getArModes,
  resolveAbsoluteModelSrc,
  resolveAbsoluteUsdzSrc,
  resolveModelSrc,
} from "../utils/ar";

function ModelARViewer({
  src,
  jobId,
  mobileArMode = false,
  useFallback = true,
}) {
  const ref = useRef(null);
  const mobile = isMobile();
  const arInfo = getARPlatformInfo();

  const resolved = resolveModelSrc(src, jobId);
  const absoluteSrc = resolveAbsoluteModelSrc(src, jobId);
  const modelSrc = resolved ?? (useFallback ? getFallbackModel() : null);
  const displaySrc = mobile && absoluteSrc ? absoluteSrc : modelSrc;
  const isRealModel = Boolean(resolved);
  const showMobileAr = mobileArMode && mobile;
  // iOS: fertiges USDZ vom Backend statt der GLB-Konvertierung von model-viewer.
  const usdzSrc = arInfo.platform === "ios" ? resolveAbsoluteUsdzSrc(jobId) : null;

  const [loadState, setLoadState] = useState("loading");
  const [usdzCheck, setUsdzCheck] = useState({ src: null, state: "checking" });

  // Ergebnis gilt nur für die geprüfte URL - bei Modellwechsel wieder "checking".
  const usdzState = !usdzSrc
    ? "idle"
    : usdzCheck.src === usdzSrc
      ? usdzCheck.state
      : "checking";

  // Ohne USDZ bleibt AR auf dem iPhone stumm - vorher prüfen, ohne die Datei zu laden.
  useEffect(() => {
    if (!usdzSrc) return undefined;

    let cancelled = false;

    fetch(`${usdzSrc}?check=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setUsdzCheck({ src: usdzSrc, state: data?.available ? "ready" : "missing" });
      })
      .catch(() => {
        if (!cancelled) setUsdzCheck({ src: usdzSrc, state: "missing" });
      });

    return () => {
      cancelled = true;
    };
  }, [usdzSrc]);

  const arUnavailableOnIos = arInfo.platform === "ios" && usdzState === "missing";
  const showArButton = showMobileAr && !arUnavailableOnIos;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const onLoad = () => setLoadState("ready");
    const onError = () => setLoadState("error");

    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    if (el.loaded) onLoad();

    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [displaySrc]);

  if (!modelSrc) {
    return (
      <div className="ar-model-block">
        <p className="hint ar-empty-hint">
          No 3D model available yet. Please generate one first.
        </p>
      </div>
    );
  }

  return (
    <div className="ar-model-block">
      <div className="ar-viewer-wrap">
        <model-viewer
          ref={ref}
          src={displaySrc}
          alt="3D model"
          crossorigin="anonymous"
          loading="eager"
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          exposure="1"
          {...(showArButton
            ? {
                ar: true,
                "ar-modes": getArModes(),
                "ar-scale": "auto",
                "ar-placement": "floor",
              }
            : {})}
          {...(showArButton && usdzState === "ready" ? { "ios-src": usdzSrc } : {})}
          className={[
            "model-viewer-el",
            showMobileAr ? "model-viewer-el--ar-active" : "model-viewer-el--preview",
            loadState === "loading" ? "model-viewer-el--loading" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {showArButton && (
            <button slot="ar-button" type="button" className="ar-page-btn">
              {arInfo.buttonLabel}
            </button>
          )}
        </model-viewer>

        {loadState === "loading" && (
          <p className="ar-load-overlay">Loading model...</p>
        )}
      </div>

      {loadState === "error" && (
        <p className="hint ar-error-hint">Could not load model.</p>
      )}

      {arUnavailableOnIos && (
        <p className="hint ar-error-hint">
          No AR file for this model. Generate a new 3D object to use AR on iPhone.
        </p>
      )}

      {!mobile && (
        <p className="ar-platform-badge">
          Preview · {isRealModel ? "GLB" : "Demo"} · Open AR on phone via QR
        </p>
      )}
    </div>
  );
}

export default ModelARViewer;
