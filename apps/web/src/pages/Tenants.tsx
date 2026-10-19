import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { confirmAction, Empty, ErrorNote, Field, InviteLinkModal, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, date, initials, inr, label, periodLabel, modeLabel } from '../lib/format';
import { useProperties } from '../lib/queries';
import type { TenantRow } from '../lib/types';

export function TenantsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const status = params.get('status') ?? '';
  const propertyId = params.get('property') ?? '';
  const properties = useProperties();
  const { data, isLoading, error } = useQuery({
    queryKey: ['tenants', q, status, propertyId],
    queryFn: () => api.get<TenantRow[]>(`/tenants${qs({ q, status, propertyId })}`),
    placeholderData: (prev) => prev,
  });
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead
        eyebrow="People"
        title="Tenants"
        actions={
          can('tenants:write') && (
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add tenant
            </button>
          )
        }
      />
      <div className="row">
        <div className="search" style={{ maxWidth: 340 }}>
          <span className="icon">
            <Icon name="search" />
          </span>
          <input aria-label="Search tenants" placeholder="Name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="select-inline">
          <span>Status</span>
          <select value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">No lease yet</option>
            <option value="PREVIOUS">Previous</option>
          </select>
        </label>
        <label className="select-inline">
          <span>Property</span>
          <select value={propertyId} onChange={(e) => setParam('property', e.target.value)}>
            <option value="">All</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <Empty title="No tenants found">Try a different search or filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Mobile</th>
                  <th>Unit</th>
                  <th className="right">Rent</th>
                  <th>Lease ends</th>
                  <th className="right">Dues</th>
                  <th>Status</th>
                  <th className="hide-sm">Portal</th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                          {initials(t.fullName)}
                        </span>
                        <b>{t.fullName}</b>
                      </div>
                    </td>
                    <td className="muted">{t.phone}</td>
                    <td>{t.unit ? `${t.unit.unitNo} · ${t.unit.property.name}` : <span className="muted">—</span>}</td>
                    <td className="right num">{t.monthlyRent ? inr(t.monthlyRent) : '—'}</td>
                    <td>{date(t.leaseEnd)}</td>
                    <td className="right num" style={{ color: t.overdue ? 'var(--danger)' : undefined, fontWeight: t.dues ? 700 : 400 }}>
                      {t.dues ? inr(t.dues) : '—'}
                    </td>
                    <td>
                      <StatusChip status={t.status} text={t.status === 'INACTIVE' ? 'No lease yet' : undefined} />
                    </td>
                    <td className="hide-sm">{t.portal ? <StatusChip status={t.portal} text={t.portal === 'ACTIVE' ? 'Using portal' : label(t.portal)} /> : <span className="muted small">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding && <TenantForm onClose={() => setAdding(false)} onSaved={(id) => navigate(`/tenants/${id}`)} />}
    </>
  );
}

interface TenantDetail {
  id: string;
  type: string;
  fullName: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  dues: number;
  deposit: number;
  activeLease: { id: string; unit: { id: string; unitNo: string; unitType: string; property: { id: string; name: string } }; startDate: string; endDate: string; monthlyRent: number; dueDay: number } | null;
  leases: { id: string; status: string; unit: { id: string; unitNo: string; property: { name: string } }; startDate: string; endDate: string; monthlyRent: number; securityDeposit: number }[];
  rent: { id: string; period: string; unitNo: string; amount: number; status: string; dueDate: string; paidOn: string | null; mode: string | null; reference: string | null }[];
  tickets: { id: string; ticketNo: number; title: string; status: string; priority: string; createdAt: string }[];
  portal: { status: string; lastLoginAt: string | null; email: string; createdAt: string } | null;
}

