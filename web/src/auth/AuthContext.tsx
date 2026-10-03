import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Actor } from '../api/client';
import { api } from '../api/client';
import { ApiError } from '../api/error';

interface AuthContextValue {
  user: Actor | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<Actor>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const actor = await api.me();
        if (!cancelled) setUser(actor satisfies Actor | null);
      } catch {
        // Unknown failure or network error at boot: treat as logged-out rather
        // than bricking the shell; the login attempt will surface the cause.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const actor = await api.login(identifier, password);
    setUser(actor);
    return actor;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      // Logout must still clear local state even if the network call failed
      // (e.g. the session already expired on the server).
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}