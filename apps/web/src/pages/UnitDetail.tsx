import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, confirmAction, Empty, ErrorNote, Field, Loading, Modal, PRIORITY_COLOR, StatusChip, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, date, initials, inr, label, periodLabel, modeLabel } from '../lib/format';
import type { RentStatus, TicketStatus, UnitStatus } from '../lib/types';

interface UnitDetail {
  id: string;
  unitNo: string;
  floor: number | null;
  block: string | null;
  unitType: string;
  areaSqft: number | null;
  expectedRent: number;
  securityDeposit: number;
  status: UnitStatus;
  vacantSince: string | null;
  notes: string | null;
  property: { id: string; name: string; code: string };
  activeLease: { id: string; tenant: { id: string; fullName: string; phone: string; email: string | null }; startDate: string; endDate: string; monthlyRent: number; securityDeposit: number; dueDay: number; daysLeft: number } | null;
  pendingAmount: number;
  receivedThisLease: number;
  leases: { id: string; status: string; startDate: string; endDate: string; monthlyRent: number; tenant: { id: string; fullName: string } }[];
  rent: { id: string; period: string; amount: number; dueDate: string; status: RentStatus; paidOn: string | null; mode: string | null; reference: string | null }[];
  tickets: { id: string; ticketNo: number; title: string; category: string; priority: string; status: TicketStatus; actualCost: number | null; createdAt: string; closedAt: string | null }[];
  timeline: { id: string; action: string; summary: string; createdAt: string; by: string }[];
}

