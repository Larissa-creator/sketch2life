import { useNavigate } from "react-router-dom";
import PageHeader from "./PageHeader";
import PrimaryButton from "./PrimaryButton";
import "../styles/ErrorScreen.css";


function ErrorLayout({
  icon = "⚠",
  title,
  message,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
  tertiaryLabel,
  tertiaryAction,
}) {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Error" />

      <div className="page-body page-body--center">
        <span className="error-icon" aria-hidden>
          {icon}
        </span>
        <h2 className="error-title">{title}</h2>
        <p className="hint">{message}</p>

        <div className="button-stack">
          {primaryLabel && (
            <PrimaryButton
              text={primaryLabel}
              onClick={primaryAction ?? (() => navigate("/preview"))}
            />
          )}
          {secondaryLabel && (
            <PrimaryButton
              variant="secondary"
              text={secondaryLabel}
              onClick={secondaryAction ?? (() => navigate("/upload"))}
            />
          )}
          {tertiaryLabel && (
            <PrimaryButton
              variant="secondary"
              text={tertiaryLabel}
              onClick={tertiaryAction ?? (() => navigate("/tips"))}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default ErrorLayout;
