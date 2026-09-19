import { useEffect, useState } from "react";
import "../styles/ARHeadsetQrOverlay.css";

function ARHeadsetQrOverlay({ shareUrl, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl("");
      return undefined;
    }

    let cancelled = false;

    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(shareUrl, {
          width: 480,
          margin: 2,
          color: { dark: "#1a1a1a", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ar-headset-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Scan with AR headset"
      onClick={onClose}
    >
      <div className="ar-headset-overlay-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="ar-headset-overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <p className="ar-headset-overlay-title">Scan with AR headset</p>

        {qrDataUrl ? (
          <img
            className="ar-headset-overlay-qr"
            src={qrDataUrl}
            alt="QR code for Meta Quest"
          />
        ) : (
          <p className="hint ar-headset-overlay-loading">Preparing QR code…</p>
        )}

        <p className="ar-headset-overlay-instructions">
          On the Quest 3 Home Screen, go to <strong>Unknown Sources</strong>, open the{" "}
          <strong>QR²AR App</strong> and scan this.
        </p>

        <p className="hint ar-headset-overlay-note">
          This QR opens the page you are viewing right now.
        </p>
      </div>
    </div>
  );
}

export default ARHeadsetQrOverlay;
