import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import "../styles/PageHeader.css";

function PageHeader({ title, showBack = true, backTo = null, backReplace = false, onBack = null }) {
  const navigate = useNavigate();

  const handleBack = () => {
    // Zurück: onBack > backTo > Browser-History > Startseite
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) {
      navigate(backTo, backReplace ? { replace: true } : undefined);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <header className="page-header">
      <div className="page-header-side">
        {showBack ? (
          <button
            type="button"
            className="page-header-back"
            onClick={handleBack}
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
        ) : null}
      </div>
      <h1 className="page-header-title">{title}</h1>
      <div className="page-header-side" aria-hidden />
    </header>
  );
}

export default PageHeader;
