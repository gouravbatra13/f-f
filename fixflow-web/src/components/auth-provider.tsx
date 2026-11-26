'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  apiFetch,
  AuthSession,
  AuthUser,
  restoreSession,
  setAccessToken,
} from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handleExpired = () => {
      if (active) setUser(null);
    };
    window.addEventListener('fixflow:auth-expired', handleExpired);
    void restoreSession()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .catch((error: unknown) => {
        if (active) {
          setSessionError(
            error instanceof Error
              ? error.message
              : 'Unable to restore the secure session',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener('fixflow:auth-expired', handleExpired);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiFetch<AuthSession>('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const session = await apiFetch<AuthSession>('auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setAccessToken(session.accessToken);
      setUser(session.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, sessionError, login, register, logout }),
    [user, loading, sessionError, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-sm text-slate-400">
        Restoring secure session…
      </main>
    );
  }
  return <>{children}</>;
}
