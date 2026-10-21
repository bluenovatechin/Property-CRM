import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Notifications } from '../components/Layout';
import { Empty, ErrorNote, Field, Loading, StatusChip, useForm, useToast } from '../components/ui';
import { TwoFactorModal } from '../components/TwoFactorModal';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, date, initials, inr, label, periodLabel, modeLabel } from '../lib/format';

interface PortalMe {
  tenant: { id: string; fullName: string; phone: string; altPhone: string | null; email: string | null; emergencyName: string | null; emergencyPhone: string | null };
  lease: { unitNo: string; unitType: string; property: string; address: string; startDate: string; endDate: string; daysLeft: number; totalDays: number; monthlyRent: number; securityDeposit: number; dueDay: number } | null;
  latestRent: { period: string; amount: number; status: string; dueDate: string; paidOn: string | null; mode: string | null } | null;
  dues: number;
  lastRequest: { ticketNo: number; title: string; status: string; createdAt: string } | null;
}

const usePortalMe = () => useQuery({ queryKey: ['portal-me'], queryFn: () => api.get<PortalMe>('/portal/me') });

export function PortalLayout() {
  const { data } = usePortalMe();
  const { me } = useAuth();
  return (
    <div className="portal">
      <div className="portal-shell">
        <div className="portal-body">
          <header className="row between" style={{ flexWrap: 'nowrap' }}>
            <div style={{ minWidth: 0 }}>
              <div className="muted small" style={{ fontWeight: 600 }}>
                {data?.lease ? `Unit ${data.lease.unitNo} · ${data.lease.property}` : 'Tenant portal'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800 }}>Hello, {data?.tenant.fullName ?? me?.name}</h1>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Notifications />
              <Link to="/portal/profile" className="avatar" aria-label="Profile">
                {initials(data?.tenant.fullName ?? me?.name ?? '')}
              </Link>
            </div>
          </header>
          <Outlet />
        </div>
        <nav className="portal-tabs" aria-label="Tenant portal">
          {[
            ['/portal', 'Home', 'home'],
            ['/portal/rent', 'Rent', 'rupee'],
            ['/portal/requests', 'Requests', 'wrench'],
            ['/portal/profile', 'Profile', 'user'],
          ].map(([to, l, icon]) => (
            <NavLink key={to} to={to} end={to === '/portal'}>
              <span>
                <Icon name={icon} />
              </span>
              {l}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function PortalHome() {
  const { data, isLoading, error } = usePortalMe();
  if (error) return <ErrorNote error={error} />;
  if (isLoading || !data) return <Loading />;
  const { lease, latestRent } = data;
  const leasePct = lease ? Math.min(100, Math.max(0, ((lease.totalDays - lease.daysLeft) / lease.totalDays) * 100)) : 0;
  return (
    <>
      {latestRent ? (
        <section className="hero-card">
          <div className="row between">
            <span style={{ color: '#b6e2d6', fontWeight: 600, fontSize: 13 }}>{periodLabel(latestRent.period)} rent</span>
            <StatusChip status={latestRent.status} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>{inr(latestRent.amount)}</div>
          <div style={{ color: '#c4e6dc', fontSize: 13 }}>
            {latestRent.status === 'PAID' ? `Paid on ${date(latestRent.paidOn)}${latestRent.mode ? ` · ${modeLabel(latestRent.mode)}` : ''}` : `Due on ${date(latestRent.dueDate)}`}
          </div>
          {data.dues > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: 10, fontSize: 13 }} className="row between">
              <span style={{ color: '#c4e6dc' }}>Total pending</span>
              <b>{inr(data.dues)}</b>
            </div>
          )}
        </section>
      ) : (
        <section className="hero-card">
          <b>No rent entered yet</b>
          <span style={{ color: '#c4e6dc', fontSize: 13 }}>Your owner records each month's rent here.</span>
        </section>
      )}
      {lease && (
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row between">
            <b>My lease</b>
            <span className="muted small">{lease.daysLeft} days left</span>
          </div>
          <div className="bar" style={{ height: 8 }}>
            <span style={{ width: `${leasePct}%`, background: 'var(--primary)' }} />
          </div>
          <div className="row between muted small">
            <span>{date(lease.startDate)}</span>
            <span>{date(lease.endDate)}</span>
          </div>
        </section>
      )}
      <div className="quick">
        <Link to="/portal/requests?new=1">
          <span className="ico" style={{ background: 'var(--accent-soft)', color: 'var(--warn)' }}>
            <Icon name="wrench" />
          </span>
          Raise a request
        </Link>
        <Link to="/portal/rent">
          <span className="ico" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            <Icon name="rupee" />
          </span>
          Rent history
        </Link>
        <Link to="/portal/profile">
          <span className="ico" style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}>
            <Icon name="file" />
          </span>
          Lease details
        </Link>
        <a href="mailto:">
          <span className="ico" style={{ background: 'var(--neutral-soft)', color: 'var(--neutral)' }}>
            <Icon name="mail" />
          </span>
          Email manager
        </a>
      </div>
      <section className="card" style={{ padding: '4px 18px' }}>
        <div className="row between" style={{ padding: '10px 0' }}>
          <b>Latest request</b>
          <Link to="/portal/requests" style={{ fontWeight: 700, fontSize: 13 }}>
            See all
          </Link>
        </div>
        {data.lastRequest ? (
          <div className="list-item">
            <div style={{ flex: 1 }}>
              <b>{data.lastRequest.title}</b>
              <div className="muted small">
                #{data.lastRequest.ticketNo} · {ago(data.lastRequest.createdAt)}
              </div>
            </div>
            <StatusChip status={data.lastRequest.status} />
          </div>
        ) : (
          <div className="muted small" style={{ paddingBottom: 12 }}>
            No requests yet.
          </div>
        )}
      </section>
    </>
  );
}

