import { useNavigate } from "react-router-dom";
import ErrorLayout from "../components/ErrorLayout";

function ErrorInvalidImagePage() {
  const navigate = useNavigate();

  return (
    <ErrorLayout
      icon="🖼"
      title="Invalid file format"
      message="Please upload a PNG or JPG image only."
      primaryLabel="Choose Another Image"
      primaryAction={() => navigate("/upload")}
      secondaryLabel="Back to Home"
      secondaryAction={() => navigate("/")}
    />
  );
}

export default ErrorInvalidImagePage;
