export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobile() {
  return isIOS() || isAndroid();
}

export function getARPlatformInfo() {
  if (isIOS()) {
    return {
      platform: "ios",
      format: "GLB / USDZ",
      hint: "Opens Apple AR Quick Look.",
      buttonLabel: "View in AR",
    };
  }

  if (isAndroid()) {
    return {
      platform: "android",
      format: "GLB",
      hint: "Opens Google Scene Viewer.",
      buttonLabel: "View in AR",
    };
  }

  return {
    platform: "desktop",
    format: "GLB",
    hint: "AR works best on a phone.",
    buttonLabel: "Open AR view",
  };
}
