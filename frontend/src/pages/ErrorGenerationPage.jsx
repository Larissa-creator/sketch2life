import { useLocation, useNavigate } from "react-router-dom";
import ErrorLayout from "../components/ErrorLayout";

function ErrorGenerationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const reason = location.state?.reason;

  const isApiKeyMissing = reason === "no-api-key";

  return (
    <ErrorLayout
      icon="⚠"
      title={isApiKeyMissing ? "API key missing" : "Generation failed!"}
      message={
        isApiKeyMissing
          ? "The 3D service is not configured on the PC. Open backend/.env, set API_KEY to your Meshy key, restart the backend, then try again."
          : "Your image could not be converted into a 3D model."
      }
      primaryLabel="Try Again"
      primaryAction={() => navigate("/preview")}
      secondaryLabel="Choose Another Image"
      secondaryAction={() => navigate("/upload")}
      tertiaryLabel="View Tips"
      tertiaryAction={() => navigate("/tips")}
    />
  );
}

export default ErrorGenerationPage;
