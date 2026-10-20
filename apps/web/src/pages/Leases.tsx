import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, confirmAction, Empty, ErrorNote, Field, InviteLinkModal, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date, inr, todayISO } from '../lib/format';
import { useProperties } from '../lib/queries';
import type { Lease, TenantRow } from '../lib/types';
import { TenantForm } from './Tenants';
import { LeaseProgress } from './UnitDetail';

export function LeasesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? (params.get('expiring') ? '' : 'ACTIVE');
  const expiring = params.get('expiring') ?? '';
  const propertyId = params.get('property') ?? '';
  const [q, setQ] = useState('');
  const properties = useProperties();
  const { data, isLoading, error } = useQuery({
    queryKey: ['leases', status, expiring, propertyId],
    queryFn: () => api.get<Lease[]>(`/leases${qs({ status, expiringInDays: expiring, propertyId })}`),
  });
  const list = useMemo(() => (data ?? []).filter((l) => !q || `${l.tenant.fullName} ${l.unit.unitNo} ${l.unit.property.name}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const tab = expiring ? 'EXPIRING' : status || 'ALL';
  const go = (t: string) => {
    const next = new URLSearchParams();
    if (propertyId) next.set('property', propertyId);
    if (t === 'EXPIRING') next.set('expiring', '60');
    else if (t !== 'ACTIVE') next.set('status', t === 'ALL' ? '' : t);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead
        title="Agreements"
        hint="A rent agreement links one tenant to one unit, with rent, deposit and dates. Activating it marks the unit as occupied."
        actions={
          can('leases:write') && (
            <Link className="btn primary" to="/leases/new">
              <Icon name="plus" /> New lease
            </Link>
          )
        }
      />
      <div className="tabs">
        {[
          ['ACTIVE', 'Active'],
          ['EXPIRING', 'Expiring ≤ 60 days'],
          ['DRAFT', 'Drafts'],
          ['EXPIRED,TERMINATED,RENEWED', 'Ended'],
          ['ALL', 'All'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="row">
        <div className="search" style={{ maxWidth: 320 }}>
          <span className="icon">
            <Icon name="search" />
          </span>
          <input aria-label="Search leases" placeholder="Tenant, unit or property" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="select-inline">
          <span>Property</span>
          <select
            value={propertyId}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set('property', e.target.value);
              else next.delete('property');
              setParams(next, { replace: true });
            }}
          >
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
        ) : !list.length ? (
          <Empty title="No leases here" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Unit</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="right">Days left</th>
                  <th className="right">Rent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => navigate(`/leases/${l.id}`)}>
                    <td>
                      <b>{l.tenant.fullName}</b>
                    </td>
                    <td>
                      {l.unit.unitNo} · {l.unit.property.name}
                    </td>
                    <td>{date(l.startDate)}</td>
                    <td>{date(l.endDate)}</td>
                    <td className="right num" style={l.status === 'ACTIVE' && l.daysLeft <= 30 ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>
                      {l.status === 'ACTIVE' ? l.daysLeft : '—'}
                    </td>
                    <td className="right num">{inr(l.monthlyRent)}</td>
                    <td>{l.status === 'ACTIVE' && l.daysLeft <= 30 ? <Chip tone="warn">Expiring soon</Chip> : <StatusChip status={l.status} />}</td>
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

interface PickUnit {
  id: string;
  unitNo: string;
  unitType: string;
  status: string;
  expectedRent: number;
  securityDeposit: number;
  property: { id: string; name: string };
}

const addYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** New lease wizard: unit + tenant → terms → portal access → review & activate. */
export function NewLeasePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [addingTenant, setAddingTenant] = useState(false);
  const [invite, setInvite] = useState<{ url: string; who: string; leaseId: string } | null>(null);
  const properties = useProperties();
  const start = todayISO();
  const f = useForm({
    propertyId: '',
    unitId: params.get('unit') ?? '',
    tenantId: params.get('tenant') ?? '',
    startDate: start,
    endDate: addYear(start),
    monthlyRent: '',
    securityDeposit: '',
    dueDay: '5',
    noticeDays: '30',
    escalationPct: '5',
    renewalTerms: 'Renewal for 11–12 months by mutual consent; rent increases by the agreed percentage.',
    invitePortal: true as boolean,
  });
  const v = f.values;

  const units = useQuery({
    queryKey: ['pick-units', v.propertyId],
    queryFn: () => api.get<PickUnit[]>(`/units${qs({ propertyId: v.propertyId, status: 'VACANT,RESERVED' })}`),
  });
  const tenants = useQuery({ queryKey: ['tenants', 'pick'], queryFn: () => api.get<TenantRow[]>('/tenants') });
  const pickable = (tenants.data ?? []).filter((t) => t.status !== 'ACTIVE');
  const unit = units.data?.find((u) => u.id === v.unitId);
  const tenant = tenants.data?.find((t) => t.id === v.tenantId);

  // Pre-fill rent and deposit from the chosen unit.
  useEffect(() => {
    if (unit) {
      f.set('monthlyRent', String(unit.expectedRent));
      f.set('securityDeposit', String(unit.securityDeposit));
      if (!v.propertyId) f.set('propertyId', unit.property.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id]);

  const stepOk = [true, !!(v.unitId && v.tenantId), !!(v.startDate && v.endDate && Number(v.monthlyRent) > 0), true, true];
  const save = (activate: boolean) =>
    f.submit(async (val) => {
      const lease = await api.post<Lease & { inviteUrl?: string }>('/leases', {
        unitId: val.unitId,
        tenantId: val.tenantId,
        startDate: val.startDate,
        endDate: val.endDate,
        monthlyRent: val.monthlyRent,
        securityDeposit: val.securityDeposit || 0,
        dueDay: val.dueDay,
        noticeDays: val.noticeDays,
        escalationPct: val.escalationPct || 0,
        renewalTerms: val.renewalTerms,
        activate,
        invitePortal: activate && val.invitePortal && !!tenant?.email,
      });
      qc.invalidateQueries();
      toast(activate ? `Lease activated · unit ${lease.unit.unitNo} is now Occupied` : 'Lease saved as draft');
      if (lease.inviteUrl) setInvite({ url: lease.inviteUrl, who: lease.tenant.fullName, leaseId: lease.id });
      else navigate(`/leases/${lease.id}`);
    })();

  const STEPS = ['Unit and tenant', 'Terms', 'Tenant access', 'Review'];
  return (
    <>
      <PageHead title="New agreement" hint="Four short steps: choose the unit and tenant, set rent and dates, invite the tenant, then activate." actions={<Link className="btn" to="/leases">Cancel</Link>} />
      <nav className="card steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s} className={step === i + 1 ? 'cur' : step > i + 1 ? 'done' : ''} onClick={() => (i + 1 < step || stepOk.slice(1, i + 1).every(Boolean)) && setStep(i + 1)} aria-current={step === i + 1 ? 'step' : undefined}>
            <i>{step > i + 1 ? '✓' : i + 1}</i>
            {s}
          </button>
        ))}
      </nav>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 1fr)' }}>
        <section className="card card-pad form" style={{ gap: 20 }}>
          <ErrorNote error={f.formError} />
          {step === 1 && (
            <>
              <div>
                <h2 style={{ fontSize: 20 }}>Choose the unit and tenant</h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  Only vacant or reserved units can get a new lease.
                </p>
              </div>
              <div className="form-row">
                <Field label="Property">
                  <select value={v.propertyId} onChange={(e) => (f.set('propertyId', e.target.value), f.set('unitId', ''))}>
                    <option value="">All properties</option>
                    {properties.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Unit" error={f.errors.unitId} hint="Rent and deposit are pre-filled from the unit">
                  <select {...f.bind('unitId')}>
                    <option value="">Choose a unit…</option>
                    {units.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitNo} · {u.unitType} · {u.status === 'RESERVED' ? 'Reserved' : 'Vacant'} · {inr(u.expectedRent)} {v.propertyId ? '' : `· ${u.property.name}`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Tenant" error={f.errors.tenantId} hint={<button type="button" className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setAddingTenant(true)}>+ Add a new tenant</button>}>
                <select {...f.bind('tenantId')}>
                  <option value="">Choose a tenant without an active lease…</option>
                  {pickable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} · {t.phone}
                    </option>
                  ))}
                </select>
              </Field>
              {tenant && (
                <div className="row card card-pad" style={{ borderColor: 'var(--primary)', background: '#f6fbf9' }}>
                  <b>{tenant.fullName}</b>
                  <span className="muted">
                    {tenant.phone}
                    {tenant.email ? ` · ${tenant.email}` : ' · no email yet'}
                  </span>
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <h2 style={{ fontSize: 20 }}>Agreement terms</h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  Unit {unit?.unitNo} · {tenant?.fullName}
                </p>
              </div>
              <div className="form-row">
                <Field label="Start date" error={f.errors.startDate}>
                  <input type="date" value={v.startDate} onChange={(e) => (f.set('startDate', e.target.value), f.set('endDate', addYear(e.target.value)))} />
                </Field>
                <Field label="End date" error={f.errors.endDate}>
                  <input type="date" {...f.bind('endDate')} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Monthly rent (₹)" error={f.errors.monthlyRent}>
                  <input type="number" {...f.bind('monthlyRent')} />
                </Field>
                <Field label="Security deposit (₹)" error={f.errors.securityDeposit}>
                  <input type="number" {...f.bind('securityDeposit')} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Rent due day" error={f.errors.dueDay} hint="Day of the month, 1–28">
                  <input type="number" min={1} max={28} {...f.bind('dueDay')} />
                </Field>
                <Field label="Notice period (days)" error={f.errors.noticeDays}>
                  <input type="number" {...f.bind('noticeDays')} />
                </Field>
                <Field label="Increase on renewal (%)" error={f.errors.escalationPct}>
                  <input type="number" step="0.5" {...f.bind('escalationPct')} />
                </Field>
              </div>
              <Field label="Renewal terms">
                <textarea {...f.bind('renewalTerms')} rows={2} />
              </Field>
            </>
          )}
          {step === 3 && (
            <>
              <div>
                <h2 style={{ fontSize: 20 }}>Tenant portal access</h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  The tenant can see their lease and monthly rent and raise maintenance requests from their phone.
                </p>
              </div>
              <label className="check card card-pad">
                <input type="checkbox" checked={v.invitePortal} disabled={!tenant?.email} onChange={(e) => f.set('invitePortal', e.target.checked)} />
                <span>
                  <b style={{ display: 'block' }}>Email a tenant portal invite</b>
                  <span className="muted small">
                    {tenant?.email ? `${tenant.email} gets a link to set a password (valid 48 hours).` : 'This tenant has no email address yet. Add one on their profile to invite them later.'}
                  </span>
                </span>
              </label>
              <div className="alert info small">Signed agreement upload comes with the document module (Phase 2). Until then, keep the PDF in your usual folder.</div>
            </>
          )}
          {step === 4 && (
            <>
              <div>
                <h2 style={{ fontSize: 20 }}>Review and activate</h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  Activating changes these records automatically:
                </p>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                <div className="alert info">
                  <Chip tone="info">Unit</Chip> Unit {unit?.unitNo} changes from <b>{unit?.status === 'RESERVED' ? 'Reserved' : 'Vacant'}</b> to <b>Occupied</b>
                </div>
                <div className="alert info">
                  <Chip tone="primary">Tenant</Chip> {tenant?.fullName} becomes an <b>Active</b> tenant
                </div>
                <div className="alert info">
                  <Chip tone="warn">Reminders</Chip> Expiry reminders at 60, 30 and 7 days before {date(v.endDate)}
                </div>
                {v.invitePortal && tenant?.email && (
                  <div className="alert info">
                    <Chip>Email</Chip> Portal invite sent to {tenant.email}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
            <button className="btn" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              Back
            </button>
            <div className="row">
              {step === 4 && (
                <button className="btn" onClick={() => save(false)} disabled={f.busy}>
                  Save as draft
                </button>
              )}
              {step < 4 ? (
                <button className="btn primary" onClick={() => setStep((s) => s + 1)} disabled={!stepOk[step]}>
                  Continue
                </button>
              ) : (
                <button className="btn primary" onClick={() => save(true)} disabled={f.busy}>
                  {f.busy ? 'Activating…' : 'Activate lease'}
                </button>
              )}
            </div>
          </div>
        </section>
        <aside className="card card-pad">
          <div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Lease summary
          </div>
          <div className="kv">
            <span>Property</span>
            <span>{unit?.property.name ?? '—'}</span>
          </div>
          <div className="kv">
            <span>Unit</span>
            <span>{unit ? `${unit.unitNo} · ${unit.unitType}` : '—'}</span>
          </div>
          <div className="kv">
            <span>Tenant</span>
            <span>{tenant?.fullName ?? '—'}</span>
          </div>
          <div className="kv">
            <span>Period</span>
            <span>
              {date(v.startDate)} – {date(v.endDate)}
            </span>
          </div>
          <div className="kv">
            <span>Monthly rent</span>
            <span>{v.monthlyRent ? inr(Number(v.monthlyRent)) : '—'}</span>
          </div>
          <div className="kv">
            <span>Deposit</span>
            <span>{v.securityDeposit ? inr(Number(v.securityDeposit)) : '—'}</span>
          </div>
          <div className="kv">
            <span>Rent due</span>
            <span>{v.dueDay}th of each month</span>
          </div>
          <div className="alert info small" style={{ marginTop: 12 }}>
            Rent is entered each month by the owner. Payment processing will be added in a later phase.
          </div>
        </aside>
      </div>
      {invite && <InviteLinkModal url={invite.url} who={invite.who} onClose={() => navigate(`/leases/${invite.leaseId}`)} />}
      {addingTenant && (
        <TenantForm
          onClose={() => setAddingTenant(false)}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ['tenants'] }).then(() => f.set('tenantId', id));
          }}
        />
      )}
    </>
  );
}

export function LeaseDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [modal, setModal] = useState<'renew' | 'terminate' | null>(null);
  const { data: l, error } = useQuery({ queryKey: ['lease', id], queryFn: () => api.get<Lease>(`/leases/${id}`) });
  if (error) return <ErrorNote error={error} />;
  if (!l) return <Loading />;

  const activate = async () => {
    if (!confirmAction(`Activate this lease? Unit ${l.unit.unitNo} becomes Occupied.`)) return;
    try {
      await api.post(`/leases/${l.id}/activate`);
      qc.invalidateQueries();
      toast('Lease activated');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <div className="crumbs">
        <Link to="/leases">Leases</Link> / {l.tenant.fullName} · Unit {l.unit.unitNo}
      </div>
      <div className="page-head">
        <div className="row">
          <h1>Lease · Unit {l.unit.unitNo}</h1>
          {l.status === 'ACTIVE' && l.daysLeft <= 30 ? <Chip tone="warn">Expiring in {l.daysLeft} days</Chip> : <StatusChip status={l.status} />}
        </div>
        {can('leases:write') && (
          <div className="row">
            {l.status === 'DRAFT' && (
              <button className="btn primary" onClick={activate}>
                Activate lease
              </button>
            )}
            {l.status === 'ACTIVE' && (
              <>
                <button className="btn danger" onClick={() => setModal('terminate')}>
                  End early
                </button>
                <button className="btn primary" onClick={() => setModal('renew')}>
                  Renew lease
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="grid-2">
        <section className="card card-pad">
          <div className="dl">
            <div>
              <div className="k">Tenant</div>
              <div className="v">
                <Link to={`/tenants/${l.tenant.id}`}>{l.tenant.fullName}</Link>
              </div>
            </div>
            <div>
              <div className="k">Unit</div>
              <div className="v">
                <Link to={`/units/${l.unit.id}`}>
                  {l.unit.unitNo} · {l.unit.property.name}
                </Link>
              </div>
            </div>
            <div>
              <div className="k">Start</div>
              <div className="v">{date(l.startDate)}</div>
            </div>
            <div>
              <div className="k">End</div>
              <div className="v">{date(l.endDate)}</div>
            </div>
            <div>
              <div className="k">Monthly rent</div>
              <div className="v">{inr(l.monthlyRent)}</div>
            </div>
            <div>
              <div className="k">Security deposit</div>
              <div className="v">{inr(l.securityDeposit)}</div>
            </div>
            <div>
              <div className="k">Rent due day</div>
              <div className="v">{l.dueDay}th</div>
            </div>
            <div>
              <div className="k">Notice period</div>
              <div className="v">{l.noticeDays} days</div>
            </div>
            <div>
              <div className="k">Increase on renewal</div>
              <div className="v">{l.escalationPct}%</div>
            </div>
          </div>
          {l.status === 'ACTIVE' && <LeaseProgress start={l.startDate} end={l.endDate} />}
          {l.renewalTerms && (
            <div style={{ marginTop: 18 }}>
              <div className="muted small">Renewal terms</div>
              <div>{l.renewalTerms}</div>
            </div>
          )}
          {l.terminationReason && (
            <div className="alert error" style={{ marginTop: 18 }}>
              Ended on {date(l.terminatedOn)}: {l.terminationReason}
            </div>
          )}
        </section>
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 16 }}>What happens next</h2>
          {l.status === 'ACTIVE' ? (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>Rent is entered by the owner each month (due on the {l.dueDay}th).</li>
              <li>Reminder emails go out 60, 30 and 7 days before {date(l.endDate)}.</li>
              <li>If not renewed, the lease expires automatically and the unit becomes Vacant.</li>
            </ul>
          ) : (
            <div className="muted">This lease is {l.status.toLowerCase()}.</div>
          )}
          {l.previousLeaseId && (
            <Link to={`/leases/${l.previousLeaseId}`} style={{ fontWeight: 700 }}>
              ← Previous agreement
            </Link>
          )}
          <Link className="btn" to={`/rent?unit=${l.unit.unitNo}`}>
            Rent for this unit
          </Link>
        </section>
      </div>
      {modal === 'renew' && <RenewModal lease={l} onClose={() => setModal(null)} onDone={(newId) => navigate(`/leases/${newId}`)} />}
      {modal === 'terminate' && <TerminateModal lease={l} onClose={() => setModal(null)} />}
    </>
  );
}

function RenewModal({ lease, onClose, onDone }: { lease: Lease; onClose: () => void; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nextStart = new Date(`${lease.endDate}T00:00:00Z`);
  nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const startIso = nextStart.toISOString().slice(0, 10);
  const f = useForm({ startDate: startIso, endDate: addYear(startIso), monthlyRent: String(Math.round(lease.monthlyRent * (1 + lease.escalationPct / 100))) });
  const save = f.submit(async (v) => {
    const next = await api.post<Lease>(`/leases/${lease.id}/renew`, v);
    qc.invalidateQueries();
    toast(`Lease renewed until ${date(next.endDate)}`);
    onDone(next.id);
  });
  return (
    <Modal
      title="Renew lease"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            Renew
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <p className="muted" style={{ margin: 0 }}>
          The current lease is marked Renewed and a new active lease continues from it. Rent includes the agreed {lease.escalationPct}% increase.
        </p>
        <div className="form-row">
          <Field label="New start date" error={f.errors.startDate}>
            <input type="date" {...f.bind('startDate')} />
          </Field>
          <Field label="New end date" error={f.errors.endDate}>
            <input type="date" {...f.bind('endDate')} />
          </Field>
        </div>
        <Field label="Monthly rent (₹)" error={f.errors.monthlyRent} hint={`Was ${inr(lease.monthlyRent)}`}>
          <input type="number" {...f.bind('monthlyRent')} />
        </Field>
      </form>
    </Modal>
  );
}

function TerminateModal({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm({ date: todayISO(), reason: '' });
  const save = f.submit(async (v) => {
    await api.post(`/leases/${lease.id}/terminate`, v);
    qc.invalidateQueries();
    toast(`Lease ended · unit ${lease.unit.unitNo} is now Vacant`);
    onClose();
  });
  return (
    <Modal
      title="End lease early"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" onClick={() => save()} disabled={f.busy}>
            End lease
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="alert warn small">Unit {lease.unit.unitNo} becomes Vacant and {lease.tenant.fullName} becomes a previous tenant. This cannot be undone.</div>
        <Field label="Last day" error={f.errors.date}>
          <input type="date" {...f.bind('date')} />
        </Field>
        <Field label="Reason" error={f.errors.reason}>
          <textarea {...f.bind('reason')} rows={2} placeholder="e.g. Tenant moved out, job transfer" />
        </Field>
      </form>
    </Modal>
  );
}
