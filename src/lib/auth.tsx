import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "admin" | "user";
export interface AuthUser {
  username: string;
  role: Role;
}

const ACCOUNTS: Record<string, { password: string; role: Role }> = {
  admin: { password: "admin2026", role: "admin" },
  user: { password: "user2026", role: "user" },
};

interface AuthContextValue {
  user: AuthUser | null;
  login: (u: string, p: string) => string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const KEY = "tt_auth_user_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const login = (username: string, password: string) => {
    const acc = ACCOUNTS[username.trim().toLowerCase()];
    if (!acc || acc.password !== password) return "Invalid username or password.";
    const u: AuthUser = { username: username.trim().toLowerCase(), role: acc.role };
    localStorage.setItem(KEY, JSON.stringify(u));
    setUser(u);
    return null;
  };
  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
