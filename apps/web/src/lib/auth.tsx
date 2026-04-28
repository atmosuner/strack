import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiJson } from "./api";

type Session = {
  token: string;
  userId: string;
  email: string;
  householdId: string;
  role: string;
};

type AuthCtx = {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, householdName: string) => Promise<void>;
  logout: () => void;
};

const TOKEN_KEY = "fpct_token";
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (token: string) => {
    const me = await apiJson<{
      user: { id: string; email: string };
      householdId: string;
      role: string;
    }>("/me", { token });
    setSession({
      token,
      userId: me.user.id,
      email: me.user.email,
      householdId: me.householdId,
      role: me.role ?? "OWNER",
    });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    hydrate(stored)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiJson<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      await hydrate(res.token);
    },
    [hydrate]
  );

  const register = useCallback(
    async (email: string, password: string, householdName: string) => {
      const res = await apiJson<{ token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, householdName }),
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      await hydrate(res.token);
    },
    [hydrate]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  }, []);

  return (
    <Ctx.Provider value={{ session, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
