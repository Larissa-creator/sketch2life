import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import PrimaryButton from "../components/PrimaryButton";
import { FaImage } from "react-icons/fa";
import { useSketch } from "../context/SketchContext";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function UploadPage() {
  const navigate = useNavigate();
  const { setImage } = useSketch();
  const inputRef = useRef(null);

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      navigate("/error/invalid-image");
      return;
    }

    setImage(URL.createObjectURL(file), "upload", file);
    navigate("/preview");
  };

  return (
    <>
      <PageHeader title="Upload image" backTo="/" />

      <div className="page-body">
        <p className="hint">
          Select an image file to start the 3D generation process.
        </p>

        <div className="image-frame">
          <FaImage size={48} color="#888" />
          <span>PNG or JPG</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden-input"
          onChange={onFile}
        />

        <div className="button-stack">
          <PrimaryButton
            text="Choose file"
            onClick={() => inputRef.current?.click()}
          />
        </div>
      </div>
    </>
  );
}

export default UploadPage;
