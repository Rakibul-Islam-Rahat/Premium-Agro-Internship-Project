import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "@/services/auth.service";
import { tokenStore } from "@/services/tokenStore";
import { setUnauthorizedHandler } from "@/services/http";
import { env } from "@/config/env";
import { clearRemoteSnapshot, primeRemoteUser, refreshRemoteSnapshot, startRemoteEvents, stopRemoteEvents } from "@/services/remote-store";

export const AuthContext = createContext(null); // eslint-disable-line react-refresh/only-export-components

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous

  const setSession = useCallback(({ user, accessToken }) => {
    tokenStore.set(accessToken);
    setUser(user);
    setStatus("authenticated");
    if (!env.useMock) {
      primeRemoteUser(user);
      // Prime the current user synchronously, then load the authorized database snapshot.
      refreshRemoteSnapshot().catch((error) => {
        if (import.meta.env.DEV) console.error("Could not load Premium Agro backend snapshot:", error.message);
      });
      startRemoteEvents();
    }
    return user;
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    if (!env.useMock) { stopRemoteEvents(); clearRemoteSnapshot(); }
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    authService.me().then(setSession).catch(clearSession);
    setUnauthorizedHandler(clearSession);
  }, [setSession, clearSession]);

  // Authenticated SSE events trigger fast refreshes after writes; this poll is a
  // fallback for disconnected streams so notifications and support still recover.
  useEffect(() => {
    if (env.useMock || status !== "authenticated") return undefined;
    const timer = window.setInterval(() => {
      refreshRemoteSnapshot().catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [status]);

  const login = useCallback(async (credentials) => {
    const res = await authService.login(credentials);
    return res.requiresVerification ? res : { user: setSession(res) };
  }, [setSession]);

  const verify = useCallback(async (payload) => setSession(await authService.verify(payload)), [setSession]);

  const logout = useCallback(async () => {
    try { await authService.logout(); } finally { clearSession(); }
  }, [clearSession]);

  const value = useMemo(() => ({ user, status, login, verify, logout }), [user, status, login, verify, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
