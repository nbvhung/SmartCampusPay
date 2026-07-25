'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { authApi } from '@/lib/auth-api';
import type { AuthUser, AuthState } from '@/types';

interface AuthContextType extends AuthState {
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  setMustChangePassword: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    mustChangePassword: false,
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.me();
      const user = res.data?.data;
      setState({
        user: user ?? null,
        mustChangePassword: user?.mustChangePassword ?? false,
        isLoading: false,
      });
    } catch {
      setState({ user: null, mustChangePassword: false, isLoading: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...state, refresh, setUser: (user) => setState((s) => ({ ...s, user })), setMustChangePassword: (v) => setState((s) => ({ ...s, mustChangePassword: v })) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
