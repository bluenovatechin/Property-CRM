import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, useForm } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
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
            <small>Unit status</small>
            <div style={{ fontWeight: 700 }}>Live, per unit</div>
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
  const { me } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const f = useForm({ email: '', password: '' });
  if (me) return <Navigate to={homeFor(me)} replace />;

  const onSubmit = f.submit(async (v) => {
    const profile = await api.post<Me>('/auth/login', v);
    qc.setQueryData(['me'], profile);
    const next = params.get('next');
    navigate(next && profile.role !== 'TENANT' ? next : homeFor(profile), { replace: true });
  });

  return (
    <AuthShell>
      <form onSubmit={onSubmit} noValidate>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800 }}>Sign in</h2>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Staff, owners and tenants all sign in here.
          </p>
        </div>
        <ErrorNote error={f.formError} />
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
        {import.meta.env.DEV && (
          <div className="alert info small">
            <div>
              <b>Demo accounts</b> (password <code>Password@123</code>): admin@demo.test · manager@demo.test · finance@demo.test · staff1@demo.test · owner.a@demo.test · customer.a@demo.test (tenant)
            </div>
          </div>
        )}
      </form>
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
      const profile = await api.post<Me>('/auth/accept-invite', { token, password: v.password });
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
