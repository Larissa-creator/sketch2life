import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCameraRotate, FaUpload } from "react-icons/fa6";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { useSketch } from "../context/SketchContext";
import { canUseLiveCamera, needsNativeCamera } from "../utils/camera";
import { prepareUploadFile } from "../utils/image";
import "../styles/CameraPage.css";

function CameraPage() {
  const navigate = useNavigate();
  const { setImage } = useSketch();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const backInputRef = useRef(null);
  const uploadRef = useRef(null);

  const useNative = needsNativeCamera();

  const [capturedUrl, setCapturedUrl] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState("environment");

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const attachStream = async (stream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraReady(true);
    }
  };

  const startCamera = async (mode) => {
    if (!canUseLiveCamera()) {
      setCameraError(null);
      setCameraReady(false);
      return false;
    }

    stopStream();
    setCameraReady(false);
    setCameraError(null);

    const attempts = [
      { video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    ];

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          ...constraints,
          audio: false,
        });
        await attachStream(stream);
        return true;
      } catch {
      }
    }

    setCameraError(
      "Camera access denied. Allow camera in the browser, or use “Take photo”.",
    );
    return false;
  };

  useEffect(() => {
    if (!useNative) {
      startCamera(facingMode);
    }
    return () => stopStream();
  }, [facingMode, useNative]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedUrl(dataUrl);
    stopStream();
  };

  const openNativeCamera = () => {
    backInputRef.current?.click();
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

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

  const onContinue = async () => {
    if (!capturedUrl) return;
    const file = await prepareUploadFile(capturedUrl, null);
    setImage(capturedUrl, "camera", file);
    navigate("/preview");
  };

  const retake = () => {
    setCapturedUrl(null);
    if (useNative) {
      openNativeCamera();
    } else {
      startCamera(facingMode);
    }
  };

  return (
    <>
      <PageHeader title="Take Photo" backTo="/" />

      <div className="page-body camera-body">
        {useNative ? (
          <div className="camera-native-panel">
            <div className="camera-viewport camera-viewport--placeholder">
              <p className="camera-native-title">📷 Camera</p>
              <p className="camera-native-hint">
                Tap "Take photo" to open your camera app. There you can switch between
                back and front camera.
              </p>
            </div>

            <input
              ref={backInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden-input"
              onChange={onNativeCapture}
            />

            <PrimaryButton text="Take photo" onClick={openNativeCamera} />
            <PrimaryButton
              variant="secondary"
              text="Upload image"
              icon={<FaUpload />}
              onClick={() => uploadRef.current?.click()}
            />
          </div>
        ) : (
          <>
            <div className="camera-viewport">
              {capturedUrl ? (
                <img src={capturedUrl} alt="Captured sketch" className="camera-preview-img" />
              ) : cameraError ? (
                <div className="camera-fallback">
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className="camera-retry-btn"
                    onClick={() => startCamera(facingMode)}
                  >
                    Retry camera
                  </button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  className="camera-video"
                  playsInline
                  muted
                  autoPlay
                />
              )}

              {!capturedUrl && !cameraError && (
                <>
                  <p className="camera-overlay-hint">Position your sketch inside the frame</p>
                  <button
                    type="button"
                    className="camera-flip-btn"
                    aria-label="Switch camera"
                    onClick={flipCamera}
                  >
                    <FaCameraRotate />
                  </button>
                </>
              )}
            </div>

            {capturedUrl ? (
              <div className="button-stack">
                <PrimaryButton text="Continue" onClick={onContinue} />
                <PrimaryButton variant="secondary" text="Retake" onClick={retake} />
              </div>
            ) : (
              <>
                <PrimaryButton
                  variant="secondary"
                  text="Upload image"
                  icon={<FaUpload />}
                  onClick={() => uploadRef.current?.click()}
                />
                <button
                  type="button"
                  className="camera-shutter"
                  aria-label="Take photo"
                  disabled={!cameraReady}
                  onClick={capturePhoto}
                />
              </>
            )}
          </>
        )}

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
