import "../styles/PrimaryButton.css";

function PrimaryButton({
  text,
  icon,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
}) {
  const className = [
    "primary-button",
    `primary-button--${variant}`,
  ].join(" ");

  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {icon ? <span className="button-icon">{icon}</span> : null}
      <span>{text}</span>
    </button>
  );
}

export default PrimaryButton;
