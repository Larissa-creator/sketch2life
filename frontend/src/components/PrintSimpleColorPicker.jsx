import { PRINT_MODEL_COLORS } from "../constants/farbauswahl";
import "../styles/PrintSimpleColorPicker.css";

function PrintSimpleColorPicker({ value, onChange, disabled = false }) {
  const selected = PRINT_MODEL_COLORS.find((c) => c.id === value) ?? PRINT_MODEL_COLORS[0];

  return (
    <section
      className={[
        "print-simple-colors",
        disabled ? "print-simple-colors--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Color selection"
    >
      <p className="print-simple-colors-title">Color selection</p>
      <p className="print-simple-colors-desc">
        {disabled
          ? "The color choice is locked."
          : "Choose one color for your whole model"}
      </p>

      <div className="print-simple-swatches" role="radiogroup" aria-label="Model color">
        {PRINT_MODEL_COLORS.map((color) => {
          const active = value === color.id;
          return (
            <button
              key={color.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={color.label}
              className={[
                "print-simple-swatch",
                active ? "print-simple-swatch--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ "--swatch": color.swatch }}
              disabled={disabled}
              onClick={() => onChange(color.id)}
            >
              <span className="print-simple-swatch-dot" />
              {active && <span className="print-simple-swatch-check" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      <p className="print-simple-selected">
        Selected color: <strong>{selected.label}</strong>
      </p>
    </section>
  );
}

export default PrintSimpleColorPicker;