export function TenantDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const { data: t, error } = useQuery({ queryKey: ['tenant', id], queryFn: () => api.get<TenantDetail>(`/tenants/${id}`) });
  if (error) return <ErrorNote error={error} />;
  if (!t) return <Loading />;

  const invite = async () => {
    try {
      const r = await api.post<{ inviteUrl?: string }>(`/tenants/${t.id}/invite`);
      if (r.inviteUrl) setInviteUrl(r.inviteUrl);
      else toast(`Portal invite emailed to ${t.email}`);
      qc.invalidateQueries({ queryKey: ['tenant', id] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const archive = async () => {
    if (!confirmAction(`Archive ${t.fullName}? Their history is kept.`)) return;
    try {
      await api.del(`/tenants/${t.id}`);
      toast('Tenant archived');
      navigate('/tenants');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <div className="crumbs">
        <Link to="/tenants">Tenants</Link> / {t.fullName}
      </div>
      <header className="card card-pad row" style={{ gap: 20 }}>
        <span className="avatar lg">{initials(t.fullName)}</span>
        <div style={{ flex: '1 1 260px' }}>
          <div className="row">
            <h1 style={{ fontSize: 26, fontWeight: 800 }}>{t.fullName}</h1>
            <StatusChip status={t.status} text={t.status === 'ACTIVE' ? 'Active tenant' : t.status === 'INACTIVE' ? 'No lease yet' : 'Previous tenant'} />
            <StatusChip status="DRAFT" text={label(t.type)} />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {t.activeLease ? `Unit ${t.activeLease.unit.unitNo}, ${t.activeLease.unit.property.name}` : 'No active lease'} · customer since {date(t.createdAt.slice(0, 10))}
          </div>
          <div className="row" style={{ marginTop: 8, gap: 18 }}>
            <span>{t.phone}</span>
            {t.email && <span>{t.email}</span>}
          </div>
        </div>
        <div className="row">
          {can('tenants:write') && (
            <button className="btn" onClick={() => setEditing(true)}>
              <Icon name="edit" /> Edit
            </button>
          )}
          {!t.activeLease && can('leases:write') && (
            <Link className="btn primary" to={`/leases/new?tenant=${t.id}`}>
              Create lease
            </Link>
          )}
          {t.email && (
            <a className="btn primary" href={`mailto:${t.email}`}>
              <Icon name="mail" /> Email
            </a>
          )}
        </div>
      </header>

      <section className="card strip">
        <div>
          <div className="label">Unit</div>
          <div className="value">{t.activeLease ? <Link to={`/units/${t.activeLease.unit.id}`}>{t.activeLease.unit.unitNo}</Link> : '—'}</div>
        </div>
        <div>
          <div className="label">Monthly rent</div>
          <div className="value">{t.activeLease ? inr(t.activeLease.monthlyRent) : '—'}</div>
        </div>
        <div>
          <div className="label">Pending dues</div>
          <div className="value" style={{ color: t.dues ? 'var(--danger)' : 'var(--success)' }}>
            {inr(t.dues)}
          </div>
        </div>
        <div>
          <div className="label">Deposit held</div>
          <div className="value">{inr(t.deposit)}</div>
        </div>
        <div>
          <div className="label">Lease ends</div>
          <div className="value">{t.activeLease ? date(t.activeLease.endDate) : '—'}</div>
        </div>
      </section>

      <div className="grid-2">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-head">
              <h2>Agreements</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Unit</th>
                    <th className="right">Rent</th>
                    <th className="right">Deposit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {t.leases.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => navigate(`/leases/${l.id}`)}>
                      <td>
                        <b>
                          {date(l.startDate)} – {date(l.endDate)}
                        </b>
                      </td>
                      <td>
                        {l.unit.unitNo} · {l.unit.property.name}
                      </td>
                      <td className="right num">{inr(l.monthlyRent)}</td>
                      <td className="right num">{inr(l.securityDeposit)}</td>
                      <td>
                        <StatusChip status={l.status} />
                      </td>
                    </tr>
                  ))}
                  {!t.leases.length && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No agreements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Rent ledger</h2>
              <span className="muted small">Last 12 months</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="right">Amount</th>
                    <th>Paid on</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{periodLabel(r.period)}</b>
                      </td>
                      <td className="right num">{inr(r.amount)}</td>
                      <td>{date(r.paidOn)}</td>
                      <td className="muted">{r.mode ? `${modeLabel(r.mode)}${r.reference ? ` · ${r.reference}` : ''}` : '—'}</td>
                      <td>
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  ))}
                  {!t.rent.length && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No rent entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Maintenance requests</h2>
            {!t.tickets.length && <div className="muted small">No requests.</div>}
            {t.tickets.map((k) => (
              <Link key={k.id} to={`/maintenance?ticket=${k.id}`} className="list-item" style={{ color: 'var(--ink)' }}>
                <div style={{ flex: 1 }}>
                  <b>
                    #{k.ticketNo} {k.title}
                  </b>
                  <div className="muted small">{ago(k.createdAt)}</div>
                </div>
                <StatusChip status={k.status} />
              </Link>
            ))}
          </section>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <section className="card card-pad stack">
            <div className="row between">
              <h2 style={{ fontSize: 16 }}>Tenant portal access</h2>
              {t.portal ? <StatusChip status={t.portal.status} text={t.portal.status === 'ACTIVE' ? 'Active' : 'Invite sent'} /> : <StatusChip status="DRAFT" text="Not invited" />}
            </div>
            <div className="muted small" style={{ lineHeight: 1.6 }}>
              {t.portal
                ? t.portal.status === 'ACTIVE'
                  ? `Using the portal${t.portal.lastLoginAt ? ` · last signed in ${ago(t.portal.lastLoginAt)}` : ''}. The tenant can see their lease and rent, and raise requests.`
                  : `Invite sent to ${t.portal.email}. The link is valid for 48 hours.`
                : 'Invite the tenant by email so they can see their lease and monthly rent and raise maintenance requests.'}
            </div>
            {can('tenants:write') && t.portal?.status !== 'ACTIVE' && (
              <button className="btn soft" onClick={invite} disabled={!t.email} title={t.email ? undefined : 'Add an email address first'}>
                <Icon name="mail" /> {t.portal ? 'Resend invite' : 'Send portal invite'}
              </button>
            )}
          </section>
          <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Contact and KYC</h2>
            <div className="kv">
              <span>Alternate mobile</span>
              <span>{t.altPhone ?? '—'}</span>
            </div>
            <div className="kv">
              <span>Emergency contact</span>
              <span>{t.emergencyName ? `${t.emergencyName} · ${t.emergencyPhone ?? ''}` : '—'}</span>
            </div>
            <div className="kv">
              <span>ID type</span>
              <span>{label(t.idType)}</span>
            </div>
            <div className="kv">
              <span>ID number</span>
              <span>{t.idNumber ?? '—'}</span>
            </div>
            <div className="kv">
              <span>Address</span>
              <span>{t.address ?? '—'}</span>
            </div>
          </section>
          {t.notes && (
            <section className="card card-pad">
              <h2 style={{ fontSize: 16, marginBottom: 6 }}>Notes</h2>
              {t.notes}
            </section>
          )}
          {can('tenants:write') && !t.activeLease && (
            <button className="btn danger" onClick={archive}>
              Archive tenant
            </button>
          )}
        </div>
      </div>
      {editing && <TenantForm tenant={t} onClose={() => setEditing(false)} />}
      {inviteUrl && <InviteLinkModal url={inviteUrl} who={t.fullName} onClose={() => setInviteUrl(null)} />}
    </>
  );
}

