import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSessionFn, loginFn, logoutFn, type SessionUser, type Role } from "./auth.functions";

export type { Role };
export type AuthUser = SessionUser;

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSessionFn()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await loginFn({ data: { username, password } });
      if (!res.ok) return res.error;
      setUser(res.user);
      return null;
    } catch {
      return "Sign-in failed. Please try again.";
    }
  };

  const logout = async () => {
    try {
      await logoutFn();
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
