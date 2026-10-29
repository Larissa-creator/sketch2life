import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaUpload } from "react-icons/fa6";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useSketch } from "../context/SketchContext";
import { prepareUploadFile } from "../utils/image";
import "../styles/CameraPage.css";

// Native Kamera-App über <input capture> - funktioniert auf iOS und Android,
// auch ohne HTTPS. Desktop-Browser zeigen stattdessen die Dateiauswahl.
function CameraPage() {
  const navigate = useNavigate();
  const { setImage } = useSketch();
  const cameraInputRef = useRef(null);
  const uploadRef = useRef(null);

  const onNativeCapture = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const prepared = await prepareUploadFile(url, file);
    setImage(url, "camera", prepared ?? file);
    navigate("/preview");
  };

  const onUploadFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImage(url, "camera", file);
    navigate("/preview");
  };

  return (
    <>
      <PageHeader title="Take Photo" backTo="/sketch" />

      <div className="page-body camera-body">
        <div className="camera-native-panel">
          <div className="camera-viewport camera-viewport--placeholder">
            <p className="camera-native-title">📷 Camera</p>
            <p className="camera-native-hint">
              Tap "Take photo" to open your camera app. There you can switch between
              back and front camera.
            </p>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden-input"
            onChange={onNativeCapture}
          />

          <PrimaryButton text="Take photo" onClick={() => cameraInputRef.current?.click()} />
          <PrimaryButton
            variant="secondary"
            text="Upload image"
            icon={<FaUpload />}
            onClick={() => uploadRef.current?.click()}
          />
        </div>

        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden-input"
          onChange={onUploadFile}
        />
      </div>
    </>
  );
}

export default CameraPage;
