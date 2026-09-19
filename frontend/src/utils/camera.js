import { isIOS } from "./device";

export function canUseLiveCamera() {
  return Boolean(
    window.isSecureContext &&
      navigator.mediaDevices?.getUserMedia,
  );
}

export function needsNativeCamera() {
  return isIOS() || !canUseLiveCamera();
}
