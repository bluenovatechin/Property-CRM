import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, useForm } from '../components/ui';
import { clearSessionTokens, getSessionToken, setSessionTokens, api, ApiError } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';
import type { Me } from '../lib/types';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand" style={{ color: '#fff' }}>
          <span className="brand-mark" style={{ background: '#fff', color: 'var(--primary-ink)' }}>
            <Icon name="home" size={20} stroke={2} />
          </span>
          Property CRM
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <h1>Every property, unit and tenant in one place.</h1>
          <p>Properties, units, tenants, agreements, rent, maintenance and reports — managed from one dashboard instead of spreadsheets and chat threads.</p>
        </div>
        <div className="auth-feats">
          <div>
            <small>Multi-account tabs</small>
            <div style={{ fontWeight: 700 }}>Owner & Tenant together</div>
          </div>
          <div>
            <small>Rent dues</small>
            <div style={{ fontWeight: 700 }}>Pending + overdue</div>
          </div>
          <div>
            <small>Lease expiry</small>
            <div style={{ fontWeight: 700 }}>Alerts at 60/30/7 days</div>
          </div>
        </div>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}

export function LoginPage() {
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isSwitching = params.get('switch') === '1';
  const f = useForm({ email: '', password: '' });

  const [twoFactorState, setTwoFactorState] = useState<{ active: boolean; tempToken: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<unknown>(null);
  const [googleError, setGoogleError] = useState<unknown>(null);

  const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';

  // Initialize Google Identity Services
  useEffect(() => {
    if (twoFactorState?.active) return;
    const g = (window as any).google;
    if (googleClientId && g?.accounts?.id) {
      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          try {
            setGoogleError(null);
            clearSessionTokens();
            const res = await api.post<any>('/auth/google', { credential: response.credential });
            if (res.requires2FA) {
              setTwoFactorState({ active: true, tempToken: res.tempToken });
              return;
            }
            if (res.accessToken) {
              setSessionTokens(res.accessToken, res.refreshToken);
            }
            qc.clear();
            qc.setQueryData(['me'], res);
            const next = params.get('next');
            navigate(next && res.role !== 'TENANT' ? next : homeFor(res), { replace: true });
          } catch (err) {
            setGoogleError(err);
          }
        },
      });

      const el = document.getElementById('google-signin-btn');
      if (el) {
        g.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
        });
      }
    }
  }, [googleClientId, navigate, params, qc, twoFactorState?.active]);

  // Only redirect if this tab already has its own session token and isn't switching
  if (me && !isSwitching && getSessionToken()) {
    return <Navigate to={homeFor(me)} replace />;
  }

  const onSubmit = f.submit(async (v) => {
    clearSessionTokens();
    const res = await api.post<any>('/auth/login', v);
    if (res.requires2FA) {
      setTwoFactorState({ active: true, tempToken: res.tempToken });
      return;
    }
    if (res.accessToken) {
      setSessionTokens(res.accessToken, res.refreshToken);
    }
    qc.clear();
    qc.setQueryData(['me'], res);
    const next = params.get('next');
    navigate(next && res.role !== 'TENANT' ? next : homeFor(res), { replace: true });
  });

  const onVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorState?.tempToken || !twoFactorCode.trim()) return;
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      const res = await api.post<any>('/auth/login-2fa', {
        tempToken: twoFactorState.tempToken,
        code: twoFactorCode.trim(),
      });
      if (res.accessToken) {
        setSessionTokens(res.accessToken, res.refreshToken);
      }
      qc.clear();
      qc.setQueryData(['me'], res);
      const next = params.get('next');
      navigate(next && res.role !== 'TENANT' ? next : homeFor(res), { replace: true });
    } catch (err) {
      setTwoFactorError(err);
    } finally {
      setTwoFactorBusy(false);
    }
  };

  return (
    <AuthShell>
      {twoFactorState?.active ? (
        <form onSubmit={onVerify2FA} noValidate>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800 }}>Two-Factor Verification</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Enter the 6-digit verification code from your authenticator app (Google Authenticator, Authy, etc.).
            </p>
          </div>
          <ErrorNote error={twoFactorError} />
          <div className="field">
            <label style={{ fontWeight: 700 }}>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
              style={{ fontSize: 22, letterSpacing: '6px', textAlign: 'center', fontWeight: 800, padding: '12px' }}
              autoFocus
              required
            />
          </div>
          <button className="btn primary" disabled={twoFactorBusy || twoFactorCode.length < 6} style={{ minHeight: 48 }}>
            {twoFactorBusy ? 'Verifying…' : 'Verify & Sign in'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setTwoFactorState(null);
              setTwoFactorCode('');
              setTwoFactorError(null);
            }}
          >
            ← Back to sign in
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 800 }}>Sign in</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Staff, owners and tenants all sign in here.
            </p>
          </div>
          {me && (
            <div className="alert info" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                Active session: <b>{me.name}</b> ({ROLE_LABEL[me.role] || me.role})
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm primary" onClick={() => navigate(homeFor(me))}>
                  Continue as {me.name}
                </button>
                <button type="button" className="btn sm ghost" onClick={() => signOut()}>
                  Sign out
                </button>
              </div>
              <div className="muted small">Or sign in with another account below (each tab retains its own login independently):</div>
            </div>
          )}
          <ErrorNote error={googleError || f.formError} />

          {/* Google Sign-In */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div id="google-signin-btn" style={{ minHeight: 40 }} />
            {!googleClientId && (
              <span className="muted small" style={{ fontSize: 11, textAlign: 'center' }}>
                Google OAuth available · Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="muted small">or sign in with password</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <Field label="Email" error={f.errors.email}>
            <input type="email" autoComplete="email" placeholder="you@company.com" {...f.bind('email')} autoFocus />
          </Field>
          <Field label="Password" error={f.errors.password}>
            <input type="password" autoComplete="current-password" placeholder="••••••••" {...f.bind('password')} />
          </Field>
          <div className="row between">
            <span className="muted small">5 wrong attempts lock the account for 15 minutes.</span>
            <Link to="/forgot-password" style={{ fontWeight: 700, fontSize: 14 }}>
              Forgot password?
            </Link>
          </div>
          <button className="btn primary" disabled={f.busy} style={{ minHeight: 48 }}>
            {f.busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="alert info small">
            <div>
              <b>Demo accounts</b> (password <code>Password@123</code>): admin@demo.test · manager@demo.test · finance@demo.test · staff1@demo.test · owner.a@demo.test · customer.a@demo.test (tenant)
            </div>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const f = useForm({ email: '' });
  return (
    <AuthShell>
      <form
        onSubmit={f.submit(async (v) => {
          await api.post('/auth/forgot-password', v);
          setSent(true);
        })}
        noValidate
      >
        <h2 style={{ fontSize: 26, fontWeight: 800 }}>Reset your password</h2>
        {sent ? (
          <div className="alert info">If an account exists for that email, we have sent a reset link. It is valid for 30 minutes.</div>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Enter your email and we will send you a link to choose a new password.
            </p>
            <ErrorNote error={f.formError} />
            <Field label="Email" error={f.errors.email}>
              <input type="email" autoComplete="email" {...f.bind('email')} autoFocus />
            </Field>
            <button className="btn primary" disabled={f.busy}>
              Send reset link
            </button>
          </>
        )}
        <Link to="/login" style={{ fontWeight: 700 }}>
          ← Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}

/** Used for both the invite link (sets password + signs in) and the reset link. */
export function SetPasswordPage({ mode }: { mode: 'invite' | 'reset' }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const f = useForm({ password: '', confirm: '' });

  const onSubmit = f.submit(async (v) => {
    if (v.password !== v.confirm) throw new ApiError(400, 'VALIDATION', 'The two passwords do not match.', { confirm: 'Passwords do not match' });
    if (mode === 'invite') {
      clearSessionTokens();
      const profile = await api.post<Me & { accessToken?: string; refreshToken?: string }>('/auth/accept-invite', { token, password: v.password });
      if (profile.accessToken) {
        setSessionTokens(profile.accessToken, profile.refreshToken);
      }
      qc.clear();
      qc.setQueryData(['me'], profile);
      navigate(homeFor(profile), { replace: true });
    } else {
      await api.post('/auth/reset-password', { token, password: v.password });
      setDone(true);
    }
  });

  return (
    <AuthShell>
      <form onSubmit={onSubmit} noValidate>
        <h2 style={{ fontSize: 26, fontWeight: 800 }}>{mode === 'invite' ? 'Welcome! Set your password' : 'Choose a new password'}</h2>
        {!token && <div className="alert error">This link is incomplete. Open it again from your email.</div>}
        {done ? (
          <>
            <div className="alert info">Your password has been changed. Sign in with the new password.</div>
            <Link className="btn primary" to="/login">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <ErrorNote error={f.formError} />
            <Field label="New password" error={f.errors.password} hint="At least 8 characters">
              <input type="password" autoComplete="new-password" {...f.bind('password')} autoFocus />
            </Field>
            <Field label="Repeat password" error={f.errors.confirm}>
              <input type="password" autoComplete="new-password" {...f.bind('confirm')} />
            </Field>
            <button className="btn primary" disabled={f.busy || !token}>
              {mode === 'invite' ? 'Set password and continue' : 'Change password'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
