const UPLOAD_MAX_PX = 1536;
const THUMB_MAX_PX = 200;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

function resizeToDataUrl(img, maxPx, quality = 0.82) {
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function blobToResizedJpegFile(blob, filename, maxPx = UPLOAD_MAX_PX) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const dataUrl = resizeToDataUrl(img, maxPx, 0.85);
    const response = await fetch(dataUrl);
    const resized = await response.blob();
    return new File([resized], filename.endsWith(".jpg") ? filename : "sketch.jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function needsJpegConversion(file) {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (!type || type === "application/octet-stream") return true;
  if (type.includes("heic") || type.includes("heif")) return true;
  if (name.endsWith(".heic") || name.endsWith(".heif")) return true;
  return !["image/jpeg", "image/png", "image/webp"].includes(type);
}

/** Resize every upload so large workshop photos do not break Meshy. */
async function fileToJpeg(file, maxPx = UPLOAD_MAX_PX) {
  if (!file?.size) return file;

  try {
    return await blobToResizedJpegFile(file, file.name || "sketch.jpg", maxPx);
  } catch {
    if (needsJpegConversion(file)) return file;
    return file;
  }
}

/** Prepare JPEG for upload (iPhone HEIC, large camera photos, blobs). */
export async function prepareUploadFile(imageUrl, imageFile) {
  try {
    if (imageFile?.size > 0) {
      return await fileToJpeg(imageFile);
    }

    const fromUrl = await imageUrlToFile(imageUrl);
    if (!fromUrl) return null;

    return await fileToJpeg(fromUrl);
  } catch {
    return imageFile?.size > 0 ? imageFile : null;
  }
}

/**
 * Sketch als Data-URL, damit er einen Reload übersteht. Android verwirft die
 * Seite beim Wechsel in die Kamera-App - ein blob: aus dem RAM ist dann tot.
 */
export async function imageUrlToPersistableSketch(imageUrl) {
  if (!imageUrl) return null;

  try {
    const img = await loadImage(imageUrl);
    return resizeToDataUrl(img, UPLOAD_MAX_PX, 0.85);
  } catch {
    return null;
  }
}

export async function imageUrlToPersistableThumb(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:")) {
    try {
      const img = await loadImage(imageUrl);
      return resizeToDataUrl(img, THUMB_MAX_PX, 0.7);
    } catch {
      return imageUrl;
    }
  }

  if (!imageUrl.startsWith("blob:")) {
    return imageUrl;
  }

  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const img = await loadImage(URL.createObjectURL(blob));
    return resizeToDataUrl(img, THUMB_MAX_PX, 0.7);
  } catch {
    return null;
  }
}

export async function imageUrlToFile(imageUrl, filename = "sketch.jpg") {
  if (!imageUrl) return null;

  try {
    const resolved =
      imageUrl.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${imageUrl}`
        : imageUrl;

    const response = await fetch(resolved);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!blob.size) return null;

    const type =
      blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/jpeg";

    return new File([blob], filename, { type });
  } catch {
    return null;
  }
}

export { UPLOAD_MAX_PX, THUMB_MAX_PX };
