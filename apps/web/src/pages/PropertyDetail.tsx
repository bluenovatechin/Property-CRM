import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, Empty, ErrorNote, Field, Loading, Modal, StatusChip, UNIT_COLOR, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date, initials, inr, inrShort, label } from '../lib/format';
import type { GridUnit, Property, UnitStatus } from '../lib/types';
import { PropertyForm } from './Properties';

const FILTERS: (UnitStatus | 'ALL')[] = ['ALL', 'OCCUPIED', 'VACANT', 'RESERVED', 'MAINTENANCE'];

export function PropertyDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<UnitStatus | 'ALL'>('ALL');
  const [find, setFind] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'bulk' | 'unit' | null>(params.get('addUnits') ? 'bulk' : null);

  const property = useQuery({ queryKey: ['property', id], queryFn: () => api.get<Property>(`/properties/${id}`) });
  const units = useQuery({ queryKey: ['property-units', id], queryFn: () => api.get<GridUnit[]>(`/properties/${id}/units`) });

  useEffect(() => {
    if (params.get('addUnits')) {
      params.delete('addUnits');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const floors = useMemo(() => {
    const map = new Map<string, GridUnit[]>();
    for (const u of units.data ?? []) {
      const key = u.floor === null ? 'Other' : u.floor === 0 ? 'Ground' : `Floor ${u.floor}`;
      map.set(key, [...(map.get(key) ?? []), u]);
    }
    return [...map.entries()];
  }, [units.data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: units.data?.length ?? 0 };
    for (const u of units.data ?? []) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [units.data]);

  const sel = units.data?.find((u) => u.id === selected) ?? units.data?.find((u) => u.overdue) ?? units.data?.[0];

  if (property.error) return <ErrorNote error={property.error} />;
  if (!property.data) return <Loading />;
  const p = property.data;
  const s = p.stats.units;

  return (
    <>
      <div className="crumbs">
        <Link to="/properties">Properties</Link> / {p.name}
      </div>
      <div className="page-head">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="avatar lg" style={{ borderRadius: 16 }}>
            {initials(p.name)}
          </span>
          <div>
            <div className="row">
              <h1>{p.name}</h1>
              <Chip tone={p.status === 'ACTIVE' ? 'success' : 'warn'}>{label(p.status)}</Chip>
            </div>
            <div className="muted">
              {p.code} · {label(p.type)} · {[p.addressLine1, p.area, p.city].filter(Boolean).join(', ')} · Owner: <b style={{ color: 'var(--ink)' }}>{p.owner.name}</b>
            </div>
          </div>
        </div>
        {can('properties:write') && (
          <div className="row">
            <button className="btn" onClick={() => setModal('edit')}>
              <Icon name="edit" /> Edit
            </button>
            <button className="btn" onClick={() => setModal('unit')}>
              Add one unit
            </button>
            <button className="btn primary" onClick={() => setModal('bulk')}>
              <Icon name="plus" /> Bulk add units
            </button>
          </div>
        )}
      </div>

      <section className="card strip">
        <div>
          <div className="label">Units</div>
          <div className="value">{s.total}</div>
        </div>
        <div>
          <div className="label">Occupied</div>
          <div className="value" style={{ color: 'var(--primary-ink)' }}>
            {s.OCCUPIED}
          </div>
        </div>
        <div>
          <div className="label">Vacant</div>
          <div className="value" style={{ color: 'var(--info)' }}>
            {s.VACANT}
          </div>
        </div>
        <div>
          <div className="label">Reserved</div>
          <div className="value" style={{ color: 'var(--warn)' }}>
            {s.RESERVED}
          </div>
        </div>
        <div>
          <div className="label">Rent due</div>
          <div className="value">{inrShort(p.stats.dues)}</div>
        </div>
        <div>
          <div className="label">Open tickets</div>
          <div className="value">{p.stats.openTickets}</div>
        </div>
      </section>

      <nav className="tabs" aria-label="Property sections">
        <span className="on" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontWeight: 600, borderBottom: '2px solid var(--primary)' }}>
          Units
        </span>
        <Link to={`/tenants?property=${p.id}`}>Tenants</Link>
        <Link to={`/rent?property=${p.id}`}>Rent</Link>
        <Link to={`/maintenance?property=${p.id}`}>Maintenance</Link>
        <Link to={`/expenses?property=${p.id}`}>Expenses</Link>
        <Link to={`/reports?property=${p.id}`}>Reports</Link>
      </nav>

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 1fr)' }}>
        <section className="card card-pad stack" style={{ gap: 16 }}>
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  className="btn sm"
                  onClick={() => setFilter(f)}
                  style={filter === f ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}
                >
                  {f !== 'ALL' && <i className="dot" style={{ background: UNIT_COLOR[f] }} />}
                  {f === 'ALL' ? 'All' : label(f)} <b>{counts[f] ?? 0}</b>
                </button>
              ))}
            </div>
            <input className="input" style={{ maxWidth: 180 }} placeholder="Find unit no." value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find unit" />
          </div>
          <div className="legend muted small">
            <span>
              <i className="dot round" style={{ background: 'var(--danger-solid)' }} />
              Rent overdue
            </span>
            <span>
              <i className="dot round" style={{ background: 'var(--reserved)' }} />
              Lease ends ≤ 30 days
            </span>
            <span>Click a unit to see its details</span>
          </div>
          {units.isLoading ? (
            <Loading />
          ) : !units.data?.length ? (
            <Empty title="No units yet" action={can('units:write') && <button className="btn primary" onClick={() => setModal('bulk')}>Bulk add units</button>}>
              Add units one by one or in bulk, e.g. floors 1–10 with 10 units each.
            </Empty>
          ) : (
            <div className="unit-grid">
              {floors.map(([name, list]) => (
                <div className="floor-row" key={name}>
                  <span className="muted">{name}</span>
                  <div className="tiles">
                    {list.map((u) => {
                      const dim = (filter !== 'ALL' && u.status !== filter) || (find && !u.unitNo.toLowerCase().includes(find.toLowerCase()));
                      return (
                        <button
                          key={u.id}
                          className={`tile ${u.status} ${sel?.id === u.id ? 'sel' : ''} ${dim ? 'dim' : ''}`}
                          onClick={() => setSelected(u.id)}
                          aria-label={`Unit ${u.unitNo}, ${label(u.status)}${u.overdue ? ', rent overdue' : ''}`}
                          title={u.lease ? `${u.lease.tenant.fullName} · ${inr(u.lease.monthlyRent)}` : label(u.status)}
                        >
                          {u.unitNo}
                          <small>{u.status === 'OCCUPIED' ? 'Occ.' : u.status === 'MAINTENANCE' ? 'Maint.' : label(u.status)}</small>
                          {(u.overdue || u.expiringSoon) && <span className="flag" style={{ background: u.overdue ? 'var(--danger-solid)' : 'var(--reserved)' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {sel && <SelectedUnit u={sel} canWrite={can('leases:write')} />}
      </div>

      {modal === 'edit' && <PropertyForm property={p} onClose={() => setModal(null)} />}
      {modal === 'bulk' && <BulkUnits propertyId={p.id} onClose={() => setModal(null)} />}
      {modal === 'unit' && <AddUnit propertyId={p.id} onClose={() => setModal(null)} />}
    </>
  );
}

function SelectedUnit({ u, canWrite }: { u: GridUnit; canWrite: boolean }) {
  return (
    <aside className="card card-pad stack" aria-label="Selected unit" style={{ position: 'sticky', top: 90 }}>
      <div className="row between">
        <div>
          <div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Selected unit
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Unit {u.unitNo}</div>
        </div>
        <StatusChip status={u.status} />
      </div>
      <div className="muted small">
        {u.unitType}
        {u.floor !== null ? ` · Floor ${u.floor}` : ''}
        {u.block ? ` · Block ${u.block}` : ''}
        {u.areaSqft ? ` · ${u.areaSqft.toLocaleString('en-IN')} sq ft` : ''}
      </div>
      {u.lease ? (
        <div>
          <div className="kv">
            <span>Tenant</span>
            <Link to={`/tenants/${u.lease.tenant.id}`}>{u.lease.tenant.fullName}</Link>
          </div>
          <div className="kv">
            <span>Monthly rent</span>
            <b>{inr(u.lease.monthlyRent)}</b>
          </div>
          <div className="kv">
            <span>Lease ends</span>
            <b style={u.expiringSoon ? { color: 'var(--warn)' } : undefined}>{date(u.lease.endDate)}</b>
          </div>
          <div className="kv">
            <span>This month's rent</span>
            {u.rentThisMonth ? <StatusChip status={u.rentThisMonth.status} /> : <StatusChip status="NOT_ENTERED" />}
          </div>
          <div className="kv">
            <span>Open tickets</span>
            <b>{u.openTickets || 'None'}</b>
          </div>
        </div>
      ) : (
        <div>
          <div className="kv">
            <span>Expected rent</span>
            <b>{inr(u.expectedRent)}</b>
          </div>
          <div className="kv">
            <span>Security deposit</span>
            <b>{inr(u.securityDeposit)}</b>
          </div>
          {u.vacantSince && (
            <div className="kv">
              <span>Vacant since</span>
              <b>
                {date(u.vacantSince)} · {u.vacantDays} days
              </b>
            </div>
          )}
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {!u.lease && canWrite && (u.status === 'VACANT' || u.status === 'RESERVED') && (
          <Link className="btn primary" to={`/leases/new?unit=${u.id}`}>
            Create lease for this unit
          </Link>
        )}
        <Link className={`btn ${u.lease ? 'primary' : ''}`} to={`/units/${u.id}`}>
          Open unit page
        </Link>
        {u.lease && (
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Link className="btn" style={{ flex: 1 }} to={`/rent?unit=${u.unitNo}`}>
              Rent
            </Link>
            <Link className="btn" style={{ flex: 1 }} to={`/maintenance?new=1&unit=${u.id}`}>
              Raise ticket
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

function BulkUnits({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'floors' | 'range'>('floors');
  const f = useForm({ floorFrom: '1', floorTo: '10', unitsPerFloor: '10', prefix: '', from: '1', to: '100', padTo: '3', unitType: '2BHK', block: '', areaSqft: '', expectedRent: '', securityDeposit: '' });
  const v = f.values;
  const preview = useMemo(() => {
    const pad = (n: number, l: number) => String(n).padStart(l, '0');
    if (mode === 'floors') {
      const a = Number(v.floorFrom), b = Number(v.floorTo), n = Number(v.unitsPerFloor);
      if (!(b >= a && n > 0)) return null;
      const name = (fl: number, i: number) => (fl === 0 ? `G${pad(i, 2)}` : `${fl}${pad(i, 2)}`);
      return { count: (b - a + 1) * n, first: name(a, 1), last: name(b, n) };
    }
    const a = Number(v.from), b = Number(v.to), l = Number(v.padTo) || 1;
    if (!(b >= a)) return null;
    return { count: b - a + 1, first: `${v.prefix}${pad(a, l)}`, last: `${v.prefix}${pad(b, l)}` };
  }, [mode, v]);

  const save = f.submit(async (val) => {
    const res = await api.post<{ created: number; skipped: string[] }>(`/properties/${propertyId}/units/bulk`, {
      mode,
      ...(mode === 'floors' ? { floorFrom: val.floorFrom, floorTo: val.floorTo, unitsPerFloor: val.unitsPerFloor } : { prefix: val.prefix, from: val.from, to: val.to, padTo: val.padTo }),
      unitType: val.unitType,
      block: val.block,
      areaSqft: val.areaSqft || null,
      expectedRent: val.expectedRent,
      securityDeposit: val.securityDeposit || 0,
    });
    toast(`${res.created} units added${res.skipped.length ? ` · ${res.skipped.length} already existed` : ''}`);
    qc.invalidateQueries({ queryKey: ['property-units', propertyId] });
    qc.invalidateQueries({ queryKey: ['property', propertyId] });
    qc.invalidateQueries({ queryKey: ['properties'] });
    onClose();
  });

  return (
    <Modal
      title="Bulk add units"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto' }}>
            {preview ? (
              <>
                Creates <b style={{ color: 'var(--ink)' }}>{preview.count}</b> units: {preview.first} … {preview.last}
              </>
            ) : (
              'Check the numbers'
            )}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy || !preview}>
            Add units
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="seg" role="tablist">
          <button type="button" className={mode === 'floors' ? 'on' : ''} onClick={() => setMode('floors')}>
            By floor (101, 102…)
          </button>
          <button type="button" className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}>
            Number range (001…100)
          </button>
        </div>
        {mode === 'floors' ? (
          <div className="form-row">
            <Field label="First floor" error={f.errors.floorFrom} hint="0 = ground floor (G01…)">
              <input type="number" min={0} {...f.bind('floorFrom')} />
            </Field>
            <Field label="Last floor" error={f.errors.floorTo}>
              <input type="number" min={0} {...f.bind('floorTo')} />
            </Field>
            <Field label="Units per floor" error={f.errors.unitsPerFloor}>
              <input type="number" min={1} {...f.bind('unitsPerFloor')} />
            </Field>
          </div>
        ) : (
          <div className="form-row">
            <Field label="Prefix" hint="e.g. G- for G-01">
              <input {...f.bind('prefix')} />
            </Field>
            <Field label="From" error={f.errors.from}>
              <input type="number" min={0} {...f.bind('from')} />
            </Field>
            <Field label="To" error={f.errors.to}>
              <input type="number" min={0} {...f.bind('to')} />
            </Field>
            <Field label="Digits" hint="3 → 001">
              <input type="number" min={1} max={6} {...f.bind('padTo')} />
            </Field>
          </div>
        )}
        <div className="form-row">
          <Field label="Unit type" error={f.errors.unitType}>
            <input {...f.bind('unitType')} placeholder="2BHK, Shop, Office…" />
          </Field>
          <Field label="Block / wing">
            <input {...f.bind('block')} placeholder="A" />
          </Field>
          <Field label="Area (sq ft)" error={f.errors.areaSqft}>
            <input type="number" {...f.bind('areaSqft')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Expected rent (₹ / month)" error={f.errors.expectedRent}>
            <input type="number" {...f.bind('expectedRent')} />
          </Field>
          <Field label="Security deposit (₹)" error={f.errors.securityDeposit}>
            <input type="number" {...f.bind('securityDeposit')} />
          </Field>
        </div>
        <div className="alert info small">Existing unit numbers are skipped, so running this twice never creates duplicates. You can change any unit later.</div>
      </form>
    </Modal>
  );
}

function AddUnit({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm({ unitNo: '', floor: '', block: '', unitType: '2BHK', areaSqft: '', expectedRent: '', securityDeposit: '', status: 'VACANT' });
  const save = f.submit(async (v) => {
    await api.post(`/properties/${propertyId}/units`, { ...v, floor: v.floor === '' ? null : v.floor, areaSqft: v.areaSqft || null, securityDeposit: v.securityDeposit || 0 });
    toast(`Unit ${v.unitNo} added`);
    qc.invalidateQueries({ queryKey: ['property-units', propertyId] });
    qc.invalidateQueries({ queryKey: ['property', propertyId] });
    onClose();
  });
  return (
    <Modal
      title="Add a unit"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            Add unit
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="Unit number" error={f.errors.unitNo}>
            <input {...f.bind('unitNo')} autoFocus />
          </Field>
          <Field label="Floor" error={f.errors.floor}>
            <input type="number" {...f.bind('floor')} />
          </Field>
          <Field label="Block / wing">
            <input {...f.bind('block')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Unit type" error={f.errors.unitType}>
            <input {...f.bind('unitType')} />
          </Field>
          <Field label="Area (sq ft)" error={f.errors.areaSqft}>
            <input type="number" {...f.bind('areaSqft')} />
          </Field>
          <Field label="Status">
            <select {...f.bind('status')}>
              <option value="VACANT">Vacant</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Expected rent (₹ / month)" error={f.errors.expectedRent}>
            <input type="number" {...f.bind('expectedRent')} />
          </Field>
          <Field label="Security deposit (₹)" error={f.errors.securityDeposit}>
            <input type="number" {...f.bind('securityDeposit')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
