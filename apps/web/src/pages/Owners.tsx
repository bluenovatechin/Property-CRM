import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, Field, InviteLinkModal, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials, inr } from '../lib/format';
import { useOwners } from '../lib/queries';
import type { Owner } from '../lib/types';

/** Managers: the owners they look after. Each owner can get a login and then runs their own properties. */
export function OwnersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get('new') === '1');
  const [link, setLink] = useState<{ url: string; who: string } | null>(null);
  const { data, isLoading, error } = useOwners();

  const close = () => {
    setAdding(false);
    if (params.get('new')) setParams({}, { replace: true });
  };
  const invite = async (o: Owner) => {
    try {
      const r = await api.post<{ inviteUrl?: string }>(`/owners/${o.id}/invite`);
      qc.invalidateQueries({ queryKey: ['owners'] });
      qc.invalidateQueries({ queryKey: ['setup'] });
      if (r.inviteUrl) setLink({ url: r.inviteUrl, who: o.name });
      else toast(`Login invite emailed to ${o.email}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead
        title="Owners"
        hint="Add each property owner here. Give them a login so they can add their properties, tenants and their own staff and finance person."
        actions={
          can('owners:write') ? (
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add owner
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <Empty
            title="No owners yet"
            action={
              can('owners:write') ? (
                <button className="btn primary" onClick={() => setAdding(true)}>
                  Add the first owner
                </button>
              ) : undefined
            }
          >
            Start here: every property belongs to one owner.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Properties</th>
                  <th className="right">Tenants</th>
                  <th className="right">Team</th>
                  <th className="right">Rent collected (this month)</th>
                  <th>Login</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                          {initials(o.name)}
                        </span>
                        <div>
                          <b>{o.name}</b>
                          <div className="muted small">
                            {o.phone}
                            {o.email ? ` · ${o.email}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                      {o.properties.length ? (
                        o.properties.map((p, i) => (
                          <span key={p.id}>
                            {i > 0 && ', '}
                            <Link to={`/properties/${p.id}`}>{p.name}</Link>
                          </span>
                        ))
                      ) : can('properties:write') ? (
                        <Link to={`/properties?new=1&owner=${o.id}`}>+ Add property</Link>
                      ) : (
                        <span className="muted">No properties</span>
                      )}
                    </td>
                    <td className="right num">{o.tenantCount}</td>
                    <td className="right num">{o.teamCount}</td>
                    <td className="right num">{inr(o.collectedThisMonth)}</td>
                    <td>{o.login ? <StatusChip status={o.login} text={o.login === 'ACTIVE' ? 'Can sign in' : o.login === 'INVITED' ? 'Invite sent' : 'Disabled'} /> : <StatusChip status="DRAFT" text="No login" />}</td>
                    <td className="right">
                      {can('owners:write') && o.login !== 'ACTIVE' && (
                        <button className="btn sm soft" onClick={() => invite(o)} disabled={!o.email} title={o.email ? undefined : 'Add an email first'}>
                          {o.login === 'INVITED' ? 'Resend invite' : 'Send login invite'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding && <AddOwner onClose={close} onLink={(url, who) => setLink({ url, who })} />}
      {link && <InviteLinkModal url={link.url} who={link.who} onClose={() => setLink(null)} />}
    </>
  );
}

function AddOwner({ onClose, onLink }: { onClose: () => void; onLink: (url: string, who: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm({ name: '', phone: '', email: '', pan: '', address: '', giveLogin: true as boolean });
  const save = f.submit(async (v) => {
    const r = await api.post<{ inviteUrl?: string }>('/owners', v);
    qc.invalidateQueries({ queryKey: ['owners'] });
    qc.invalidateQueries({ queryKey: ['setup'] });
    onClose();
    if (r.inviteUrl) onLink(r.inviteUrl, v.name);
    else toast(v.giveLogin ? `Owner added · login invite emailed to ${v.email}` : 'Owner added');
  });
  return (
    <Modal
      title="Add an owner"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            {f.values.giveLogin ? 'Add owner & send login' : 'Add owner'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="Owner name" error={f.errors.name}>
            <input {...f.bind('name')} autoFocus />
          </Field>
          <Field label="Mobile" error={f.errors.phone}>
            <input {...f.bind('phone')} inputMode="numeric" maxLength={10} />
          </Field>
        </div>
        <Field label="Email" error={f.errors.email} hint="Needed for the owner’s login">
          <input type="email" {...f.bind('email')} />
        </Field>
        <div className="form-row">
          <Field label="PAN (optional)" error={f.errors.pan}>
            <input {...f.bind('pan')} style={{ textTransform: 'uppercase' }} maxLength={10} />
          </Field>
          <Field label="Address (optional)">
            <input {...f.bind('address')} />
          </Field>
        </div>
        <label className="check card card-pad" style={{ background: 'var(--surface-2)', border: 0 }}>
          <input type="checkbox" checked={f.values.giveLogin} onChange={(e) => f.set('giveLogin', e.target.checked)} />
          <span>
            <b style={{ display: 'block' }}>Give this owner a login</b>
            <span className="muted small">They can then add their own properties, tenants, staff and finance person. You can also do this later.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
