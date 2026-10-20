import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, Empty, ErrorNote, Field, Loading, Modal, PageHead, useForm, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials, inrShort, label } from '../lib/format';
import { useOwners, useProperties } from '../lib/queries';
import type { Property } from '../lib/types';

const TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'OFFICE', 'SHOP', 'WAREHOUSE', 'MIXED'];
const TILE_TONES = ['var(--primary-soft)', 'var(--info-soft)', 'var(--accent-soft)', 'var(--success-soft)'];

export function PropertiesPage() {
  const { can, me } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useProperties();
  const owners = useOwners(can('owners:read'));
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [editing, setEditing] = useState<Property | 'new' | null>(params.get('new') === '1' ? 'new' : null);
  const closeForm = () => {
    setEditing(null);
    if (params.get('new')) setParams({}, { replace: true });
  };

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (p) =>
          (!q || `${p.name} ${p.code} ${p.city}`.toLowerCase().includes(q.toLowerCase())) && (!type || p.type === type) && (!ownerId || p.ownerId === ownerId),
      ),
    [data, q, type, ownerId],
  );

  return (
    <>
      <PageHead
        title={me?.role === 'OWNER' ? 'My properties' : 'Properties'}
        hint={
          me?.role === 'OWNER'
            ? 'Your buildings and shops. Open one to see every unit, add units, and create agreements.'
            : 'All buildings and shops, by owner. Open one to see every unit and its status.'
        }
        actions={
          can('properties:write') && (
            <button className="btn primary" onClick={() => setEditing('new')}>
              <Icon name="plus" /> Add property
            </button>
          )
        }
      />
      <div className="row">
        <div className="search" style={{ maxWidth: 340 }}>
          <span className="icon">
            <Icon name="search" />
          </span>
          <input aria-label="Search properties" placeholder="Search by name, code or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="select-inline">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </label>
        {owners.data && owners.data.length > 1 && (
          <label className="select-inline">
            <span>Owner</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">All</option>
              {owners.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : (
        <section className="grid-cols" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {list.map((p, i) => {
            const s = p.stats.units;
            const occ = s.total ? Math.round((s.OCCUPIED / s.total) * 100) : 0;
            return (
              <Link key={p.id} to={`/properties/${p.id}`} className="card card-pad stack" style={{ gap: 16 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="avatar" style={{ width: 54, height: 54, borderRadius: 14, background: TILE_TONES[i % 4], color: 'var(--ink)', fontSize: 17 }}>
                    {initials(p.name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
                    <div className="muted small">
                      {p.code} · {p.area ? `${p.area}, ` : ''}
                      {p.city}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Chip tone="primary">{label(p.type)}</Chip>
                  <Chip tone={p.status === 'ACTIVE' ? 'success' : 'warn'}>{label(p.status)}</Chip>
                  <Chip>{p.owner.name}</Chip>
                </div>
                <div className="stack" style={{ gap: 7 }}>
                  <div className="row between small">
                    <span className="muted">Occupancy</span>
                    <span>
                      <b>{occ}%</b> <span className="muted">· {s.OCCUPIED} of {s.total} units</span>
                    </span>
                  </div>
                  <div className="bar" style={{ height: 8 }}>
                    <span style={{ width: `${occ}%`, background: 'var(--primary)', borderRadius: 999 }} />
                  </div>
                </div>
                <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 14, flexWrap: 'nowrap' }}>
                  <div style={{ flex: 1 }}>
                    <div className="muted small">Vacant</div>
                    <b style={{ fontSize: 18 }}>{s.VACANT}</b>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted small">Rent due</div>
                    <b style={{ fontSize: 18 }}>{inrShort(p.stats.dues)}</b>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted small">Open tickets</div>
                    <b style={{ fontSize: 18 }}>{p.stats.openTickets}</b>
                  </div>
                </div>
              </Link>
            );
          })}
          {can('properties:write') && (
            <button className="card card-pad stack" style={{ borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', minHeight: 260, cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setEditing('new')}>
              <span className="avatar">
                <Icon name="plus" />
              </span>
              <b style={{ fontSize: 16 }}>Add a property</b>
              <span className="muted small" style={{ maxWidth: 230 }}>
                Name, code, type, address and owner — then bulk-add its units.
              </span>
            </button>
          )}
          {!list.length && !can('properties:write') && <Empty title="No properties to show" />}
        </section>
      )}

      {editing && <PropertyForm property={editing === 'new' ? null : editing} defaultOwnerId={params.get('owner') ?? undefined} onClose={closeForm} />}
    </>
  );
}

export function PropertyForm({ property, onClose, defaultOwnerId }: { property: Property | null; onClose: () => void; defaultOwnerId?: string }) {
  const { me, can } = useAuth();
  const isOwner = me?.role === 'OWNER';
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const owners = useOwners();
  const [newOwner, setNewOwner] = useState(false);
  const f = useForm({
    code: property?.code ?? '',
    name: property?.name ?? '',
    type: property?.type ?? 'RESIDENTIAL',
    addressLine1: property?.addressLine1 ?? '',
    addressLine2: property?.addressLine2 ?? '',
    area: property?.area ?? '',
    city: property?.city ?? '',
    state: property?.state ?? 'Gujarat',
    pincode: property?.pincode ?? '',
    ownerId: property?.ownerId ?? defaultOwnerId ?? (isOwner ? me?.owner?.id ?? '' : ''),
    status: property?.status ?? 'ACTIVE',
    notes: property?.notes ?? '',
    ownerName: '',
    ownerPhone: '',
  });

  const save = f.submit(async ({ ownerName, ownerPhone, ...v }) => {
    let ownerId = v.ownerId;
    if (newOwner) {
      const o = await api.post<{ id: string }>('/owners', { name: ownerName, phone: ownerPhone });
      ownerId = o.id;
      f.set('ownerId', o.id);
      setNewOwner(false);
      qc.invalidateQueries({ queryKey: ['owners'] });
    }
    const body = { ...v, ownerId };
    if (property) {
      await api.patch(`/properties/${property.id}`, body);
      toast('Property updated');
    } else {
      const created = await api.post<{ id: string }>('/properties', body);
      toast('Property created — now add its units');
      navigate(`/properties/${created.id}?addUnits=1`);
    }
    qc.invalidateQueries({ queryKey: ['properties'] });
    qc.invalidateQueries({ queryKey: ['setup'] });
    qc.invalidateQueries({ queryKey: ['property'] });
    onClose();
  });

  return (
    <Modal
      title={property ? 'Edit property' : 'Add property'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={f.busy}>
            {property ? 'Save changes' : 'Create property'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={save} noValidate>
        <ErrorNote error={f.formError} />
        <div className="form-row">
          <Field label="Property name" error={f.errors.name}>
            <input {...f.bind('name')} placeholder="Sunrise Residency" autoFocus />
          </Field>
          <Field label="Code" error={f.errors.code} hint="Short unique code, e.g. SUN-RES">
            <input {...f.bind('code')} placeholder="SUN-RES" style={{ textTransform: 'uppercase' }} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Type" error={f.errors.type}>
            <select {...f.bind('type')}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={f.errors.status}>
            <select {...f.bind('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="UNDER_MAINTENANCE">Under maintenance</option>
            </select>
          </Field>
        </div>
        <Field label="Address" error={f.errors.addressLine1}>
          <input {...f.bind('addressLine1')} placeholder="Building, street" />
        </Field>
        <div className="form-row">
          <Field label="Area / locality" error={f.errors.area}>
            <input {...f.bind('area')} />
          </Field>
          <Field label="City" error={f.errors.city}>
            <input {...f.bind('city')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="State" error={f.errors.state}>
            <input {...f.bind('state')} />
          </Field>
          <Field label="PIN code" error={f.errors.pincode}>
            <input {...f.bind('pincode')} inputMode="numeric" maxLength={6} />
          </Field>
        </div>
        {isOwner ? null : newOwner ? (
          <div className="card card-pad stack" style={{ background: 'var(--surface-2)', border: 0 }}>
            <div className="row between">
              <b>New owner</b>
              <button type="button" className="btn ghost sm" onClick={() => setNewOwner(false)}>
                Pick existing instead
              </button>
            </div>
            <div className="form-row">
              <Field label="Owner name">
                <input {...f.bind('ownerName')} />
              </Field>
              <Field label="Owner mobile" error={f.errors.phone}>
                <input {...f.bind('ownerPhone')} inputMode="numeric" maxLength={10} />
              </Field>
            </div>
          </div>
        ) : (
          <Field label="Owner" error={f.errors.ownerId} hint={can('owners:write') ? <button type="button" className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => setNewOwner(true)}>+ Add a new owner</button> : undefined}>
            <select {...f.bind('ownerId')}>
              <option value="">Choose the owner…</option>
              {owners.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.phone}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notes" error={f.errors.notes}>
          <textarea {...f.bind('notes')} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
