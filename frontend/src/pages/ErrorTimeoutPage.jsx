import { useNavigate } from "react-router-dom";
import ErrorLayout from "../components/ErrorLayout";

function ErrorTimeoutPage() {
  const navigate = useNavigate();

  return (
    <ErrorLayout
      icon="⏱"
      title="Still generating"
      message="This took longer than expected on your phone, but the server may still be working. Wait 2–3 minutes, then open Last Projects — your model may already be there."
      primaryLabel="Open Last Projects"
      primaryAction={() => navigate("/projects")}
      secondaryLabel="Try Again"
      secondaryAction={() => navigate("/preview")}
      tertiaryLabel="Back to Home"
      tertiaryAction={() => navigate("/")}
    />
  );
}

export default ErrorTimeoutPage;
