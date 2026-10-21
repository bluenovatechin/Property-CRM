import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, Field, InviteLinkModal, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { broadcastAuthSync, useAuth } from '../lib/auth';
import { ago, initials, ROLE_LABEL } from '../lib/format';
import { useOwners, useProperties } from '../lib/queries';
import type { Role } from '../lib/types';

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  lastLoginAt: string | null;
  owner: { id: string; name: string } | null;
  teamOwner: { id: string; name: string } | null;
  properties: { id: string; name: string }[];
}
type Invite = { inviteUrl?: string };

const ROLE_HELP: Record<string, string> = {
  OWNER: 'Owns properties. Adds their property, tenants and their own team.',
  FINANCE: 'Records rent and expenses, sees reports.',
  STAFF: 'Handles repair tickets assigned to them.',
  MANAGER: 'Looks after all owners and properties.',
  SUPER_ADMIN: 'Full access to everything.',
};

function worksFor(p: Person): string {
  if (p.role === 'SUPER_ADMIN') return 'Everything';
  if (p.role === 'MANAGER') return 'All owners and properties';
  if (p.role === 'OWNER') return 'Own properties';
  if (p.teamOwner) return p.teamOwner.name;
  return p.properties.map((x) => x.name).join(', ') || 'No properties yet';
}