export function PortalRent() {
  const me = usePortalMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-rent'],
    queryFn: () => api.get<{ id: string; period: string; unitNo: string; amount: number; status: string; dueDate: string; paidOn: string | null; mode: string | null }[]>('/portal/rent'),
  });
  return (
    <>
      <h2 style={{ fontSize: 20 }}>Rent</h2>
      <section className="card card-pad row between">
        <span>
          <span className="muted small" style={{ display: 'block' }}>
            Pending dues
          </span>
          <b style={{ fontSize: 24 }}>{inr(me.data?.dues ?? 0)}</b>
        </span>
        <StatusChip status={me.data?.dues ? 'OVERDUE' : 'PAID'} text={me.data?.dues ? 'Due' : 'All paid'} />
      </section>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty title="No rent entries yet" />
      ) : (
        <section className="card" style={{ padding: '4px 18px' }}>
          {data.map((r) => (
            <div className="list-item" key={r.id}>
              <div style={{ flex: 1 }}>
                <b>{periodLabel(r.period)}</b>
                <div className="muted small">{r.status === 'PAID' ? `Paid ${date(r.paidOn)}${r.mode ? ` · ${modeLabel(r.mode)}` : ''}` : `Due ${date(r.dueDate)}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{inr(r.amount)}</b>
                <div>
                  <StatusChip status={r.status} />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
        Your owner records each payment. Online rent payment is coming in a later update.
      </p>
    </>
  );
}

export function PortalRequests() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(new URLSearchParams(window.location.search).get('new') === '1');
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-requests'],
    queryFn: () => api.get<{ id: string; ticketNo: number; title: string; category: string; priority: string; status: string; createdAt: string; lastUpdate: string | null }[]>('/portal/requests'),
  });
  const f = useForm({ category: 'Plumbing', description: '', priority: 'MEDIUM' });
  const save = f.submit(async (v) => {
    const t = await api.post<{ ticketNo: number }>('/portal/requests', v);
    toast(`Request #${t.ticketNo} sent. You will get an email when it is updated.`);
    qc.invalidateQueries({ queryKey: ['portal-requests'] });
    qc.invalidateQueries({ queryKey: ['portal-me'] });
    f.setValues({ category: 'Plumbing', description: '', priority: 'MEDIUM' });
    setCreating(false);
  });

  if (creating) {
    return (
      <form className="form" onSubmit={save} noValidate>
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setCreating(false)}>
          ← Back to requests
        </button>
        <h2 style={{ fontSize: 20 }}>New request</h2>
        <ErrorNote error={f.formError} />
        <Field label="What is the problem about?">
          <select {...f.bind('category')}>
            {['Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Cleaning', 'Appliance', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Describe the problem" error={f.errors.description}>
          <textarea {...f.bind('description')} rows={4} placeholder="For example: the kitchen tap is leaking and water collects under the sink." />
        </Field>
        <div className="field">
          <span>How urgent is it?</span>
          <div className="seg" style={{ display: 'flex' }}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
              <button type="button" key={p} className={f.values.priority === p ? 'on' : ''} style={{ flex: 1 }} onClick={() => f.set('priority', p)}>
                {label(p)}
              </button>
            ))}
          </div>
        </div>
        <div className="muted small" style={{ border: '2px dashed var(--line-strong)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
          Add photos · coming soon
        </div>
        <button className="btn primary" disabled={f.busy} style={{ minHeight: 50 }}>
          Send request
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="row between">
        <h2 style={{ fontSize: 20 }}>My requests</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New request
        </button>
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty title="No requests yet">Something not working at home? Raise a request and your manager will be notified.</Empty>
      ) : (
        <section className="card" style={{ padding: '4px 18px' }}>
          {data.map((r) => (
            <div className="list-item" key={r.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <b>{r.title}</b>
                <div className="muted small">
                  #{r.ticketNo} · {r.category} · {ago(r.createdAt)}
                </div>
                {r.lastUpdate && <div className="small" style={{ marginTop: 4 }}>“{r.lastUpdate}”</div>}
              </div>
              <StatusChip status={r.status} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function PortalProfile() {
  const { data, isLoading } = usePortalMe();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  if (isLoading || !data) return <Loading />;
  return <ProfileForm data={data} onSignOut={async () => (await signOut(), navigate('/login'))} />;
}

function ProfileForm({ data, onSignOut }: { data: PortalMe; onSignOut: () => void }) {
  const { me } = useAuth();
  const [show2FA, setShow2FA] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm({ altPhone: data.tenant.altPhone ?? '', emergencyName: data.tenant.emergencyName ?? '', emergencyPhone: data.tenant.emergencyPhone ?? '' });
  const save = f.submit(async (v) => {
    await api.patch('/portal/profile', v);
    toast('Profile saved');
    qc.invalidateQueries({ queryKey: ['portal-me'] });
  });
  const l = data.lease;
  return (
    <>
      <h2 style={{ fontSize: 20 }}>Profile</h2>
      <section className="card" style={{ padding: '4px 18px' }}>
        <div className="kv">
          <span>Name</span>
          <span>{data.tenant.fullName}</span>
        </div>
        <div className="kv">
          <span>Mobile</span>
          <span>{data.tenant.phone}</span>
        </div>
        <div className="kv">
          <span>Email</span>
          <span>{data.tenant.email}</span>
        </div>
        <div className="kv">
          <span>Security</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: me?.twoFactorEnabled ? 'var(--success, #0e7c6b)' : undefined }}>
              {me?.twoFactorEnabled ? '2FA Active' : '2FA Off'}
            </span>
            <button type="button" className="btn sm ghost" onClick={() => setShow2FA(true)}>
              {me?.twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
            </button>
          </div>
        </div>
        {show2FA && <TwoFactorModal onClose={() => setShow2FA(false)} />}
        {l && (
          <>
            <div className="kv">
              <span>Home</span>
              <span>
                Unit {l.unitNo} · {l.unitType}
              </span>
            </div>
            <div className="kv">
              <span>Lease</span>
              <span>
                {date(l.startDate)} – {date(l.endDate)}
              </span>
            </div>
            <div className="kv">
              <span>Monthly rent</span>
              <span>
                {inr(l.monthlyRent)} · due {l.dueDay}th
              </span>
            </div>
            <div className="kv">
              <span>Deposit held</span>
              <span>{inr(l.securityDeposit)}</span>
            </div>
          </>
        )}
      </section>
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <Field label="Alternate mobile" error={f.errors.altPhone}>
          <input {...f.bind('altPhone')} inputMode="numeric" maxLength={10} />
        </Field>
        <Field label="Emergency contact name">
          <input {...f.bind('emergencyName')} />
        </Field>
        <Field label="Emergency contact mobile" error={f.errors.emergencyPhone}>
          <input {...f.bind('emergencyPhone')} inputMode="numeric" maxLength={10} />
        </Field>
        <button className="btn" disabled={f.busy}>
          Save changes
        </button>
      </form>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <a href="/login?switch=1" target="_blank" rel="noopener noreferrer" className="btn ghost" style={{ flex: 1, justifyContent: 'center' }}>
          <Icon name="plus" /> Open another user in new tab
        </a>
        <button className="btn danger" onClick={onSignOut}>
          <Icon name="logout" /> Sign out
        </button>
      </div>
    </>
  );
}
