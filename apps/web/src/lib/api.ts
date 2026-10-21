export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';
let refreshing: Promise<boolean> | null = null;

const SESSION_ACCESS_KEY = 'pm_tab_access_token';
const SESSION_REFRESH_KEY = 'pm_tab_refresh_token';

/** Gets the access token isolated to this browser tab. */
export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_ACCESS_KEY);
  } catch {
    return null;
  }
}

/** Gets the refresh token isolated to this browser tab. */
export function getSessionRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_REFRESH_KEY);
  } catch {
    return null;
  }
}

/** Stores tokens isolated to this browser tab. */
export function setSessionTokens(access?: string | null, refresh?: string | null) {
  try {
    if (access) sessionStorage.setItem(SESSION_ACCESS_KEY, access);
    else sessionStorage.removeItem(SESSION_ACCESS_KEY);
    if (refresh) sessionStorage.setItem(SESSION_REFRESH_KEY, refresh);
    else sessionStorage.removeItem(SESSION_REFRESH_KEY);
  } catch {
    // ignore
  }
}

/** Clears tokens isolated to this browser tab. */
export function clearSessionTokens() {
  try {
    sessionStorage.removeItem(SESSION_ACCESS_KEY);
    sessionStorage.removeItem(SESSION_REFRESH_KEY);
  } catch {
    // ignore
  }
}

async function refreshSession(): Promise<boolean> {
  const rToken = getSessionRefreshToken();
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(rToken ? { 'x-refresh-token': rToken } : {}),
    },
    body: JSON.stringify({ refreshToken: rToken || undefined }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = await r.json().catch(() => ({}));
      if (data?.accessToken) {
        setSessionTokens(data.accessToken, data.refreshToken || rToken);
      }
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

const NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/accept-invite', '/auth/reset-password', '/auth/forgot-password'];

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Real-time role and status synchronization from server response headers:
  const resRole = res.headers.get('x-user-role');
  const resUserId = res.headers.get('x-user-id');
  if (resRole && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:header-role', { detail: { role: resRole, userId: resUserId } }));
  }

  // Access token lasts 15 minutes: refresh once silently, then retry the request.
  if (res.status === 401 && retry && !NO_RETRY.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return request<T>(method, path, body, false);
    clearSessionTokens();
    window.dispatchEvent(new Event('auth:expired'));
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong. Please try again.', e.details);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function downloadUrl(path: string) {
  return BASE + path;
}

