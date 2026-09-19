import { useEffect, useRef, useState } from "react";
import "../styles/ProgressBar.css";

function formatRemaining(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  if (sec <= 10) return "A few seconds left";
  if (sec < 60) return `About ${sec} seconds left`;
  const minutes = Math.ceil(sec / 60);
  return minutes === 1 ? "About 1 minute left" : `About ${minutes} minutes left`;
}


function ProgressBar({
  progress = 0,
  message = "Please wait…",
  estimatedTotalSec = 180,
}) {
  const startRef = useRef(Date.now());
  const minRemainingRef = useRef(estimatedTotalSec);
  const [remainingSec, setRemainingSec] = useState(estimatedTotalSec);
  const safe = Math.min(100, Math.max(0, progress));
  const isFinishing = safe >= 70;

  useEffect(() => {
    minRemainingRef.current = estimatedTotalSec;
    startRef.current = Date.now();
    setRemainingSec(estimatedTotalSec);
  }, [estimatedTotalSec]);

  useEffect(() => {
    if (safe >= 100) {
      setRemainingSec(0);
      return undefined;
    }

    const update = () => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const fromProgress = estimatedTotalSec * ((100 - safe) / 100);
      const fromClock = Math.max(0, estimatedTotalSec - elapsed);
      const blended = safe > 5 ? fromProgress : Math.min(fromClock, fromProgress);
      const capped = Math.min(blended, estimatedTotalSec * 0.95);
      minRemainingRef.current = Math.min(minRemainingRef.current, capped);
      setRemainingSec(Math.round(minRemainingRef.current));
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [safe, estimatedTotalSec]);

  const timeLabel = safe >= 100 ? "Done!" : formatRemaining(remainingSec);

  return (
    <div
      className="progress-block"
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-icon" aria-hidden>
        {isFinishing ? "⏳" : "🎨"}
      </div>
      <h2 className="progress-title">Your 3D model is being created...</h2>
      <div className={`progress-track${isFinishing ? " progress-track--active" : ""}`}>
        <div className="progress-fill" style={{ width: `${safe}%` }} />
      </div>
      <p className="progress-percent">{safe}%</p>
      <p className="progress-caption progress-caption--time">{timeLabel}</p>
      <p className="progress-caption progress-caption--muted">
        Please keep this page open.
      </p>
    </div>
  );
}

export default ProgressBar;
