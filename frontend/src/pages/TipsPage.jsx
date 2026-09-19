import { useNavigate } from "react-router-dom";
import { FaLightbulb, FaCamera, FaSun, FaImage } from "react-icons/fa";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import "../styles/TipsPage.css";

const TIPS = [
  { icon: <FaSun />, text: "Use good lighting on your sketch" },
  { icon: <FaCamera />, text: "Keep the drawing centered in the frame" },
  { icon: <FaImage />, text: "Avoid blurry or dark photos" },
  { icon: <FaLightbulb />, text: "Use white paper if possible" },
];

function TipsPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Tips for better results" backTo="/" />

      <div className="page-body">
        <p className="hint">
          Follow these recommendations for cleaner 3D models:
        </p>

        <ul className="tips-list">
          {TIPS.map((tip) => (
            <li key={tip.text} className="tip-card">
              <span className="tip-icon">{tip.icon}</span>
              <span className="tip-text">{tip.text}</span>
            </li>
          ))}
        </ul>

        <div className="button-stack">
          <PrimaryButton
            text="Start Scanning"
            icon={<FaCamera />}
            onClick={() => navigate("/camera")}
          />
        </div>
      </div>
    </>
  );
}

export default TipsPage;
