import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import PrintSimpleColorPicker from "../components/PrintSimpleColorPicker";
import ViewerFooter from "../components/ViewerFooter";
import { useAuth } from "../context/AuthContext";
import { useSketch } from "../context/SketchContext";
import { useHydrateViewerJob } from "../hooks/useHydrateViewerJob";
import { DEFAULT_PRINT_COLOR } from "../constants/farbauswahl";
import {
  DEMO_JOB_ID,
  getThreeMfDownloadUrl,
  logPrintPageVisit,
  logPrintJobSent,
  modelFilename,
  savePrintColor,
  submitPrintPackage,
} from "../services/api";
import { downloadFile } from "../utils/download";
import { backFromViewerTab, backToProjects } from "../utils/viewerNav";
import "../styles/ViewerPage.css";
import "../styles/PrintPage.css";
import "../styles/PrintSimpleColorPicker.css";


function PrintPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, canGenerate } = useAuth();
  const { printModelUrl, jobId, imageSource, selectedPrintColor, setSelectedPrintColor } = useSketch();
  const { effectiveJobId: urlJobId } = useHydrateViewerJob();
  const effectiveJobId = jobId ?? urlJobId ?? (imageSource === "demo" ? DEMO_JOB_ID : null);
  const isDemo = effectiveJobId === DEMO_JOB_ID || imageSource === "demo";
  const isAdmin = role === "admin";
  // Nach dem Workshop ist die Farbwahl eingefroren (Backend erzwingt das auch).
  const colorLocked = !isDemo && !isAdmin && !canGenerate;
  const [selectedColor, setSelectedColor] = useState(selectedPrintColor ?? DEFAULT_PRINT_COLOR,);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    logPrintPageVisit(effectiveJobId);
  }, [effectiveJobId]);

  const threeMfUrl = getThreeMfDownloadUrl(effectiveJobId) ?? printModelUrl;

  const onColorChange = (colorId) => {
    if (colorLocked) return;
    setSelectedColor(colorId);
    setSelectedPrintColor(colorId);
    setSent(false);
  };

  const download3mf = async () => {
    if (!threeMfUrl) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadFile(threeMfUrl, modelFilename(effectiveJobId, "3mf"));
    } catch {
      setDownloadError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  /** Teilnehmende speichern nur die Farbe - gedruckt wird manuell vom Team. */
  const saveColor = async () => {
    if (!effectiveJobId) return;
    setSending(true);
    setSendError("");
    setSent(false);
    try {
      if (isDemo) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        await logPrintJobSent(effectiveJobId, selectedColor);
        setSent(true);
        return;
      }
      await savePrintColor(effectiveJobId, selectedColor);
      await logPrintJobSent(effectiveJobId, selectedColor);
      setSent(true);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setSendError(
        typeof detail === "string"
          ? detail
          : "Could not save the color. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  /** Admin im LAN-Betrieb: kompletter Druckauftrag an den Print-Service. */
  const sendToPrint = async () => {
    if (!effectiveJobId) return;
    setSending(true);
    setSendError("");
    setSent(false);
    try {
      await submitPrintPackage(effectiveJobId, selectedColor);
      await logPrintJobSent(effectiveJobId, selectedColor);
      setSent(true);
    } catch (error) {
      if (error.kiSaved) {
        setSent(true);
      }
      setSendError(error.message ?? "Send failed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="viewer-page">
      <PageHeader
        title="3D Print"
        onBack={() => {
          if (location.search.includes("job=")) {
            backFromViewerTab(navigate, location);
          } else {
            backToProjects(navigate, location);
          }
        }}
      />

      <div className="page-body page-body--with-footer print-body">
        <div className="print-hero">
          <span className="print-hero-icon" aria-hidden>
            🖨
          </span>
          <p className="print-hero-title">
            {isAdmin ? "Ready to print" : "Your model will be printed"}
          </p>
          <p className="print-desc">
            {colorLocked
              ? "The workshop has ended — the color choice is locked."
              : isAdmin
                ? "Choose color first, then send the print request."
                : "Pick the color for your printed figure and save it."}
          </p>
        </div>

        <PrintSimpleColorPicker
          value={selectedColor}
          onChange={onColorChange}
          disabled={colorLocked}
        />

        {sent && !sendError && (
          <p className="print-success">
            {isDemo
              ? "Demo: color saved (no real printer)."
              : isAdmin
                ? "Print request sent. The print team will handle your model."
                : "Color saved! The print team will print your model in this color."}
          </p>
        )}

        <div className="print-actions print-actions--bottom">
          {!colorLocked && (
            <PrimaryButton
              text={
                sending
                  ? "Saving..."
                  : isAdmin
                    ? "Send to 3D print"
                    : "Save color"
              }
              disabled={!effectiveJobId || sending || sent}
              onClick={isAdmin ? sendToPrint : saveColor}
            />
          )}
          {(isAdmin || isDemo) && (
            <PrimaryButton
              text={downloading ? "Downloading..." : "Download 3MF file"}
              variant="secondary"
              disabled={!threeMfUrl || downloading}
              onClick={download3mf}
            />
          )}
          {sendError && (
            <p className="hint print-download-error print-download-error--multiline">{sendError}</p>
          )}
          {downloadError && <p className="hint print-download-error">{downloadError}</p>}
        </div>
      </div>
      <ViewerFooter />
    </div>
  );
}

export default PrintPage;
