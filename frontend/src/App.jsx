import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SketchProvider } from "./context/SketchContext";
import { GenerationProvider } from "./context/GenerationContext";
import PhoneFrame from "./components/PhoneFrame";
import RequireAuth from "./components/RequireAuth";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import HomePage from "./pages/HomePage";
import CameraPage from "./pages/CameraPage";
import UploadPage from "./pages/UploadPage";
import PreviewPage from "./pages/PreviewPage";
import LoadingPage from "./pages/LoadingPage";
import ViewerPage from "./pages/ViewerPage";
import ARPage from "./pages/ARPage";
import PrintPage from "./pages/PrintPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectSketchPage from "./pages/ProjectSketchPage";
import TipsPage from "./pages/TipsPage";
import ErrorGenerationPage from "./pages/ErrorGenerationPage";
import ErrorNetworkPage from "./pages/ErrorNetworkPage";
import ErrorTimeoutPage from "./pages/ErrorTimeoutPage";
import ErrorInvalidImagePage from "./pages/ErrorInvalidImagePage";
function App() {
  return (
    <AuthProvider>
      <SketchProvider>
        <GenerationProvider>
          <BrowserRouter>
          <Routes>
            <Route element={<PhoneFrame />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/camera" element={<CameraPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/preview" element={<PreviewPage />} />
                <Route path="/loading" element={<LoadingPage />} />
                <Route path="/viewer" element={<ViewerPage />} />
                <Route path="/ar" element={<ARPage />} />
                <Route path="/print" element={<PrintPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/project" element={<ProjectSketchPage />} />
                <Route path="/tips" element={<TipsPage />} />
                <Route path="/error" element={<ErrorGenerationPage />} />
                <Route path="/error/generation" element={<ErrorGenerationPage />} />
                <Route path="/error/network" element={<ErrorNetworkPage />} />
                <Route path="/error/timeout" element={<ErrorTimeoutPage />} />
                <Route path="/error/invalid-image" element={<ErrorInvalidImagePage />} />
              </Route>
            </Route>
          </Routes>
          </BrowserRouter>
        </GenerationProvider>
      </SketchProvider>
    </AuthProvider>
  );
}

export default App;
