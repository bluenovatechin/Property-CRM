import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { confirmAction, Empty, ErrorNote, Field, Loading, Modal, PageHead, StatusChip, useForm, useToast } from '../components/ui';
import { api, downloadUrl, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentPeriod, date, inr, inrShort, periodLabel, shiftPeriod, todayISO, modeLabel } from '../lib/format';
import { useProperties } from '../lib/queries';
import type { RentRow } from '../lib/types';

interface RentMonth {
  summary: {
    period: string;
    label: string;
    leases: number;
    entered: number;
    due: number;
    paid: number;
    pending: number;
    overdue: number;
    notEnteredRent: number;
    counts: Record<'PAID' | 'PENDING' | 'OVERDUE' | 'NOT_ENTERED', number>;
  };
  rows: RentRow[];
}

const TABS: [string, string][] = [
  ['', 'All'],
  ['PAID', 'Paid'],
  ['PENDING', 'Pending'],
  ['OVERDUE', 'Overdue'],
  ['NOT_ENTERED', 'Not entered'],
];

export function RentPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? currentPeriod();
  const propertyId = params.get('property') ?? '';
  const status = params.get('status') ?? '';
  const [q, setQ] = useState(params.get('unit') ?? '');
  const [editing, setEditing] = useState<RentRow | 'new' | null>(null);
  const properties = useProperties();
  const all = useQuery({
    queryKey: ['rent', period, propertyId],
    queryFn: () => api.get<RentMonth>(`/rent${qs({ period, propertyId })}`),
  });
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const rows = (all.data?.rows ?? []).filter(
    (r) => (!status || r.status === status) && (!q || r.unit.unitNo.toLowerCase().includes(q.toLowerCase()) || r.tenant.fullName.toLowerCase().includes(q.toLowerCase()) || r.tenant.phone.includes(q)),
  );
  const s = all.data?.summary;
  const months = Array.from({ length: 13 }, (_, i) => shiftPeriod(currentPeriod(), 1 - i));

  const prefill = async () => {
    if (!confirmAction(`Create Pending rent entries for every lease that has none in ${periodLabel(period)}? You can edit or delete them after.`)) return;
    try {
      const res = await api.post<{ created: number }>('/rent/prefill', { period, propertyId: propertyId || undefined });
      toast(res.created ? `${res.created} entries created from leases` : 'Every lease already has an entry this month');
      qc.invalidateQueries({ queryKey: ['rent'] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={`${propertyId ? properties.data?.find((p) => p.id === propertyId)?.name ?? '' : 'All properties'} · ${periodLabel(period)}`}
        title="Monthly rent"
        actions={
          <>
            {can('rent:write') && (
              <button className="btn" onClick={prefill}>
                Pre-fill from leases
              </button>
            )}
            {can('reports:read') && (
              <a className="btn" href={downloadUrl(`/reports/collection${qs({ period, propertyId, format: 'csv' })}`)}>
                <Icon name="download" /> Export CSV
              </a>
            )}
            {can('rent:write') && (
              <button className="btn primary" onClick={() => setEditing('new')}>
                <Icon name="plus" /> Enter rent
              </button>
            )}
          </>
        }
      />
      <div className="alert info">
        <Icon name="alert" />
        <span>
          <b>Rent is entered manually each month by the property owner.</b> Mark an entry Paid with its date and reference. Payment processing (partial payments, receipts, online payment) will be added later by the senior team.
        </span>
      </div>
      <div className="row">
        <label className="select-inline">
          <span>Month</span>
          <select value={period} onChange={(e) => setParam('period', e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
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
        <div className="search" style={{ maxWidth: 280 }}>
          <span className="icon">
            <Icon name="search" />
          </span>
          <input aria-label="Find unit or tenant" placeholder="Unit, tenant or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <ErrorNote error={all.error} />
      {s && (
        <section className="card strip">
          <div>
            <div className="label">Entered</div>
            <div className="value">
              {s.entered} <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>of {s.leases} leases</span>
            </div>
          </div>
          <div>
            <div className="label">Total entered</div>
            <div className="value">{inrShort(s.due)}</div>
          </div>
          <div>
            <div className="label">Paid</div>
            <div className="value tone-good">{inrShort(s.paid)}</div>
          </div>
          <div>
            <div className="label">Pending</div>
            <div className="value">{inrShort(s.pending)}</div>
          </div>
          <div>
            <div className="label">Overdue</div>
            <div className="value tone-bad">{inrShort(s.overdue)}</div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="tabs" role="tablist" style={{ padding: '0 22px' }}>
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" className={status === k ? 'on' : ''} onClick={() => setParam('status', k)}>
              {l}{' '}
              <span className="chip neutral" style={{ height: 22 }}>
                {k ? s?.counts[k as keyof RentMonth['summary']['counts']] ?? 0 : s?.leases ?? 0}
              </span>
            </button>
          ))}
        </div>
        {all.isLoading ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title="Nothing to show">{status ? 'No rent with this status this month.' : 'No active leases for this month.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th className="right">Rent</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Paid on</th>
                  <th className="hide-sm">Mode · ref</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.leaseId}>
                    <td>
                      <Link to={`/units/${r.unit.id}`}>
                        <b>{r.unit.unitNo}</b>
                      </Link>
                      {!propertyId && <div className="muted small">{r.unit.property.name}</div>}
                    </td>
                    <td>
                      <Link to={`/tenants/${r.tenant.id}`} style={{ color: 'var(--ink)' }}>
                        {r.tenant.fullName}
                      </Link>
                    </td>
                    <td className="right num">{inr(r.amount)}</td>
                    <td className="muted">{date(r.dueDate)}</td>
                    <td>
                      <StatusChip status={r.status} />
                    </td>
                    <td>{date(r.paidOn)}</td>
                    <td className="muted hide-sm">{r.mode ? `${modeLabel(r.mode)}${r.reference ? ` · ${r.reference}` : ''}` : '—'}</td>
                    <td className="right">
                      {can('rent:write') && (
                        <button className={`btn sm ${r.status === 'NOT_ENTERED' ? 'soft' : ''}`} onClick={() => setEditing(r)}>
                          {r.status === 'NOT_ENTERED' ? 'Enter' : r.status === 'PAID' ? 'Edit' : 'Mark paid'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s && <div className="muted small" style={{ padding: '12px 22px' }}>Showing {rows.length} of {s.leases} leases with rent this month.</div>}
      </section>

      {editing && <RentEntryModal period={period} row={editing === 'new' ? null : editing} rows={all.data?.rows ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function RentEntryModal({ period, row, rows, onClose }: { period: string; row: RentRow | null; rows: RentRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const choices = rows.filter((r) => r.status === 'NOT_ENTERED');
  const first = row ?? choices[0] ?? null;
  const editingEntry = !!row?.entryId;
  const f = useForm({
    leaseId: first?.leaseId ?? '',
    amount: String(first?.amount ?? ''),
    dueDate: first?.dueDate ?? '',
    status: (row?.status === 'PAID' || (row && row.status !== 'NOT_ENTERED') ? 'PAID' : 'PENDING') as 'PAID' | 'PENDING',
    paidOn: row?.paidOn ?? todayISO(),
    mode: row?.mode ?? 'UPI',
    reference: row?.reference ?? '',
    notes: row?.notes ?? '',
  });
  const current = rows.find((r) => r.leaseId === f.values.leaseId);

  const pick = (leaseId: string) => {
    const r = rows.find((x) => x.leaseId === leaseId);
    f.set('leaseId', leaseId);
    if (r) {
      f.set('amount', String(r.amount));
      f.set('dueDate', r.dueDate);
    }
  };

  const save = f.submit(async (v) => {
    const paid = v.status === 'PAID';
    const body = { amount: v.amount, dueDate: v.dueDate, status: v.status, paidOn: paid ? v.paidOn : null, mode: paid ? v.mode : null, reference: v.reference, notes: v.notes };
    if (editingEntry) await api.patch(`/rent/${row!.entryId}`, body);
    else await api.post('/rent', { ...body, leaseId: v.leaseId, period });
    toast(paid ? `Rent marked Paid · ${inr(Number(v.amount))}` : 'Rent entry saved');
    qc.invalidateQueries({ queryKey: ['rent'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    onClose();
  });

  const remove = async () => {
    if (!row?.entryId || !confirmAction('Delete this rent entry?')) return;
    try {
      await api.del(`/rent/${row.entryId}`);
      toast('Entry deleted');
      qc.invalidateQueries({ queryKey: ['rent'] });
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <Modal
      title={`${editingEntry ? 'Update' : 'Enter'} rent · ${periodLabel(period)}`}
      onClose={onClose}
      footer={
        <>
          {editingEntry && row?.status !== 'PAID' && (
            <button className="btn danger" style={{ marginRight: 'auto' }} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy || !f.values.leaseId}>
            Save entry
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        {row ? (
          <div className="card card-pad row" style={{ background: 'var(--surface-2)', border: 0 }}>
            <b>Unit {row.unit.unitNo}</b>
            <span className="muted">
              {row.tenant.fullName} · {row.unit.property.name}
            </span>
          </div>
        ) : choices.length ? (
          <Field label="Unit" error={f.errors.leaseId}>
            <select value={f.values.leaseId} onChange={(e) => pick(e.target.value)}>
              {choices.map((r) => (
                <option key={r.leaseId} value={r.leaseId}>
                  {r.unit.unitNo} · {r.tenant.fullName} · {r.unit.property.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="alert info">Every lease already has rent entered for {periodLabel(period)}. Use “Edit” or “Mark paid” in the list.</div>
        )}
        {f.values.leaseId && (
          <>
            <div className="form-row">
              <Field label="Amount (₹)" error={f.errors.amount} hint={current ? `From the lease: ${inr(current.monthlyRent)}` : undefined}>
                <input type="number" {...f.bind('amount')} />
              </Field>
              <Field label="Due date" error={f.errors.dueDate}>
                <input type="date" {...f.bind('dueDate')} />
              </Field>
            </div>
            <div className="field">
              <span>Status</span>
              <div className="seg">
                <button type="button" className={f.values.status === 'PENDING' ? 'on' : ''} onClick={() => f.set('status', 'PENDING')}>
                  Pending
                </button>
                <button type="button" className={f.values.status === 'PAID' ? 'on' : ''} onClick={() => f.set('status', 'PAID')}>
                  Paid
                </button>
              </div>
            </div>
            {f.values.status === 'PAID' && (
              <div className="form-row">
                <Field label="Paid on" error={f.errors.paidOn}>
                  <input type="date" {...f.bind('paidOn')} />
                </Field>
                <Field label="Mode" error={f.errors.mode}>
                  <select {...f.bind('mode')}>
                    <option value="UPI">UPI</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Card</option>
                  </select>
                </Field>
                <Field label="Reference" hint="UTR / cheque no.">
                  <input {...f.bind('reference')} />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <input {...f.bind('notes')} />
            </Field>
            <div className="alert info small">Only one entry per unit per month — a duplicate is blocked. Pending entries past the due date turn Overdue automatically.</div>
          </>
        )}
      </form>
    </Modal>
  );
}
