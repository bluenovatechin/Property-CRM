import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import type { Me } from './types';
import { Loading } from '../components/ui';

interface AuthState {
  me: Me | null;
  loading: boolean;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    const onExpired = () => qc.setQueryData(['me'], null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [qc]);

  const me = query.data ?? null;
  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);
  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  }, [qc]);

  return (
    <AuthContext.Provider value={{ me, loading: query.isLoading, can, signOut, refresh: query.refetch }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Guards a route: signed in, the right area (staff app vs tenant portal), and optionally one permission. */
export function RequireAuth({ children, area, permission }: { children: ReactNode; area: 'app' | 'portal'; permission?: string }) {
  const { me, loading, can } = useAuth();
  const location = useLocation();
  if (loading) return <Loading full />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (area === 'app' && me.role === 'TENANT') return <Navigate to="/portal" replace />;
  if (area === 'portal' && me.role !== 'TENANT') return <Navigate to="/" replace />;
  if (permission && !can(permission)) return <Navigate to={homeFor(me)} replace />;
  return <>{children}</>;
}

export function homeFor(me: Me): string {
  if (me.role === 'TENANT') return '/portal';
  if (me.role === 'STAFF') return '/maintenance';
  return '/';
}
