import { buildColorPreview, getFarbeSwatch } from "../utils/farbauswahl";
import "../styles/PrintColorPreview.css";

function PrintColorPreview({ imageUrl, farben, mode }) {
  if (!mode) return null;

  const preview = buildColorPreview(farben);
  const isMono = mode === "mono" || preview.farben.length === 0;
  const rows = isMono
    ? [{ teil: "Whole model", farbe: preview.hautfarbe }]
    : [
        ...preview.farben,
        { teil: "Rest of model", farbe: preview.hautfarbe },
      ];

  return (
    <section className="print-color-preview" aria-label="Print preview">
      <p className="print-color-preview-title">Print preview</p>
      <p className="print-color-preview-desc">
        Approximate filament color distribution. Review before sending.
      </p>

      <div className="print-color-preview-body">
        {imageUrl && (
          <div className="print-color-preview-sketch">
            <img src={imageUrl} alt="Your sketch" />
            <span>Your sketch</span>
          </div>
        )}

        <div className="print-color-preview-mock" aria-hidden>
          {rows.map((row, i) => (
            <div
              key={`${row.teil}-${i}`}
              className="print-color-preview-band"
              style={{
                "--band-color": getFarbeSwatch(row.farbe),
                "--band-flex": isMono ? 3 : i === rows.length - 1 ? 2 : 1,
              }}
            />
          ))}
        </div>
      </div>

      <ul className="print-color-preview-legend">
        {rows.map((row, i) => (
          <li key={`${row.teil}-${i}`} className="print-color-preview-row">
            <span
              className="print-color-preview-swatch"
              style={{ background: getFarbeSwatch(row.farbe) }}
              aria-hidden
            />
            <span className="print-color-preview-label">
              <strong>{row.teil}</strong>
              <span>{row.farbe}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="print-color-preview-note">
        The exact color placement is finalized by the 3D print team.
        This preview shows your <strong>selection</strong>, not the final mesh.
      </p>
    </section>
  );
}

export default PrintColorPreview;
