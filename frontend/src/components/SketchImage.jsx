import { useState } from "react";

function SketchImage({ candidates, alt, className, ...props }) {
  const [index, setIndex] = useState(0);
  const src = candidates[index];

  if (!src || index >= candidates.length) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setIndex((current) => current + 1)}
      {...props}
    />
  );
}

export default SketchImage;
