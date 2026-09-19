import { useNavigate } from "react-router-dom";
import ErrorLayout from "../components/ErrorLayout";

function ErrorNetworkPage() {
  const navigate = useNavigate();

  return (
    <ErrorLayout
      icon="📡"
      title="Connection failed"
      message="Could not connect to the server. Please try again."
      primaryLabel="Try Again"
      primaryAction={() => navigate("/loading")}
      secondaryLabel="Back to Home"
      secondaryAction={() => navigate("/")}
    />
  );
}

export default ErrorNetworkPage;