export function TenantForm({ tenant, onClose, onSaved }: { tenant?: TenantDetail; onClose: () => void; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm({
    type: tenant?.type ?? 'INDIVIDUAL',
    fullName: tenant?.fullName ?? '',
    phone: tenant?.phone ?? '',
    altPhone: tenant?.altPhone ?? '',
    email: tenant?.email ?? '',
    address: tenant?.address ?? '',
    idType: tenant?.idType ?? '',
    idNumber: '',
    emergencyName: tenant?.emergencyName ?? '',
    emergencyPhone: tenant?.emergencyPhone ?? '',
    notes: tenant?.notes ?? '',
  });
  const save = f.submit(async (v) => {
    const body = { ...v, idType: v.idType || null, idNumber: v.idNumber || undefined };
    if (tenant) {
      await api.patch(`/tenants/${tenant.id}`, body);
      toast('Tenant updated');
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
    } else {
      const created = await api.post<{ id: string }>('/tenants', body);
      toast('Tenant added');
      onSaved?.(created.id);
    }
    qc.invalidateQueries({ queryKey: ['tenants'] });
    onClose();
  });
  return (
    <Modal
      title={tenant ? 'Edit tenant' : 'Add tenant'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            {tenant ? 'Save changes' : 'Add tenant'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="seg">
          <button type="button" className={f.values.type === 'INDIVIDUAL' ? 'on' : ''} onClick={() => f.set('type', 'INDIVIDUAL')}>
            Individual
          </button>
          <button type="button" className={f.values.type === 'COMPANY' ? 'on' : ''} onClick={() => f.set('type', 'COMPANY')}>
            Company
          </button>
        </div>
        <div className="form-row">
          <Field label={f.values.type === 'COMPANY' ? 'Company name' : 'Full name'} error={f.errors.fullName}>
            <input {...f.bind('fullName')} autoFocus />
          </Field>
          <Field label="Mobile" error={f.errors.phone} hint="Must be unique">
            <input {...f.bind('phone')} inputMode="numeric" maxLength={10} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Email" error={f.errors.email} hint="Needed for the tenant portal and reminders">
            <input type="email" {...f.bind('email')} />
          </Field>
          <Field label="Alternate mobile" error={f.errors.altPhone}>
            <input {...f.bind('altPhone')} inputMode="numeric" maxLength={10} />
          </Field>
        </div>
        <Field label="Permanent address">
          <input {...f.bind('address')} />
        </Field>
        <div className="form-row">
          <Field label="ID type">
            <select {...f.bind('idType')}>
              <option value="">—</option>
              {['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID', 'GSTIN', 'OTHER'].map((x) => (
                <option key={x} value={x}>
                  {label(x)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ID number" hint={tenant ? 'Leave empty to keep the current number' : 'Visible only to admins and managers'}>
            <input {...f.bind('idNumber')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Emergency contact name">
            <input {...f.bind('emergencyName')} />
          </Field>
          <Field label="Emergency contact mobile" error={f.errors.emergencyPhone}>
            <input {...f.bind('emergencyPhone')} inputMode="numeric" maxLength={10} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea {...f.bind('notes')} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
