import { useNavigate, useLocation } from "react-router-dom";
import { MdViewInAr } from "react-icons/md";
import { FaHome, FaPrint } from "react-icons/fa";
import { goToViewerTab } from "../utils/viewerNav";
import "../styles/BottomNav.css";

const ITEMS = [
  { id: "home", label: "Home", path: "/", Icon: FaHome },
  { id: "ar", label: "AR View", path: "/ar", Icon: MdViewInAr },
  { id: "print", label: "3D Print", path: "/print", Icon: FaPrint },
];

function ViewerFooter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  const go = (path) => goToViewerTab(navigate, location, path);

  return (
    <nav className="viewer-footer" aria-label="3D model actions">
      {ITEMS.map(({ id, label, sub, path, Icon }) => (
        <button
          key={id}
          type="button"
          className={[
            "viewer-footer-item",
            pathname === path ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => go(path)}
        >
          <Icon />
          <span>{label}</span>
          <span className="viewer-footer-sub">{sub}</span>
        </button>
      ))}
    </nav>
  );
}

export default ViewerFooter;
