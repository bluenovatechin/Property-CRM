import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError, clearSessionTokens, getSessionRefreshToken, setSessionTokens } from './api';
import type { Me } from './types';
import { Loading } from '../components/ui';

export type AuthBusEvent =
  | { type: 'USER_ROLE_CHANGED'; userId: string; newRole?: string }
  | { type: 'AUTH_LOGOUT'; tabId?: string }
  | { type: 'AUTH_REFRESH' };

let authChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    authChannel = new BroadcastChannel('pm_auth_sync_bus');
  }
} catch {
  // ignore
}

/** Broadcasts an event to all open tabs of this browser in real-time. */
export function broadcastAuthSync(event: AuthBusEvent) {
  try {
    authChannel?.postMessage(event);
  } catch {
    // ignore
  }
}

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
        const res = await api.get<Me & { accessToken?: string; refreshToken?: string }>('/auth/me');
        if (res?.accessToken) {
          setSessionTokens(res.accessToken, res.refreshToken ?? getSessionRefreshToken());
        }
        return res;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSessionTokens();
          return null;
        }
        throw e;
      }
    },
    // Keep staleTime short so any change in role or permission is quickly detected
    staleTime: 3000,
    // Background polling every 4 seconds when tab is active ensures cross-browser / cross-device updates without reload
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Clear query on auth expired
  useEffect(() => {
    const onExpired = () => {
      clearSessionTokens();
      qc.setQueryData(['me'], null);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [qc]);

  const me = query.data ?? null;

  // React immediately if an API response header indicates the user's role changed
  useEffect(() => {
    const onHeaderRole = (e: Event) => {
      const ce = e as CustomEvent<{ role?: string; userId?: string }>;
      if (ce.detail?.role && me?.role && ce.detail.role !== me.role) {
        query.refetch();
        qc.invalidateQueries();
      }
    };
    window.addEventListener('auth:header-role', onHeaderRole);
    return () => window.removeEventListener('auth:header-role', onHeaderRole);
  }, [me?.role, qc, query]);

  // Real-time broadcast sync across all tabs in the same browser (0ms delay)
  useEffect(() => {
    if (!authChannel) return;
    const onMessage = (e: MessageEvent<AuthBusEvent>) => {
      const msg = e.data;
      if (msg?.type === 'USER_ROLE_CHANGED') {
        if (!msg.userId || msg.userId === me?.id) {
          query.refetch();
          qc.invalidateQueries();
        }
        qc.invalidateQueries({ queryKey: ['users'] });
      }
    };
    authChannel.addEventListener('message', onMessage);
    return () => authChannel?.removeEventListener('message', onMessage);
  }, [me?.id, qc, query]);

  // Track role changes to smoothly refresh all business data across the entire site without reload
  const prevRole = useRef<string | null>(null);
  useEffect(() => {
    if (me?.role) {
      if (prevRole.current && prevRole.current !== me.role) {
        qc.invalidateQueries();
      }
      prevRole.current = me.role;
    }
  }, [me?.role, qc]);

  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);
  const signOut = useCallback(async () => {
    const rToken = getSessionRefreshToken();
    await api.post('/auth/logout', { refreshToken: rToken }).catch(() => undefined);
    clearSessionTokens();
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
