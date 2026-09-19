import { useMemo, useState } from "react";
import { FARBEN, TEIL_PRESETS } from "../constants/farbauswahl";
import { buildColorPreview } from "../utils/farbauswahl";
import "../styles/ColorSelection.css";

const PICKABLE_COLORS = FARBEN.filter((c) => c.label !== "White");

function ColorSelection({ onChange, embedded = false }) {
  const [mode, setMode] = useState(null);
  const [preset, setPreset] = useState("figur");
  const [teil1, setTeil1] = useState("");
  const [farbe1, setFarbe1] = useState("");

  const coloredParts = TEIL_PRESETS[preset].teile.filter((t) => !t.monoOption);
  const firstComplete = Boolean(teil1 && farbe1);

  const farben = useMemo(() => {
    if (mode !== "color") return [];
    if (teil1 && farbe1) return [{ teil: teil1, farbe: farbe1 }];
    return [];
  }, [mode, teil1, farbe1]);

  const preview = useMemo(() => buildColorPreview(farben), [farben]);

  const sync = (next, nextMode = mode) => {
    onChange?.(next, { mode: nextMode });
  };

  const resetColorParts = () => {
    setTeil1("");
    setFarbe1("");
  };

  const selectMono = () => {
    setMode("mono");
    resetColorParts();
    sync([]);
  };

  const selectColor = () => {
    setMode("color");
    setPreset("figur");
    resetColorParts();
    sync([]);
  };

  const switchPreset = (next) => {
    if (next === preset) return;
    setPreset(next);
    resetColorParts();
    sync([]);
  };

  const updateFirst = (teil, farbe) => {
    setTeil1(teil);
    setFarbe1(farbe);
    const list = teil && farbe ? [{ teil, farbe }] : [];
    sync(list);
  };

  const summaryText = () => {
    if (mode === null) {
      return (
        <p className="color-summary-line color-summary-line--hint">
          Choose a print mode
        </p>
      );
    }
    if (mode === "mono") {
      return <p className="color-summary-line">Single-color print ({preview.hautfarbe})</p>;
    }
    if (preview.farben.length > 0) {
      return preview.farben.map((item, i) => (
        <p key={`${item.teil}-${i}`} className="color-summary-line">
          {item.teil} → {item.farbe}
        </p>
      ));
    }
    if (teil1 && !farbe1) {
      return <p className="color-summary-line color-summary-line--hint">Choose a color</p>;
    }
    return (
      <p className="color-summary-line color-summary-line--hint">
        Choose part and color
      </p>
    );
  };

  return (
    <div className={`color-selection${embedded ? " color-selection--embedded" : ""}`}>
      {!embedded && (
        <p className="color-selection-intro">
          How should your model be printed? Choose one colored part.
        </p>
      )}

      <div className="color-mode-choice" role="radiogroup" aria-label="Print mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "mono"}
          className={[
            "color-mode-card",
            mode === "mono" ? "color-mode-card--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={selectMono}
        >
          <span className="color-mode-card-title">Single color (White)</span>
          <span className="color-mode-card-desc">No colored parts</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "color"}
          className={[
            "color-mode-card",
            mode === "color" ? "color-mode-card--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={selectColor}
        >
          <span className="color-mode-card-title">With color</span>
          <span className="color-mode-card-desc">One colored part</span>
        </button>
      </div>

      {mode === "color" && (
        <div className="color-steps">
          <div className="color-preset-choice" role="radiogroup" aria-label="Model type">
            {Object.values(TEIL_PRESETS).map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                className={[
                  "color-preset-card",
                  preset === p.id ? "color-preset-card--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => switchPreset(p.id)}
              >
                <span className="color-preset-card-title">{p.title}</span>
                <span className="color-preset-card-desc">{p.description}</span>
              </button>
            ))}
          </div>

          <section className="color-step">
            <div className="color-step-header">
              <span className="color-step-badge">1</span>
              <p className="color-step-title">Colored part</p>
            </div>
            <PartPicker
              parts={coloredParts}
              selectedTeil={teil1}
              selectedFarbe={farbe1}
              onSelect={(t, f) => updateFirst(t, f)}
            />
            {firstComplete && (
              <p className="color-step-done">
                ✓ {teil1} → {farbe1}
              </p>
            )}
          </section>
        </div>
      )}

      {!embedded && (
        <div className="color-summary">
          <p className="color-summary-title">Summary</p>
          {summaryText()}
        </div>
      )}

      {embedded && <div className="color-summary-inline">{summaryText()}</div>}
    </div>
  );
}

function PartPicker({ parts, selectedTeil, selectedFarbe, onSelect }) {
  const pickTeil = (label) => {
    if (label === selectedTeil) return;
    onSelect(label, "");
  };

  return (
    <div className="color-picker-block">
      <p className="color-label">Choose part</p>
      <div className="color-part-chips">
        {parts.map((p) => (
          <button
            key={p.id}
            type="button"
            className={[
              "color-part-chip",
              selectedTeil === p.label ? "color-part-chip--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => pickTeil(p.label)}
            title={p.hint ?? undefined}
          >
            {p.label}
            {p.hint && <span className="color-part-chip-hint">{p.hint}</span>}
          </button>
        ))}
      </div>

      {selectedTeil && (
        <>
          <p className="color-label color-label--spaced">
            Color for "{selectedTeil}"
          </p>
          <div className="color-swatches">
            {PICKABLE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={[
                  "color-swatch-btn",
                  selectedFarbe === c.label ? "color-swatch-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--swatch": c.swatch }}
                onClick={() => onSelect(selectedTeil, c.label)}
                aria-label={c.label}
                title={c.label}
              >
                <span className="color-swatch-dot" />
                <span className="color-swatch-name">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ColorSelection;
