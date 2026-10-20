import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, initials, ROLE_LABEL } from '../lib/format';
import type { Notification } from '../lib/types';
import { Icon } from './Icon';

/** Plain names, in the order work happens: owners → properties → tenants → agreements → rent → repairs. */
const NAV: { to: string; label: string; ownerLabel?: string; icon: string; perm: string; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'dashboard', perm: 'dashboard:read', end: true },
  { to: '/owners', label: 'Owners', icon: 'user', perm: 'owners:write' },
  { to: '/properties', label: 'Properties', ownerLabel: 'My properties', icon: 'building', perm: 'properties:read' },
  { to: '/tenants', label: 'Tenants', ownerLabel: 'My tenants', icon: 'users', perm: 'tenants:read' },
  { to: '/leases', label: 'Agreements', icon: 'file', perm: 'leases:read' },
  { to: '/rent', label: 'Rent', icon: 'rupee', perm: 'rent:read' },
  { to: '/maintenance', label: 'Repairs', icon: 'wrench', perm: 'maintenance:read' },
  { to: '/expenses', label: 'Expenses', icon: 'wallet', perm: 'expenses:read' },
  { to: '/reports', label: 'Reports', icon: 'chart', perm: 'reports:read' },
];

/** One line telling people who they are and what they look after. */
function whoAmI(me: { role: string; owner: { name: string } | null; teamOwner: { name: string } | null; company: string }): string {
  switch (me.role) {
    case 'SUPER_ADMIN':
      return `Full access · ${me.company}`;
    case 'MANAGER':
      return 'You look after all owners and their properties';
    case 'OWNER':
      return 'You see and manage only your own properties';
    case 'FINANCE':
      return me.teamOwner ? `Finance for ${me.teamOwner.name}` : 'Finance for your assigned properties';
    case 'STAFF':
      return me.teamOwner ? `Repairs for ${me.teamOwner.name}` : 'Repairs assigned to you';
    default:
      return '';
  }
}

export function Layout() {
  const { me, can, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  if (!me) return null;

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Icon name="home" size={20} stroke={2} />
          </span>
          Property CRM
        </Link>
        <div className="who">
          <b>{ROLE_LABEL[me.role]}</b>
          {whoAmI(me)}
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              {me.role === 'OWNER' && n.ownerLabel ? n.ownerLabel : n.label}
            </NavLink>
          ))}
          {can('team:manage') && (
            <>
              <div className="nav-label">People</div>
              <NavLink to="/users">
                <Icon name="shield" />
                {me.role === 'OWNER' ? 'My team' : 'People & access'}
              </NavLink>
              {can('activity:read') && (
                <NavLink to="/activity">
                  <Icon name="clock" />
                  Activity log
                </NavLink>
              )}
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{initials(me.name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</div>
            <div className="muted small">{ROLE_LABEL[me.role]}</div>
          </div>
          <button
            className="btn icon sm ghost"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {open && <div className="backdrop" style={{ zIndex: 55, padding: 0 }} onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn icon menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          {can('search:use') ? <GlobalSearch /> : <div style={{ flex: 1 }} />}
          <div style={{ marginLeft: 'auto' }} className="row">
            <Notifications />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

interface SearchResult {
  tenants: { id: string; fullName: string; phone: string; status: string }[];
  units: { id: string; unitNo: string; status: string; property: { name: string } }[];
  properties: { id: string; name: string; code: string }[];
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const { data } = useQuery({ queryKey: ['search', term], queryFn: () => api.get<SearchResult>(`/search${qs({ q: term })}`), enabled: term.length >= 2 });
  const go = (to: string) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };
  const total = data ? data.tenants.length + data.units.length + data.properties.length : 0;

  return (
    <div className="search" ref={box}>
      <span className="icon">
        <Icon name="search" />
      </span>
      <input
        aria-label="Search tenants, units and properties"
        placeholder="Search tenant, mobile, unit or property…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && term.length >= 2 && data && (
        <div className="search-results" role="listbox">
          {total === 0 && <div className="empty small">No matches for “{term}”.</div>}
          {data.tenants.length > 0 && <div className="nav-label">Tenants</div>}
          {data.tenants.map((t) => (
            <a key={t.id} href="#" onClick={(e) => (e.preventDefault(), go(`/tenants/${t.id}`))}>
              <span>
                <b>{t.fullName}</b> <span className="muted">· {t.phone}</span>
              </span>
              <span className="muted small">{t.status.toLowerCase()}</span>
            </a>
          ))}
          {data.units.length > 0 && <div className="nav-label">Units</div>}
          {data.units.map((u) => (
            <a key={u.id} href="#" onClick={(e) => (e.preventDefault(), go(`/units/${u.id}`))}>
              <span>
                <b>Unit {u.unitNo}</b> <span className="muted">· {u.property.name}</span>
              </span>
              <span className="muted small">{u.status.toLowerCase()}</span>
            </a>
          ))}
          {data.properties.length > 0 && <div className="nav-label">Properties</div>}
          {data.properties.map((p) => (
            <a key={p.id} href="#" onClick={(e) => (e.preventDefault(), go(`/properties/${p.id}`))}>
              <span>
                <b>{p.name}</b> <span className="muted">· {p.code}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ unread: number; items: Notification[] }>('/notifications'), refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const unread = data?.unread ?? 0;
  return (
    <div style={{ position: 'relative' }} ref={box}>
      <button className="btn icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)} style={{ position: 'relative' }}>
        <Icon name="bell" />
        {unread > 0 && (
          <span className="badge" style={{ position: 'absolute', top: 4, right: 3 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="popover">
          <div className="row between" style={{ padding: '14px 16px' }}>
            <b>Notifications</b>
            {unread > 0 && (
              <button className="btn ghost sm" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {!data?.items.length && <div className="empty small">You're all caught up.</div>}
            {data?.items.map((n) => (
              <a
                key={n.id}
                href={n.link ?? '#'}
                className={`notif ${n.status === 'UNREAD' ? 'unread' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (n.status === 'UNREAD') readOne.mutate(n.id);
                  setOpen(false);
                  if (n.link) navigate(n.link);
                }}
              >
                <span className="dot round" style={{ background: n.status === 'UNREAD' ? 'var(--primary)' : 'transparent', marginTop: 7 }} />
                <div>
                  <div className="t" style={{ fontSize: 14 }}>
                    {n.title}
                  </div>
                  <div className="muted small">{n.message}</div>
                  <div className="muted small">{ago(n.createdAt)}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
