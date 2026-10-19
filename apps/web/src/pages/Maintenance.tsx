import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, Empty, ErrorNote, Field, Loading, Modal, PageHead, PRIORITY_COLOR, StatusChip, useForm, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, dateTime, inr, label, timeLeft } from '../lib/format';
import { useAssignees, useProperties } from '../lib/queries';
import type { GridUnit, Ticket, TicketDetail, TicketStatus } from '../lib/types';

const CATEGORIES = ['Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Cleaning', 'Appliance', 'Lift', 'Security', 'Other'];
const COLUMNS: { name: string; statuses: TicketStatus[] }[] = [
  { name: 'Open', statuses: ['OPEN', 'REOPENED'] },
  { name: 'In progress', statuses: ['IN_PROGRESS'] },
  { name: 'Resolved', statuses: ['RESOLVED'] },
  { name: 'Closed', statuses: ['CLOSED', 'CANCELLED'] },
];
const ACTION_LABEL: Record<TicketStatus, string> = { IN_PROGRESS: 'Start work', RESOLVED: 'Mark resolved', CLOSED: 'Close ticket', REOPENED: 'Reopen', CANCELLED: 'Cancel', OPEN: 'Open' };

export function MaintenancePage() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const propertyId = params.get('property') ?? '';
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [assignee, setAssignee] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const properties = useProperties();
  const assignees = useAssignees(can('maintenance:assign'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', propertyId, priority, category, assignee],
    queryFn: () => api.get<Ticket[]>(`/maintenance${qs({ propertyId, priority, category, assignedToId: assignee })}`),
  });
  const selectedId = params.get('ticket') ?? data?.find((t) => t.status !== 'CLOSED')?.id ?? data?.[0]?.id ?? null;
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('ticket', id);
    setParams(next, { replace: true });
  };

  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, items: (data ?? []).filter((t) => c.statuses.includes(t.status)) })), [data]);
  const breached = (data ?? []).filter((t) => t.slaBreached).length;

  return (
    <>
      <PageHead
        eyebrow={me?.role === 'STAFF' ? 'Tickets assigned to you' : propertyId ? properties.data?.find((p) => p.id === propertyId)?.name : 'All properties'}
        title="Maintenance"
        actions={
          can('maintenance:write') && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" /> New ticket
            </button>
          )
        }
      />
      <div className="row">
        {me?.role !== 'STAFF' && (
          <label className="select-inline">
            <span>Property</span>
            <select
              value={propertyId}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.value) next.set('property', e.target.value);
                else next.delete('property');
                next.delete('ticket');
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
        )}
        <label className="select-inline">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All</option>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-inline">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {assignees.data && (
          <label className="select-inline">
            <span>Assignee</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Anyone</option>
              <option value="none">Unassigned</option>
              {assignees.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {breached > 0 && <Chip tone="danger">{breached} past SLA</Chip>}
        <div className="legend muted small" style={{ marginLeft: 'auto' }}>
          {Object.entries(PRIORITY_COLOR).map(([p, c]) => (
            <span key={p}>
              <i className="dot" style={{ background: c }} />
              {label(p)}
            </span>
          ))}
        </div>
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 1fr)' }}>
          <div className="board">
            {columns.map((c) => (
              <section className="col" key={c.name} aria-label={c.name}>
                <div className="row between" style={{ padding: '2px 4px' }}>
                  <b>{c.name}</b>
                  <span className="chip neutral" style={{ background: '#fff' }}>
                    {c.items.length}
                  </span>
                </div>
                {c.items.map((t) => (
                  <button key={t.id} className={`ticket ${selectedId === t.id ? 'sel' : ''}`} onClick={() => select(t.id)}>
                    <span className="stripe" style={{ background: PRIORITY_COLOR[t.priority] }} />
                    <span className="row between small" style={{ flexWrap: 'nowrap' }}>
                      <span className="muted" style={{ fontWeight: 700 }}>
                        #{t.ticketNo} · {t.unit ? `Unit ${t.unit.unitNo}` : 'Common area'}
                      </span>
                      <b style={{ color: PRIORITY_COLOR[t.priority] }}>{label(t.priority)}</b>
                    </span>
                    <b style={{ lineHeight: 1.3 }}>{t.title}</b>
                    <span className="small" style={{ fontWeight: 600, color: t.slaBreached ? 'var(--danger)' : 'var(--muted)' }}>
                      {['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status) ? `${t.category} · ${t.actualCost ? inr(t.actualCost) : label(t.status)}` : `${t.category} · ${timeLeft(t.slaDueAt)}`}
                    </span>
                    <span className="muted small">
                      {t.assignedTo?.name ?? t.vendorName ?? 'Unassigned'}
                      {!propertyId && ` · ${t.property.name}`}
                    </span>
                  </button>
                ))}
                {!c.items.length && <div className="muted small" style={{ padding: 8 }}>No tickets</div>}
              </section>
            ))}
          </div>
          {selectedId ? <TicketPanel id={selectedId} /> : <section className="card card-pad"><Empty title="No tickets">Raise a ticket to get started.</Empty></section>}
        </div>
      )}
      {creating && (
        <NewTicket
          unitId={params.get('unit') ?? undefined}
          defaultPropertyId={propertyId}
          onClose={() => {
            setCreating(false);
            const next = new URLSearchParams(params);
            next.delete('new');
            next.delete('unit');
            setParams(next, { replace: true });
          }}
          onCreated={select}
        />
      )}
    </>
  );
}

