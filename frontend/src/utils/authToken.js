/** Login-Token, getrennt von api.js/AuthContext gegen zirkuläre Importe. */

const TOKEN_KEY = "sketch2life-auth";
const DEMO_KEY = "sketch2life-demo";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* Ohne Storage bleibt die Session auf den Seitenaufruf beschränkt. */
  }
}

/** Demo läuft komplett ohne Server-Session, nur als Flag im Tab. */
export function isDemoSession() {
  try {
    return sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoSession(active) {
  try {
    if (active) {
      sessionStorage.setItem(DEMO_KEY, "1");
    } else {
      sessionStorage.removeItem(DEMO_KEY);
    }
  } catch {
    /* siehe oben */
  }
}
