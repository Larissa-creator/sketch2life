import { useNavigate } from "react-router-dom";
import { FaCamera, FaUpload, FaLightbulb, FaPlay } from "react-icons/fa";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useSketch } from "../context/SketchContext";
import { DEMO_SKETCH } from "../services/api";
import "../styles/HomePage.css";

const MENU = [
  { label: "Take Photo", icon: <FaCamera />, path: "/camera" },
  { label: "Upload Image", icon: <FaUpload />, path: "/upload" },
  { label: "Tips for better results", icon: <FaLightbulb />, path: "/tips" },
];

/** Einstieg "Sketch to 3D": Foto/Upload einer Skizze -> Image-to-3D. */
function SketchMenuPage() {
  const navigate = useNavigate();
  const { setImage } = useSketch();

  const startDemo = () => {
    setImage(DEMO_SKETCH, "demo");
    navigate("/preview", { replace: false });
  };

  return (
    <>
      <PageHeader title="Sketch to 3D" backTo="/" />

      <div className="page-body home-body">
        <p className="hint">
          Draw something on paper, then take a photo or upload an image of it.
        </p>

        <nav className="home-menu">
          {MENU.map(({ label, icon, path }) => (
            <PrimaryButton
              key={path}
              variant="menu"
              text={label}
              icon={icon}
              onClick={() => navigate(path)}
            />
          ))}
        </nav>

        {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "true") && (
          <button type="button" className="home-demo-btn" onClick={startDemo}>
            <FaPlay aria-hidden />
            Demo mode
          </button>
        )}
      </div>
    </>
  );
}

export default SketchMenuPage;
