import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchSession,
  loginAdmin,
  loginWorkshop,
  logoutSession,
} from "../services/api";
import { getToken, isDemoSession, setDemoSession } from "../utils/authToken";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // "loading" | "anon" | "authed"
  const [status, setStatus] = useState(getToken() ? "loading" : "anon");
  const [session, setSession] = useState(null);
  const [demo, setDemo] = useState(isDemoSession());

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    fetchSession().then((data) => {
      if (cancelled) return;
      if (data) {
        setSession(data);
        setStatus("authed");
      } else {
        setStatus("anon");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (code, name) => {
    const data = await loginWorkshop(code, name);
    setDemoSession(false);
    setDemo(false);
    setSession(data);
    setStatus("authed");
    return data;
  }, []);

  const adminLogin = useCallback(async (password) => {
    const data = await loginAdmin(password);
    setDemoSession(false);
    setDemo(false);
    setSession(data);
    setStatus("authed");
    return data;
  }, []);

  const logout = useCallback(() => {
    logoutSession();
    setDemoSession(false);
    setDemo(false);
    setSession(null);
    setStatus("anon");
  }, []);

  const enterDemo = useCallback(() => {
    setDemoSession(true);
    setDemo(true);
  }, []);

  const value = useMemo(() => {
    const role = session?.role ?? null;
    const workshopStatus = session?.workshop?.status ?? null;
    return {
      status,
      role,
      name: session?.name ?? null,
      workshopName: session?.workshop?.name ?? null,
      workshopStatus,
      isDemo: demo,
      // Nur Teilnehmende aktiver Workshops dürfen neue Modelle erzeugen.
      canGenerate: role === "attendee" && workshopStatus === "active",
      login,
      adminLogin,
      logout,
      enterDemo,
    };
  }, [status, session, demo, login, adminLogin, logout, enterDemo]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
