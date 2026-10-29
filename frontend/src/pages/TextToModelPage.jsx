import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { useGeneration } from "../context/GenerationContext";
import { TEXT_PROMPT_MAX, fetchApiHealth, hasLiveApi } from "../services/api";
import { openLoading } from "../utils/navigation";
import "../styles/ProjectsPage.css";
import "../styles/TextToModelPage.css";

const MISSING_KEY_ERROR =
  "Meshy API key missing. On the PC, edit backend/.env and set API_KEY=your key, then restart the backend.";

function TextToModelPage() {
  const navigate = useNavigate();
  const { canGenerate } = useAuth();
  const { startGeneration, activeCount } = useGeneration();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [meshyReady, setMeshyReady] = useState(null);

  useEffect(() => {
    if (!hasLiveApi()) return undefined;
    let cancelled = false;
    fetchApiHealth().then((health) => {
      if (cancelled) return;
      if (!health?.ok) {
        setWarn("Server check failed. Make sure backend and frontend are running.");
        setMeshyReady(false);
        return;
      }
      if (!health.meshy_configured) {
        setMeshyReady(false);
        setError(MISSING_KEY_ERROR);
        return;
      }
      setMeshyReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = prompt.trim();

  const onGenerate = () => {
    setError("");

    if (!canGenerate) {
      setError("The workshop has ended — new models can no longer be generated.");
      return;
    }
    if (!hasLiveApi()) {
      setError("Backend is not configured. Start backend on port 8000 and restart frontend.");
      return;
    }
    if (meshyReady === false) {
      setError(MISSING_KEY_ERROR);
      return;
    }

    const generationId = startGeneration({ prompt: trimmed, imageSource: "text" });
    if (!generationId) {
      navigate("/projects");
      return;
    }
    openLoading(navigate, generationId);
  };

  return (
    <>
      <PageHeader title="Text to 3D" backTo="/" />

      <div className="page-body">
        <label className="text-prompt-label" htmlFor="text-prompt">
          Describe the object you want to create
        </label>
        <textarea
          id="text-prompt"
          className="text-prompt-input"
          rows={5}
          maxLength={TEXT_PROMPT_MAX}
          autoFocus
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <p className="text-prompt-counter">
          {prompt.length} / {TEXT_PROMPT_MAX}
        </p>

        {/* Direkt unter dem Textfeld, damit er bei offener Tastatur sichtbar bleibt */}
        <div className="button-stack text-prompt-actions">
          <PrimaryButton
            text="Generate 3D"
            disabled={!trimmed || meshyReady === false}
            onClick={onGenerate}
          />
        </div>

        {activeCount > 0 && (
          <p className="hint preview-active-hint">
            {activeCount} generation{activeCount > 1 ? "s" : ""} already running. You can start more.
          </p>
        )}
        {warn && <p className="hint preview-warn-hint">{warn}</p>}
        {error && <p className="hint preview-error-hint">{error}</p>}
      </div>
    </>
  );
}

export default TextToModelPage;