export function UnitDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: u, error } = useQuery({ queryKey: ['unit', id], queryFn: () => api.get<UnitDetail>(`/units/${id}`) });

  if (error) return <ErrorNote error={error} />;
  if (!u) return <Loading />;
  const lease = u.activeLease;
  const thisMonth = u.rent[0];

  const remove = async () => {
    if (!confirmAction(`Delete unit ${u.unitNo}? It will be hidden from lists (soft delete).`)) return;
    try {
      await api.del(`/units/${u.id}`);
      toast(`Unit ${u.unitNo} deleted`);
      qc.invalidateQueries({ queryKey: ['property-units', u.property.id] });
      navigate(`/properties/${u.property.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const unitTitle = /^(unit|house|tenement|flat|shop|plot|bungalow|villa)/i.test(u.unitNo) ? u.unitNo : `Unit ${u.unitNo}`;

  return (
    <>
      <div className="crumbs">
        <Link to="/properties">Properties</Link> / <Link to={`/properties/${u.property.id}`}>{u.property.name}</Link> / {unitTitle}
      </div>
      <div className="page-head">
        <div className="row">
          <h1>{unitTitle}</h1>
          <StatusChip status={u.status} />
          {thisMonth && lease && <StatusChip status={thisMonth.status} text={`${periodLabel(thisMonth.period).split(' ')[0]} rent ${label(thisMonth.status).toLowerCase()}`} />}
        </div>
        <div className="row">
          {can('units:write') && (
            <button className="btn" onClick={() => setEditing(true)}>
              <Icon name="edit" /> Edit unit
            </button>
          )}
          {can('maintenance:write') && (
            <Link className="btn" to={`/maintenance?new=1&unit=${u.id}`}>
              Raise ticket
            </Link>
          )}
          {lease && can('rent:write') && (
            <Link className="btn primary" to={`/rent?unit=${u.unitNo}`}>
              Enter rent
            </Link>
          )}
          {!lease && can('leases:write') && (u.status === 'VACANT' || u.status === 'RESERVED') && (
            <Link className="btn primary" to={`/leases/new?unit=${u.id}`}>
              Create lease
            </Link>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
        <div className="stack" style={{ gap: 20 }}>
          <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Unit information</h2>
            <div className="dl">
              <div>
                <div className="k">Type</div>
                <div className="v">{u.unitType}</div>
              </div>
              <div>
                <div className="k">Floor / block</div>
                <div className="v">
                  {u.floor ?? '—'}
                  {u.block ? ` · Block ${u.block}` : ''}
                </div>
              </div>
              <div>
                <div className="k">Area</div>
                <div className="v">{u.areaSqft ? `${u.areaSqft.toLocaleString('en-IN')} sq ft` : '—'}</div>
              </div>
              <div>
                <div className="k">Status</div>
                <div className="v">{label(u.status)}</div>
              </div>
              {can('rent:read') && (
                <>
                  <div>
                    <div className="k">Monthly rent</div>
                    <div className="v">{inr(lease?.monthlyRent ?? u.expectedRent)}</div>
                  </div>
                  <div>
                    <div className="k">Security deposit</div>
                    <div className="v">{inr(lease?.securityDeposit ?? u.securityDeposit)}</div>
                  </div>
                  <div>
                    <div className="k">Pending amount</div>
                    <div className="v" style={{ color: u.pendingAmount ? 'var(--danger)' : 'var(--success)' }}>
                      {inr(u.pendingAmount)}
                    </div>
                  </div>
                </>
              )}
              <div>
                <div className="k">{lease ? 'Rent due day' : 'Vacant since'}</div>
                <div className="v">{lease ? `${lease.dueDay}th of month` : date(u.vacantSince)}</div>
              </div>
            </div>
          </section>

          <section className="card card-pad">
            {lease ? (
              <div className="row" style={{ gap: 20 }}>
                <span className="avatar lg">{initials(lease.tenant.fullName)}</span>
                <div style={{ flex: '1 1 180px' }}>
                  <div className="muted small">Current tenant</div>
                  <Link to={`/tenants/${lease.tenant.id}`} style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                    {lease.tenant.fullName}
                  </Link>
                  <div className="muted small">
                    {lease.tenant.phone}
                    {lease.tenant.email ? ` · ${lease.tenant.email}` : ''}
                  </div>
                </div>
                <div style={{ flex: '1 1 240px', background: 'var(--surface-2)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="muted small">Agreement</div>
                  <b>
                    {date(lease.startDate)} → {date(lease.endDate)}
                  </b>
                  <LeaseProgress start={lease.startDate} end={lease.endDate} />
                  <div className="muted small" style={{ marginTop: 6, color: lease.daysLeft <= 30 ? 'var(--warn)' : undefined }}>
                    {lease.daysLeft} days left
                  </div>
                </div>
                <Link className="btn" to={`/leases/${lease.id}`}>
                  View lease
                </Link>
              </div>
            ) : (
              <Empty title="No current tenant">This unit has no active lease.</Empty>
            )}
          </section>

          {can('rent:read') && (
            <section className="card">
              <div className="card-head">
                <h2>Rent history</h2>
                {lease && (
                  <span className="muted small">
                    Received this lease <b style={{ color: 'var(--ink)' }}>{inr(u.receivedThisLease)}</b>
                  </span>
                )}
              </div>
              {u.rent.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="right">Amount</th>
                        <th>Due</th>
                        <th>Paid on</th>
                        <th>Mode · ref</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {u.rent.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <b>{periodLabel(r.period)}</b>
                          </td>
                          <td className="right num">{inr(r.amount)}</td>
                          <td className="muted">{date(r.dueDate)}</td>
                          <td>{date(r.paidOn)}</td>
                          <td className="muted">{r.mode ? `${modeLabel(r.mode)}${r.reference ? ` · ${r.reference}` : ''}` : '—'}</td>
                          <td>
                            <StatusChip status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No rent entered yet" />
              )}
            </section>
          )}
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <section className="card card-pad">
            <div className="row between" style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: 16 }}>Maintenance history</h2>
              {u.tickets.some((t) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(t.status)) ? <Chip tone="warn">Open requests</Chip> : <Chip tone="success">No open requests</Chip>}
            </div>
            {!u.tickets.length && <div className="muted small">No requests for this unit.</div>}
            {u.tickets.map((t) => (
              <Link key={t.id} to={`/maintenance?ticket=${t.id}`} className="list-item" style={{ color: 'var(--ink)' }}>
                <span className="stripe" style={{ background: PRIORITY_COLOR[t.priority] }} />
                <div style={{ flex: 1 }}>
                  <b>
                    #{t.ticketNo} {t.title}
                  </b>
                  <div className="muted small">
                    {t.category} · {t.closedAt ? `closed ${date(t.closedAt)}` : `raised ${ago(t.createdAt)}`}
                    {t.actualCost ? ` · ${inr(t.actualCost)}` : ''}
                  </div>
                </div>
                <StatusChip status={t.status} />
              </Link>
            ))}
          </section>

          <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Documents</h2>
            <div className="muted small">Lease agreements, KYC and bills will be uploaded here (Phase 2 — document storage).</div>
          </section>

          <section className="card card-pad stack">
            <h2 style={{ fontSize: 16 }}>Notes</h2>
            <div className={u.notes ? '' : 'muted'}>{u.notes || 'No notes.'}</div>
          </section>

          <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Activity timeline</h2>
            {!u.timeline.length && <div className="muted small">No activity recorded yet.</div>}
            <div className="timeline">
              {u.timeline.map((a) => (
                <div className="ev" key={a.id}>
                  <div className="rail">
                    <i />
                    <b />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.summary}</div>
                    <div className="muted small">
                      {date(a.createdAt.slice(0, 10))} · {a.by}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {can('units:write') && u.status !== 'OCCUPIED' && (
            <button className="btn danger" onClick={remove}>
              Delete unit
            </button>
          )}
        </div>
      </div>

      {editing && <EditUnit u={u} onClose={() => setEditing(false)} />}
    </>
  );
}

export function LeaseProgress({ start, end }: { start: string; end: string }) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const pct = Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100));
  return (
    <div className="bar" style={{ height: 6, marginTop: 10 }}>
      <span style={{ width: `${pct}%`, background: 'var(--primary)' }} />
    </div>
  );
}

function EditUnit({ u, onClose }: { u: UnitDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const occupied = u.status === 'OCCUPIED';
  const f = useForm({
    unitNo: u.unitNo,
    floor: u.floor === null ? '' : String(u.floor),
    block: u.block ?? '',
    unitType: u.unitType,
    areaSqft: u.areaSqft ? String(u.areaSqft) : '',
    expectedRent: String(u.expectedRent),
    securityDeposit: String(u.securityDeposit),
    status: u.status,
    notes: u.notes ?? '',
  });
  const save = f.submit(async ({ status, ...v }) => {
    await api.patch(`/units/${u.id}`, { ...v, floor: v.floor === '' ? null : v.floor, areaSqft: v.areaSqft || null, ...(occupied ? {} : { status }) });
    toast('Unit updated');
    qc.invalidateQueries({ queryKey: ['unit', u.id] });
    qc.invalidateQueries({ queryKey: ['property-units', u.property.id] });
    onClose();
  });
  return (
    <Modal
      title={`Edit ${u.unitNo}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            Save
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="House / Tenement / Flat / Unit No." error={f.errors.unitNo} hint="Number in its society, building, or landmark">
            <input {...f.bind('unitNo')} />
          </Field>
          <Field label="Floor (Optional)" hint="Leave blank for house / tenement">
            <input type="number" {...f.bind('floor')} placeholder="Leave blank if none" />
          </Field>
          <Field label="Block / Wing / Lane">
            <input {...f.bind('block')} placeholder="Optional" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Type / Category" error={f.errors.unitType}>
            <input {...f.bind('unitType')} placeholder="Tenement, 2BHK, Row House…" />
          </Field>
          <Field label="Area (sq ft)">
            <input type="number" {...f.bind('areaSqft')} />
          </Field>
          <Field label="Status" hint={occupied ? 'Set by the lease' : undefined}>
            <select {...f.bind('status')} disabled={occupied}>
              {occupied && <option value="OCCUPIED">Occupied</option>}
              <option value="VACANT">Vacant</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Expected rent (₹)" error={f.errors.expectedRent}>
            <input type="number" {...f.bind('expectedRent')} />
          </Field>
          <Field label="Security deposit (₹)" error={f.errors.securityDeposit}>
            <input type="number" {...f.bind('securityDeposit')} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea {...f.bind('notes')} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
