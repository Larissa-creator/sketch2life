import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Schützt die App-Routen: ohne Login (oder Demo) geht es zu /login. */
function RequireAuth() {
  const { status, isDemo } = useAuth();

  if (status === "loading") {
    return (
      <div className="page-body page-body--center">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (status !== "authed" && !isDemo) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default RequireAuth;
