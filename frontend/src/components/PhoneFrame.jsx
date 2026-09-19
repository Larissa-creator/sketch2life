import { Outlet } from "react-router-dom";
import "../styles/PhoneFrame.css";


function PhoneFrame() {
  return (
    <div className="app-shell">
      <div className="phone-frame">
        <div className="phone-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default PhoneFrame;
