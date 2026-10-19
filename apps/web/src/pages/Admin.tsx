import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, dateTime, initials, ROLE_LABEL } from '../lib/format';
import { useOwners, useProperties } from '../lib/queries';
import type { Role } from '../lib/types';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  lastLoginAt: string | null;
  owner: { id: string; name: string } | null;
  properties: { id: string; name: string }[];
}

const ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'STAFF', 'OWNER'];
const ROLE_SCOPE: Record<string, string> = {
  SUPER_ADMIN: 'Everything, including users and settings',
  MANAGER: 'Properties, units, tenants, leases, rent, maintenance for assigned properties',
  FINANCE: 'Rent, expenses and financial reports for assigned properties',
  STAFF: 'Only maintenance tickets assigned to them',
  OWNER: 'Read-only view of their own properties; can enter monthly rent',
};

export function UsersPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });

  const resend = async (u: UserRow) => {
    try {
      await api.post(`/users/${u.id}/resend-invite`);
      toast(`Invite re-sent to ${u.email}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const toggle = async (u: UserRow) => {
    try {
      await api.patch(`/users/${u.id}`, { status: u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' });
      toast(u.status === 'DISABLED' ? 'User enabled' : 'User disabled and signed out');
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Users & roles"
        actions={
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Invite user
          </button>
        }
      />
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                          {initials(u.name)}
                        </span>
                        <div>
                          <b>{u.name}</b>
                          <div className="muted small">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td className="muted" style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                      {u.role === 'SUPER_ADMIN' ? 'All properties' : u.role === 'OWNER' ? `Own properties (${u.owner?.name})` : u.properties.map((p) => p.name).join(', ') || 'No properties'}
                    </td>
                    <td>
                      <StatusChip status={u.status} />
                    </td>
                    <td className="muted">{u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {u.status === 'INVITED' && (
                          <button className="btn sm" onClick={() => resend(u)}>
                            Resend invite
                          </button>
                        )}
                        <button className="btn sm" onClick={() => setEditing(u)}>
                          Edit
                        </button>
                        {u.id !== me?.id && u.status !== 'INVITED' && (
                          <button className={`btn sm ${u.status === 'DISABLED' ? '' : 'danger'}`} onClick={() => toggle(u)}>
                            {u.status === 'DISABLED' ? 'Enable' : 'Disable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card card-pad">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>What each role can do</h2>
        {ROLES.map((r) => (
          <div className="kv" key={r}>
            <span>{ROLE_LABEL[r]}</span>
            <span style={{ fontWeight: 500 }}>{ROLE_SCOPE[r]}</span>
          </div>
        ))}
        <div className="kv">
          <span>Tenant</span>
          <span style={{ fontWeight: 500 }}>Tenant portal only — invited from the tenant's profile</span>
        </div>
      </section>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const properties = useProperties();
  const owners = useOwners();
  const f = useForm({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', role: (user?.role ?? 'MANAGER') as Role, ownerId: user?.owner?.id ?? '', propertyIds: (user?.properties.map((p) => p.id) ?? []) as string[] });
  const scoped = ['MANAGER', 'FINANCE', 'STAFF'].includes(f.values.role);
  const save = f.submit(async (v) => {
    if (user) {
      await api.patch(`/users/${user.id}`, { name: v.name, phone: v.phone || null, role: v.role, propertyIds: scoped ? v.propertyIds : [] });
      toast('User updated');
    } else {
      await api.post('/users', { ...v, phone: v.phone || null, ownerId: v.role === 'OWNER' ? v.ownerId : null, propertyIds: scoped ? v.propertyIds : [] });
      toast(`Invite emailed to ${v.email}`);
    }
    qc.invalidateQueries({ queryKey: ['users'] });
    onClose();
  });
  const toggleProp = (id: string) => f.set('propertyIds', f.values.propertyIds.includes(id) ? f.values.propertyIds.filter((x) => x !== id) : [...f.values.propertyIds, id]);
  return (
    <Modal
      title={user ? `Edit ${user.name}` : 'Invite a user'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            {user ? 'Save' : 'Send invite'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="Name" error={f.errors.name}>
            <input {...f.bind('name')} autoFocus />
          </Field>
          <Field label="Mobile">
            <input {...f.bind('phone')} />
          </Field>
        </div>
        {!user && (
          <Field label="Email" error={f.errors.email} hint="They get a link to set their password (valid 48 hours)">
            <input type="email" {...f.bind('email')} />
          </Field>
        )}
        <Field label="Role" hint={ROLE_SCOPE[f.values.role]}>
          <select value={f.values.role} onChange={(e) => f.set('role', e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {f.values.role === 'OWNER' && !user && (
          <Field label="Owner profile" error={f.errors.ownerId}>
            <select {...f.bind('ownerId')}>
              <option value="">Choose…</option>
              {owners.data
                ?.filter((o) => !o.hasLogin)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {scoped && (
          <div className="field">
            <span>Properties they can access</span>
            <div className="stack" style={{ gap: 6 }}>
              {properties.data?.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={f.values.propertyIds.includes(p.id)} onChange={() => toggleProp(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

interface ActivityRow {
  id: string;
  entityType: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { name: string; role: Role } | null;
}

export function ActivityPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['activity'], queryFn: () => api.get<ActivityRow[]>('/activity') });
  return (
    <>
      <PageHead eyebrow="Admin" title="Activity log" />
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Area</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{dateTime(a.createdAt)}</td>
                    <td>{a.user ? `${a.user.name}` : 'System'}</td>
                    <td>
                      <StatusChip status="DRAFT" text={a.entityType.toLowerCase()} />
                    </td>
                    <td style={{ whiteSpace: 'normal' }}>{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