function TicketPanel({ id }: { id: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const assignees = useAssignees(can('maintenance:assign'));
  const { data: t, error } = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get<TicketDetail>(`/maintenance/${id}`) });
  const [comment, setComment] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setCost(t?.actualCost ? String(t.actualCost) : ''), [t?.id, t?.actualCost]);

  if (error) return <ErrorNote error={error} />;
  if (!t) return <section className="card"><Loading /></section>;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['ticket', id] });
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const move = (status: TicketStatus) =>
    run(() => api.post(`/maintenance/${t.id}/status`, { status, comment: comment || undefined, actualCost: status === 'CLOSED' && cost ? cost : undefined }), `Ticket #${t.ticketNo}: ${label(status)}`).then(() => setComment(''));

  return (
    <aside className="card card-pad stack" aria-label="Ticket details" style={{ position: 'sticky', top: 90, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
      <div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        Ticket #{t.ticketNo}
      </div>
      <h2 style={{ fontSize: 20, lineHeight: 1.25 }}>{t.title}</h2>
      <div className="row" style={{ gap: 6 }}>
        <StatusChip status={t.priority} />
        <StatusChip status={t.status} />
        <Chip tone="primary">{t.category}</Chip>
      </div>
      <div className="muted">{t.description}</div>
      <div>
        <div className="kv">
          <span>Location</span>
          <span>
            {t.unit ? <Link to={`/units/${t.unit.id}`}>Unit {t.unit.unitNo}</Link> : 'Common area'}, {t.property.name}
          </span>
        </div>
        {t.tenant && (
          <div className="kv">
            <span>Tenant</span>
            <span>{t.tenant.fullName}</span>
          </div>
        )}
        <div className="kv">
          <span>Raised by</span>
          <span>
            {t.raisedBy.name} · {ago(t.createdAt)}
          </span>
        </div>
        <div className="kv">
          <span>SLA</span>
          <span style={{ color: t.slaBreached ? 'var(--danger)' : undefined }}>{['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status) ? 'Met' : timeLeft(t.slaDueAt)}</span>
        </div>
        <div className="kv">
          <span>Estimated / actual cost</span>
          <span>
            {inr(t.estimatedCost)} / {inr(t.actualCost)}
          </span>
        </div>
      </div>
      {can('maintenance:assign') && !['CLOSED', 'CANCELLED'].includes(t.status) && (
        <Field label="Assigned to">
          <select value={t.assignedTo?.id ?? ''} disabled={busy} onChange={(e) => run(() => api.patch(`/maintenance/${t.id}`, { assignedToId: e.target.value || null }), 'Assignee updated')}>
            <option value="">Unassigned</option>
            {assignees.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {label(a.role)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!can('maintenance:assign') && (
        <div className="kv">
          <span>Assigned to</span>
          <span>{t.assignedTo?.name ?? t.vendorName ?? 'Unassigned'}</span>
        </div>
      )}
      {can('maintenance:write') && t.allowedNext.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          {t.allowedNext.includes('CLOSED') && (
            <Field label="Actual cost (₹)" hint="Booked as a maintenance expense when the ticket is closed">
              <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          )}
          <input className="input" placeholder="Add a note with this update (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            {t.allowedNext.map((s) => (
              <button key={s} className={`btn ${s === 'CANCELLED' || s === 'REOPENED' ? '' : 'primary'}`} style={{ flex: 1 }} disabled={busy} onClick={() => move(s)}>
                {ACTION_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }} className="stack">
        <b>Updates</b>
        {t.comments.map((c) => (
          <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5 }}>
            <div className="row between small">
              <b>{c.by}</b>
              <span className="muted">{dateTime(c.createdAt)}</span>
            </div>
            <div>{c.comment}</div>
            {c.newStatus && <div className="muted small">→ {label(c.newStatus)}</div>}
          </div>
        ))}
        {can('maintenance:write') && (
          <form
            className="row"
            style={{ flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) run(() => api.post(`/maintenance/${t.id}/comments`, { comment }), 'Update added').then(() => setComment(''));
            }}
          >
            <input className="input" placeholder="Write an update…" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Write an update" />
            <button className="btn" disabled={busy || !comment.trim()}>
              Post
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

function NewTicket({ unitId, defaultPropertyId, onClose, onCreated }: { unitId?: string; defaultPropertyId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const properties = useProperties();
  const assignees = useAssignees(can('maintenance:assign'));
  const unitInfo = useQuery({ queryKey: ['unit-lite', unitId], queryFn: () => api.get<{ id: string; property: { id: string } }>(`/units/${unitId}`), enabled: !!unitId });
  const f = useForm({ propertyId: defaultPropertyId ?? '', unitId: unitId ?? '', category: 'Plumbing', title: '', description: '', priority: 'MEDIUM', assignedToId: '', estimatedCost: '' });
  useEffect(() => {
    if (unitInfo.data) f.set('propertyId', unitInfo.data.property.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitInfo.data]);
  const units = useQuery({
    queryKey: ['property-units', f.values.propertyId],
    queryFn: () => api.get<GridUnit[]>(`/properties/${f.values.propertyId}/units`),
    enabled: !!f.values.propertyId,
  });
  const save = f.submit(async (v) => {
    const t = await api.post<Ticket>('/maintenance', { ...v, unitId: v.unitId || null, assignedToId: v.assignedToId || null, estimatedCost: v.estimatedCost || null });
    toast(`Ticket #${t.ticketNo} raised`);
    qc.invalidateQueries({ queryKey: ['tickets'] });
    onCreated(t.id);
    onClose();
  });
  return (
    <Modal
      title="New maintenance ticket"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            Raise ticket
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="Property" error={f.errors.propertyId}>
            <select value={f.values.propertyId} onChange={(e) => (f.set('propertyId', e.target.value), f.set('unitId', ''))}>
              <option value="">Choose…</option>
              {properties.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit" hint="Leave empty for a common area">
            <select {...f.bind('unitId')} disabled={!f.values.propertyId}>
              <option value="">Common area</option>
              {units.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNo}
                  {u.lease ? ` · ${u.lease.tenant.fullName}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Category" error={f.errors.category}>
            <select {...f.bind('category')}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority" hint="Urgent 24 h · High 48 h · Medium 5 days · Low 10 days">
            <select {...f.bind('priority')}>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </Field>
        </div>
        <Field label="Title" error={f.errors.title}>
          <input {...f.bind('title')} placeholder="e.g. Leaking kitchen tap" />
        </Field>
        <Field label="Description" error={f.errors.description}>
          <textarea {...f.bind('description')} rows={3} />
        </Field>
        <div className="form-row">
          {assignees.data && (
            <Field label="Assign to">
              <select {...f.bind('assignedToId')}>
                <option value="">Assign later</option>
                {assignees.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Estimated cost (₹)">
            <input type="number" {...f.bind('estimatedCost')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
