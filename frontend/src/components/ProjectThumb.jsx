import { useState } from "react";
import { toAbsoluteUrl } from "../utils/ar";

function ProjectThumb({ sketchUrl, modelUrl }) {
  const absoluteModelUrl = modelUrl ? toAbsoluteUrl(modelUrl) : null;
  const [mode, setMode] = useState(() => {
    if (sketchUrl) return "sketch";
    if (modelUrl) return "model";
    return "placeholder";
  });

  if (mode === "sketch" && sketchUrl) {
    return (
      <img
        src={sketchUrl}
        alt=""
        className="project-thumb-img"
        onError={() => setMode(modelUrl ? "model" : "placeholder")}
      />
    );
  }

  if (mode === "model" && absoluteModelUrl) {
    return (
      <model-viewer
        src={absoluteModelUrl}
        alt=""
        className="project-thumb-model"
        auto-rotate
        rotation-per-second="30deg"
        interaction-prompt="none"
        camera-controls={false}
        disable-zoom
        shadow-intensity="0"
        exposure="1"
        loading="lazy"
      />
    );
  }

  return <span className="project-thumb-fallback" aria-hidden>✎</span>;
}

export default ProjectThumb;
