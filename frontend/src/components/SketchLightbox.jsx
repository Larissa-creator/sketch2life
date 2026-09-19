import { useEffect } from "react";
import SketchImage from "./SketchImage";
import "../styles/SketchLightbox.css";

function SketchLightbox({ src, candidates, alt, onClose }) {
  const urls = candidates ?? (src ? [src] : []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="sketch-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Original sketch"
      onClick={onClose}
    >
      <button type="button" className="sketch-lightbox-close" onClick={onClose}>
        Close
      </button>
      <SketchImage
        candidates={urls}
        className="sketch-lightbox-img"
        alt={alt}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export default SketchLightbox;
