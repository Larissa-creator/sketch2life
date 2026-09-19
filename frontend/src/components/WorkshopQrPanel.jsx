import { useEffect, useState } from "react";
import { checkApiHealth } from "../services/api";
import { getLanAppUrl, isLocalHost, resolvePublicOrigin } from "../utils/publicUrls";
import { isMobile } from "../utils/device";
import "../styles/WorkshopQrPanel.css";

function WorkshopQrPanel() {
  const mobile = typeof window !== "undefined" ? isMobile() : false;
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [backendOk, setBackendOk] = useState(null);

  const onLocalhost =
    typeof window !== "undefined" &&
    isLocalHost(window.location.hostname);

  const joinUrl = (() => {
    const lan = getLanAppUrl();
    if (onLocalhost && lan) return lan;
    const origin = resolvePublicOrigin();
    if (!isLocalHost(new URL(origin).hostname)) return origin;
    return lan;
  })();

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl("");
      return undefined;
    }

    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(joinUrl, {
          width: 180,
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
  }, [joinUrl]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      checkApiHealth().then((ok) => {
        if (!cancelled) setBackendOk(ok);
      });
    };
    tick();
    const id = setInterval(tick, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const copyUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };

  const showPanel =
    import.meta.env.VITE_SHOW_WORKSHOP_QR === "true" ||
    joinUrl ||
    onLocalhost;

  // QR-Panel nur auf dem Präsentations-PC, auf Handys ausblenden.
  if (mobile) return null;
  if (!showPanel) return null;

  return (
    <section className="workshop-qr" aria-label="Workshop join app">
      <p className="workshop-qr-title">Workshop - Join app</p>

      {onLocalhost && joinUrl && (
        <p className="workshop-qr-hint workshop-qr-hint--presenter">
          Presenter tip: open <a href={joinUrl}>{joinUrl}</a> instead of localhost.
        </p>
      )}

      {!joinUrl ? (
        <p className="workshop-qr-hint workshop-qr-hint--error">
          QR is unavailable. Run <code>start-dev.ps1</code> from the project folder
          (with Windows hotspot enabled).
        </p>
      ) : (
        <>
          <p className="workshop-qr-hint">
            Participants: connect to the <strong>same Wi-Fi network</strong> as this PC
            (hotspot or classroom WLAN), then scan the QR or open the link below.
          </p>
          {qrDataUrl && (
            <img
              className="workshop-qr-img"
              src={qrDataUrl}
              alt="QR code to join"
              width={180}
              height={180}
            />
          )}
          <p className="workshop-qr-url">{joinUrl}</p>
          <button type="button" className="workshop-qr-copy" onClick={copyUrl}>
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
          <p className="workshop-qr-footnote">
            Presenter PC: any internet connection for 3D generation; phones use the LAN IP below.
            Services listen on 0.0.0.0 (ports 5173, 8000, 3005).
            {backendOk === true && (
              <span className="workshop-qr-backend workshop-qr-backend--ok">
                {" "}Backend reachable ✓
              </span>
            )}
            {backendOk === false && (
              <span className="workshop-qr-backend workshop-qr-backend--bad">
                {" "}Backend unreachable - start uvicorn.
              </span>
            )}
            <br />
            iPhone: use "Upload Image" if camera capture fails.
          </p>
        </>
      )}
    </section>
  );
}

export default WorkshopQrPanel;
