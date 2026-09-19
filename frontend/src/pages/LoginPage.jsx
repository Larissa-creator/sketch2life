import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FaPlay } from "react-icons/fa";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useSketch } from "../context/SketchContext";
import { DEMO_SKETCH } from "../services/api";
import "../styles/HomePage.css";
import "../styles/LoginPage.css";

const SHOW_DEMO =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "true";

function LoginPage() {
  const navigate = useNavigate();
  const { status, login, enterDemo } = useAuth();
  const { setImage } = useSketch();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "authed") {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!code.trim() || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await login(code.trim(), name.trim());
      navigate("/", { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Login failed. Check the workshop code and your connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startDemo = () => {
    enterDemo();
    setImage(DEMO_SKETCH, "demo");
    navigate("/preview", { replace: false });
  };

  return (
    <>
      <PageHeader title="Login" showBack={false} />

      <div className="page-body login-body">
        <div className="home-logo" aria-label="Sketch2Life">
            <span className="home-logo-text">Sketch</span>
            <span className="home-logo-badge">2</span>
             <span className="home-logo-text">Life</span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-label" htmlFor="login-code">
            Workshop code
          </label>
          <input
            id="login-code"
            className="login-input"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            placeholder="e.g. blaue-katze-123"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />

          <label className="login-label" htmlFor="login-name">
            Your first name
          </label>
          <input
            id="login-name"
            className="login-input"
            type="text"
            autoComplete="given-name"
            maxLength={40}
            placeholder="e.g. Mia"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          {error && <p className="hint login-error">{error}</p>}

          <PrimaryButton
            type="submit"
            text={busy ? "Logging in…" : "Start"}
            disabled={!code.trim() || !name.trim() || busy}
          />
        </form>

        <p className="hint login-hint">
          You get the workshop code from your workshop host. Use the same name
          again later to see your models.
        </p>

        {SHOW_DEMO && (
          <button type="button" className="home-demo-btn" onClick={startDemo}>
            <FaPlay aria-hidden />
            Demo mode
          </button>
        )}

        <button
          type="button"
          className="login-admin-link"
          onClick={() => navigate("/admin")}
        >
          Admin
        </button>
      </div>
    </>
  );
}

export default LoginPage;
