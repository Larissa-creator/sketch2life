import { downloadFile } from "./download";
import { getPrintShareUrls, modelFilename } from "../services/api";

export function buildPrintShareText({ jobId, objektId, threeMf, farbauswahl }) {
  const id = objektId ?? jobId;
  const lines = ["Sketch2Life — print request", `objekt_id: ${id}`];
  if (threeMf) lines.push(`3MF: ${threeMf}`);
  if (farbauswahl) lines.push(`Color selection: ${farbauswahl}`);
  return lines.join("\n");
}

export async function copyPrintShareText(share) {
  const text = buildPrintShareText(share);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export async function downloadLocalPrintPackage(threeMfUrl, jobId, selectedColor) {
  await downloadFile(threeMfUrl, modelFilename(jobId, "3mf"));
  const { downloadPrintGroupJson } = await import("./farbauswahl");
  downloadPrintGroupJson(jobId, selectedColor ?? "white");
}
