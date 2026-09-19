import { useEffect, useState } from "react";
import { buildArShareUrl, getArShareStatus } from "../utils/arShare";
import { getLanAppUrl, isLocalHost } from "../utils/publicUrls";
import ARHeadsetQrOverlay from "./ARHeadsetQrOverlay";
import "../styles/ARPage.css";
import "../styles/ARHeadsetQrOverlay.css";

function ARSharePanel({ jobId, modelUrl }) {
  const shareUrl = buildArShareUrl(jobId, modelUrl);
  const status = getArShareStatus(shareUrl);
  const lanApp = getLanAppUrl();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHeadsetQr, setShowHeadsetQr] = useState(false);
  const onLocalhost =
    typeof window !== "undefined" && isLocalHost(window.location.hostname);
  const canShowQr = Boolean(shareUrl && status.level === "ok");

  useEffect(() => {
    if (!shareUrl || !canShowQr) {
      setQrDataUrl("");
      return undefined;
    }

    let cancelled = false;

    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(shareUrl, {
          width: 220,
          margin: 1,
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
  }, [shareUrl, canShowQr]);

  if (!shareUrl) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };

  return (
    <section className="ar-share-panel" aria-label="AR on phone">
      <p className="ar-share-title">AR on your phone</p>

      {onLocalhost && canShowQr && (
        <div className="ar-share-status ar-share-status--info">
          <p className="ar-share-status-title">Presenter mode on PC (localhost)</p>
          <p className="ar-share-status-detail">
            The QR below can still open AR on your phone, even if this page shows localhost.
          </p>
        </div>
      )}

      {onLocalhost && !canShowQr && lanApp && (
        <div className="ar-share-status ar-share-status--error">
          <p className="ar-share-status-title">QR not ready yet</p>
          <p className="ar-share-status-detail">
            Set your PC IP in <code>frontend/.env</code>, then restart <code>npm run dev</code>.
            Or open the app directly as:
          </p>
          <a className="ar-share-lan-link" href={lanApp}>
            {lanApp}
          </a>
        </div>
      )}

      <p className="hint ar-share-desc">
        Scan QR, open the AR page on phone, then tap "View in AR" (Safari / Chrome).
      </p>

      {status.level === "error" && !canShowQr ? (
        <div className="ar-share-status ar-share-status--error">
          <p className="ar-share-status-title">{status.title}</p>
          <p className="ar-share-status-detail">{status.detail}</p>
        </div>
      ) : (
        canShowQr && <p className="hint ar-share-ready">{status.detail}</p>
      )}

      {canShowQr && (
        <button
          type="button"
          className="ar-headset-btn"
          onClick={() => setShowHeadsetQr(true)}
        >
          Scan with AR headset
        </button>
      )}

      {qrDataUrl && canShowQr && (
        <img
          className="ar-share-qr"
          src={qrDataUrl}
          alt="QR code to open AR on phone"
          width={220}
          height={220}
        />
      )}

      {canShowQr && (
        <>
          <a className="ar-share-phone-link" href={shareUrl} target="_blank" rel="noreferrer">
            Open AR link on phone
          </a>
          <p className="ar-share-url-preview">{shareUrl}</p>
        </>
      )}

      {canShowQr && (
        <button type="button" className="ar-link-btn" onClick={copyLink}>
            {copied ? "Link copied ✓" : "Copy link"}
        </button>
      )}

      {canShowQr && (
        <p className="hint ar-share-footnote">
          Connect your phone to the presenter PC hotspot, then scan the QR.
        </p>
      )}

      {showHeadsetQr && canShowQr && (
        <ARHeadsetQrOverlay
          shareUrl={shareUrl}
          onClose={() => setShowHeadsetQr(false)}
        />
      )}
    </section>
  );
}

export default ARSharePanel;
