import { useEffect, useRef, useState } from "react";
import { FaHandPointer } from "react-icons/fa6";
import { toAbsoluteUrl } from "../utils/ar";
import { isMobile } from "../utils/device";

const ROTATE_DEG = 28;
const TILT_DEG = 18;
const MIN_PHI = 30;
const MAX_PHI = 150;

function ViewerModelPanel({ src }) {
  const viewerRef = useRef(null);
  const [loadState, setLoadState] = useState("loading");
  const displaySrc =
    src && (isMobile() || typeof window !== "undefined")
      ? toAbsoluteUrl(src)
      : src;

  useEffect(() => {
    const el = viewerRef.current;
    if (!el || !displaySrc) {
      setLoadState("error");
      return undefined;
    }

    setLoadState("loading");

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

  const rotate = (direction) => {
    const viewer = viewerRef.current;
    if (!viewer?.getCameraOrbit) return;

    const orbit = viewer.getCameraOrbit();
    const thetaDeg = (orbit.theta * 180) / Math.PI + direction * ROTATE_DEG;
    const phiDeg = (orbit.phi * 180) / Math.PI;
    viewer.cameraOrbit = `${thetaDeg}deg ${phiDeg}deg ${orbit.radius}m`;
  };

  const tilt = (direction) => {
    const viewer = viewerRef.current;
    if (!viewer?.getCameraOrbit) return;

    const orbit = viewer.getCameraOrbit();
    const thetaDeg = (orbit.theta * 180) / Math.PI;
    let phiDeg = (orbit.phi * 180) / Math.PI + direction * TILT_DEG;
    phiDeg = Math.min(MAX_PHI, Math.max(MIN_PHI, phiDeg));
    viewer.cameraOrbit = `${thetaDeg}deg ${phiDeg}deg ${orbit.radius}m`;
  };

  const zoom = (closer) => {
    const viewer = viewerRef.current;
    if (!viewer?.zoom) return;
    viewer.zoom(closer ? -0.6 : 0.6);
  };

  return (
    <div className="viewer-box viewer-box--panel">
      <div className="viewer-model-wrap">
        <model-viewer
          key={displaySrc}
          ref={viewerRef}
          src={displaySrc}
          alt="Generated 3D model"
          camera-controls
          touch-action="pan-y"
          shadow-intensity="1"
          exposure="1.15"
          environment-image="neutral"
          loading="eager"
          crossorigin="anonymous"
          className={[
            "model-viewer-el",
            loadState === "loading" ? "model-viewer-el--loading" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />

        {loadState === "loading" && (
          <p className="viewer-model-overlay">Loading 3D model...</p>
        )}
        {loadState === "error" && (
          <p className="viewer-model-overlay viewer-model-overlay--error">
            Could not load the 3D model. Check Wi-Fi and try again, or tap Download GLB.
          </p>
        )}
      </div>

      <div className="viewer-touch-panel">
        <div className="viewer-touch-bar" aria-label="Model controls">
         
          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Rotate left"
            onClick={() => rotate(-1)}
          >
            ↺
          </button>
          
          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Rotate right"
            onClick={() => rotate(1)}
          >
            ↻
          </button>

          <span className="viewer-touch-divider" aria-hidden />

          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Tilt up"
            onClick={() => tilt(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Tilt down"
            onClick={() => tilt(1)}
          >
            ↓
          </button>

          <span className="viewer-touch-divider" aria-hidden />

          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Zoom out"
            onClick={() => zoom(true)}
          >
            −
          </button>
          <button
            type="button"
            className="viewer-touch-btn"
            aria-label="Zoom in"
            onClick={() => zoom(false)}
          >
            +
          </button>
        </div>
        <p className="viewer-touch-legend">
          ↺↻ rotate | ↑↓ tilt | +− zoom
        </p>
      </div>
    </div>
  );
}

export default ViewerModelPanel;
