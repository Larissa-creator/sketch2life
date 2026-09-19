import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import {
  adminCreateWorkshop,
  adminListModels,
  adminListWorkshops,
  adminPatchWorkshop,
  deleteServerProject,
  getGlbDownloadUrl,
  getFarbauswahlDownloadUrl,
  getSketchThumbUrl,
  getThreeMfDownloadUrl,
  getUsdzDownloadUrl,
} from "../services/api";
import "../styles/ViewerPage.css";
import "../styles/LoginPage.css";
import "../styles/AdminPage.css";

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

function AdminLoginForm() {
  const { adminLogin } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminLogin(password);
    } catch (err) {
      setError(errorText(err, "Login failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-login" onSubmit={onSubmit}>
      <label className="login-label" htmlFor="admin-password">
        Admin password
      </label>
      <input
        id="admin-password"
        className="login-input"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error && <p className="hint login-error">{error}</p>}
      <PrimaryButton
        type="submit"
        text={busy ? "Logging in…" : "Log in"}
        disabled={!password || busy}
      />
    </form>
  );
}

function WorkshopModels({ workshop, onChanged }) {
  const [models, setModels] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminListModels(workshop.id)
      .then((data) => {
        if (!cancelled) setModels(data.models ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, "Could not load models."));
      });
    return () => {
      cancelled = true;
    };
  }, [workshop.id, reloadKey]);

  const onDelete = async (jobId) => {
    if (!window.confirm("Delete this model (files + sketch)?")) return;
    if (await deleteServerProject(jobId)) {
      setReloadKey((key) => key + 1);
      onChanged();
    }
  };

  if (error) return <p className="hint login-error">{error}</p>;
  if (!models) return <p className="hint">Loading models…</p>;
  if (models.length === 0) return <p className="hint">No models yet.</p>;

  return (
    <ul className="admin-models">
      {models.map((model) => (
        <li key={model.job_id} className="admin-model">
          <span className="admin-model-thumb">
            {model.has_sketch ? (
              <img src={getSketchThumbUrl(model.job_id)} alt="" />
            ) : (
              <span aria-hidden>🖼</span>
            )}
          </span>
          <span className="admin-model-info">
            <strong>{model.attendee}</strong>
            <span className="admin-model-meta">
              {new Date(model.created_at).toLocaleString()}
              {" · "}
              {model.color ? (
                <span className="admin-color admin-color--picked">
                  color: {model.color}
                </span>
              ) : (
                <span className="admin-color">no color yet</span>
              )}
            </span>
            <span className="admin-model-links">
              {model.has_glb && (
                <a href={getGlbDownloadUrl(model.job_id)}>GLB</a>
              )}
              {model.has_glb && (
                <a href={getUsdzDownloadUrl(model.job_id)}>USDZ</a>
              )}
              {model.has_3mf && (
                <a href={getThreeMfDownloadUrl(model.job_id)}>3MF</a>
              )}
              {model.color && (
                <a href={getFarbauswahlDownloadUrl(model.job_id)}>Color JSON</a>
              )}
            </span>
          </span>
          <button
            type="button"
            className="admin-delete"
            aria-label="Delete model"
            onClick={() => onDelete(model.job_id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function WorkshopList() {
  const [workshops, setWorkshops] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState("");
  const [cap, setCap] = useState(100);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    adminListWorkshops()
      .then((list) => {
        if (!cancelled) setWorkshops(list);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, "Could not load workshops."));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const onCreate = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      await adminCreateWorkshop(name.trim(), Number(cap) || 100);
      setName("");
      reload();
    } catch (err) {
      setError(errorText(err, "Could not create the workshop."));
    }
  };

  const patch = async (workshopId, body) => {
    setError("");
    try {
      await adminPatchWorkshop(workshopId, body);
      reload();
    } catch (err) {
      setError(errorText(err, "Update failed."));
    }
  };

  const copyCode = async (workshop) => {
    try {
      await navigator.clipboard.writeText(workshop.code);
      setCopiedId(workshop.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };

  if (!workshops) return <p className="hint">Loading workshops…</p>;

  return (
    <>
      <form className="admin-create" onSubmit={onCreate}>
        <input
          className="login-input"
          type="text"
          placeholder="Workshop name (e.g. School class 4b)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="admin-create-row">
          <label className="admin-cap-label" htmlFor="admin-cap">
            Generation cap
          </label>
          <input
            id="admin-cap"
            className="login-input admin-cap-input"
            type="number"
            min={1}
            max={10000}
            value={cap}
            onChange={(event) => setCap(event.target.value)}
          />
          <PrimaryButton type="submit" text="Create" disabled={!name.trim()} />
        </div>
      </form>

      {error && <p className="hint login-error">{error}</p>}

      <ul className="admin-workshops">
        {workshops.map((workshop) => (
          <li key={workshop.id} className="admin-workshop">
            <div className="admin-workshop-head">
              <div className="admin-workshop-title">
                <strong>{workshop.name}</strong>
                <span
                  className={[
                    "admin-status",
                    workshop.status === "active"
                      ? "admin-status--active"
                      : "admin-status--readonly",
                  ].join(" ")}
                >
                  {workshop.status === "active" ? "Active" : "Read-only"}
                </span>
              </div>
              <button
                type="button"
                className="admin-code"
                title="Copy workshop code"
                onClick={() => copyCode(workshop)}
              >
                {workshop.code}
                <span className="admin-code-copy">
                  {copiedId === workshop.id ? "copied ✓" : "copy"}
                </span>
              </button>
            </div>

            <p className="admin-workshop-stats">
              Models: {workshop.model_count} · Generations:{" "}
              {workshop.generations_used}/{workshop.generation_cap} ·{" "}
              <strong>
                Colors picked: {workshop.colors_picked}/{workshop.job_count}
              </strong>
            </p>

            <div className="admin-workshop-actions">
              <button
                type="button"
                className="admin-action"
                onClick={() =>
                  patch(workshop.id, {
                    status:
                      workshop.status === "active" ? "readonly" : "active",
                  })
                }
              >
                {workshop.status === "active"
                  ? "End workshop (read-only)"
                  : "Reactivate"}
              </button>
              <button
                type="button"
                className="admin-action"
                onClick={() => {
                  if (window.confirm("Generate a new code? The old one stops working.")) {
                    patch(workshop.id, { rotate_code: true });
                  }
                }}
              >
                Rotate code
              </button>
              <button
                type="button"
                className="admin-action"
                onClick={() =>
                  setOpenId(openId === workshop.id ? null : workshop.id)
                }
              >
                {openId === workshop.id ? "Hide models" : "Show models"}
              </button>
            </div>

            {openId === workshop.id && (
              <WorkshopModels workshop={workshop} onChanged={reload} />
            )}
          </li>
        ))}
      </ul>

      {workshops.length === 0 && (
        <p className="hint">No workshops yet — create the first one above.</p>
      )}
    </>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const { status, role, logout } = useAuth();
  const isAdmin = status === "authed" && role === "admin";

  return (
    <div className="viewer-page">
      <PageHeader title="Workshop Admin" onBack={() => navigate("/login")} />

      <div className="page-body admin-body">
        {status === "loading" ? (
          <p className="hint">Loading…</p>
        ) : isAdmin ? (
          <>
            <WorkshopList />
            <button
              type="button"
              className="login-admin-link"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <AdminLoginForm />
        )}
      </div>
    </div>
  );
}

export default AdminPage;