export function PeoplePage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Person | 'new' | null>(params.get('new') === '1' ? 'new' : null);
  const [link, setLink] = useState<{ url: string; who: string } | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ canInvite: Role[]; users: Person[] }>('/users') });
  const isOwner = me?.role === 'OWNER';

  const close = () => {
    setEditing(null);
    if (params.get('new')) setParams({}, { replace: true });
  };
  const resend = async (p: Person) => {
    try {
      const r = await api.post<Invite>(`/users/${p.id}/resend-invite`);
      if (r.inviteUrl) setLink({ url: r.inviteUrl, who: p.name });
      else toast(`Invite re-sent to ${p.email}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const toggle = async (p: Person) => {
    try {
      await api.patch(`/users/${p.id}`, { status: p.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' });
      broadcastAuthSync({ type: 'USER_ROLE_CHANGED', userId: p.id });
      toast(p.status === 'DISABLED' ? `${p.name} can sign in again` : `${p.name} can no longer sign in`);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead
        title={isOwner ? 'My team' : 'People & access'}
        hint={
          isOwner
            ? 'Invite the staff who handle your repairs and the finance person who records your rent and expenses. They see only your properties.'
            : 'Invite owners, staff and finance people. Each person sees only what they need. Tenants are invited from the tenant’s page.'
        }
        actions={
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> {isOwner ? 'Invite team member' : 'Invite someone'}
          </button>
        }
      />
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : !data?.users.length ? (
          <Empty title={isOwner ? 'No team members yet' : 'Nobody here yet'} action={<button className="btn primary" onClick={() => setEditing('new')}>Invite someone</button>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Works for / sees</th>
                  <th>Status</th>
                  <th className="hide-sm">Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                          {initials(p.name)}
                        </span>
                        <div>
                          <b>{p.name}</b>
                          <div className="muted small">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLE_LABEL[p.role]}</td>
                    <td className="muted" style={{ whiteSpace: 'normal', maxWidth: 240 }}>
                      {worksFor(p)}
                    </td>
                    <td>
                      <StatusChip status={p.status} text={p.status === 'ACTIVE' ? 'Can sign in' : p.status === 'INVITED' ? 'Invite sent' : 'Disabled'} />
                    </td>
                    <td className="muted hide-sm">{p.lastLoginAt ? ago(p.lastLoginAt) : '—'}</td>
                    <td className="right">
                      {p.id !== me?.id && (
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          {p.status === 'INVITED' && (
                            <button className="btn sm" onClick={() => resend(p)}>
                              Resend invite
                            </button>
                          )}
                          {data.canInvite.includes(p.role) && p.role !== 'OWNER' && (
                            <button className="btn sm" onClick={() => setEditing(p)}>
                              Edit
                            </button>
                          )}
                          {data.canInvite.includes(p.role) && p.status !== 'INVITED' && (
                            <button className={`btn sm ${p.status === 'DISABLED' ? '' : 'danger'}`} onClick={() => toggle(p)}>
                              {p.status === 'DISABLED' ? 'Enable' : 'Disable'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && data && (
        <PersonForm person={editing === 'new' ? null : editing} canInvite={data.canInvite} onClose={close} onLink={(url, who) => setLink({ url, who })} />
      )}
      {link && <InviteLinkModal url={link.url} who={link.who} onClose={() => setLink(null)} />}
    </>
  );
}

function PersonForm({ person, canInvite, onClose, onLink }: { person: Person | null; canInvite: Role[]; onClose: () => void; onLink: (url: string, who: string) => void }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const isOwner = me?.role === 'OWNER';
  const owners = useOwners(!isOwner);
  const properties = useProperties(!isOwner);
  const roles = canInvite.filter((r) => (person ? r !== 'OWNER' : true));
  const f = useForm({
    role: (person?.role ?? (isOwner ? 'STAFF' : roles.includes('OWNER') ? 'OWNER' : roles[0])) as Role,
    name: person?.name ?? '',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    worksFor: person ? (person.teamOwner ? 'owner' : 'company') : 'owner',
    teamOwnerId: person?.teamOwner?.id ?? '',
    propertyIds: (person?.properties.map((p) => p.id) ?? []) as string[],
  });
  const v = f.values;
  const team = v.role === 'FINANCE' || v.role === 'STAFF';

  const save = f.submit(async (x) => {
    const scope = isOwner || !team ? {} : x.worksFor === 'owner' ? { teamOwnerId: x.teamOwnerId || null, propertyIds: [] } : { teamOwnerId: null, propertyIds: x.propertyIds };
    if (person) {
      await api.patch(`/users/${person.id}`, { name: x.name, phone: x.phone || null, role: x.role, ...scope });
      broadcastAuthSync({ type: 'USER_ROLE_CHANGED', userId: person.id, newRole: x.role });
      toast('Saved');
    } else {
      const r = await api.post<Invite>('/users', { name: x.name, email: x.email, phone: x.phone || null, role: x.role, ...scope });
      if (r.inviteUrl) onLink(r.inviteUrl, x.name);
      else toast(`Invite emailed to ${x.email}`);
    }
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['owners'] });
    qc.invalidateQueries({ queryKey: ['setup'] });
    onClose();
  });
  const toggleProp = (id: string) => f.set('propertyIds', v.propertyIds.includes(id) ? v.propertyIds.filter((x) => x !== id) : [...v.propertyIds, id]);

  return (
    <Modal
      title={person ? `Edit ${person.name}` : isOwner ? 'Invite a team member' : 'Invite someone'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            {person ? 'Save' : 'Send invite'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="field">
          <span>1. Who are you adding?</span>
          <div className="role-pick">
            {roles.map((r) => (
              <button type="button" key={r} className={v.role === r ? 'on' : ''} onClick={() => f.set('role', r)} disabled={!!person && r === 'OWNER'}>
                <b>{ROLE_LABEL[r]}</b>
                <span>{ROLE_HELP[r]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>2. Their details</span>
        </div>
        <div className="form-row">
          <Field label="Name" error={f.errors.name}>
            <input {...f.bind('name')} />
          </Field>
          <Field label={v.role === 'OWNER' ? 'Mobile (required)' : 'Mobile'} error={f.errors.phone}>
            <input {...f.bind('phone')} inputMode="numeric" maxLength={10} />
          </Field>
        </div>
        {!person && (
          <Field label="Email" error={f.errors.email} hint="They get a link to set their password (valid 48 hours).">
            <input type="email" {...f.bind('email')} />
          </Field>
        )}
        {team && !isOwner && (
          <div className="field">
            <span>3. Who do they work for?</span>
            <div className="seg">
              <button type="button" className={v.worksFor === 'owner' ? 'on' : ''} onClick={() => f.set('worksFor', 'owner')}>
                An owner
              </button>
              <button type="button" className={v.worksFor === 'company' ? 'on' : ''} onClick={() => f.set('worksFor', 'company')}>
                Our company (pick properties)
              </button>
            </div>
            {v.worksFor === 'owner' ? (
              <select className="input" value={v.teamOwnerId} onChange={(e) => f.set('teamOwnerId', e.target.value)}>
                <option value="">Choose the owner…</option>
                {owners.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {!properties.data?.length && <span className="muted small">No properties yet.</span>}
                {properties.data?.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" checked={v.propertyIds.includes(p.id)} onChange={() => toggleProp(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            <span className="hint">They will see only {v.worksFor === 'owner' ? 'that owner’s properties' : 'the ticked properties'}.</span>
          </div>
        )}
        {team && isOwner && <div className="alert info small">They will see only your properties{v.role === 'STAFF' ? ', and only repair tickets you assign to them' : ''}.</div>}
        {v.role === 'OWNER' && !person && <div className="alert info small">An owner profile is created for them. Then they can add their own properties.</div>}
      </form>
    </Modal>
  );
}
