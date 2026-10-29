import { useNavigate } from "react-router-dom";
import { FaPencilAlt, FaKeyboard, FaFolder } from "react-icons/fa";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import WorkshopQrPanel from "../components/WorkshopQrPanel";
import "../styles/HomePage.css";

const GENERATE_MENU = [
  { label: "Sketch to 3D", icon: <FaPencilAlt />, path: "/sketch" },
  { label: "Text to 3D", icon: <FaKeyboard />, path: "/text" },
];

const VIEW_MENU = [
  { label: "Last Projects", icon: <FaFolder />, path: "/projects" },
];

function HomePage() {
  const navigate = useNavigate();
  const { name, canGenerate, workshopStatus, isDemo, logout } = useAuth();

  // Nach dem Workshop: nur noch ansehen, keine neuen Modelle.
  const menu = canGenerate || isDemo ? [...GENERATE_MENU, ...VIEW_MENU] : VIEW_MENU;

  return (
    <>
      <PageHeader title="Home Page" showBack={false} />

      <div className="page-body home-body">
        <div className="home-logo" aria-label="Sketch2Life">
            <span className="home-logo-text">Sketch</span>
            <span className="home-logo-badge">2</span>
            <span className="home-logo-text">Life</span>
        </div>

        <WorkshopQrPanel />

        {name && (
          <p className="hint home-session-line">
            Hi {name}!{" "}
            {workshopStatus === "readonly" &&
              "The workshop has ended — you can still view your models."}
          </p>
        )}

        <nav className="home-menu">
          {menu.map(({ label, icon, path }) => (
            <PrimaryButton
              key={path}
              variant="menu"
              text={label}
              icon={icon}
              onClick={() => navigate(path)}
            />
          ))}
        </nav>

        <button
          type="button"
          className="home-logout-btn"
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
        >
          Log out
        </button>
      </div>
    </>
  );
}

export default HomePage;
