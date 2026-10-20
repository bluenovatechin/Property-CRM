import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

interface Progress {
  owners: number;
  ownersWithLogin: number;
  properties: number;
  units: number;
  tenants: number;
  leases: number;
  rent: number;
  team: number;
}

interface Step {
  key: string;
  title: string;
  why: string;
  done: boolean;
  to: string;
  action: string;
}

/** "What do I do next?" — the setup path for managers and owners, one clear step at a time. */
export function GettingStarted() {
  const { me } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('setup-hidden') === '1';
    } catch {
      return false;
    }
  });
  const { data } = useQuery({ queryKey: ['setup'], queryFn: () => api.get<Progress>('/setup') });
  if (!me || !data) return null;

  const company = me.role === 'SUPER_ADMIN' || me.role === 'MANAGER';
  const owner = me.role === 'OWNER';
  if (!company && !owner) return null;

  const steps: Step[] = [
    ...(company
      ? [
          { key: 'owner', title: 'Add a property owner', why: 'Every property belongs to one owner.', done: data.owners > 0, to: '/owners?new=1', action: 'Add owner' },
          { key: 'login', title: 'Give the owner a login', why: 'The owner can then add properties, tenants and their own team.', done: data.ownersWithLogin > 0, to: '/owners', action: 'Send invite' },
        ]
      : []),
    { key: 'property', title: owner ? 'Add your property' : 'Add a property', why: 'A building, shop or office — name, address and owner.', done: data.properties > 0, to: '/properties?new=1', action: 'Add property' },
    { key: 'units', title: 'Add its units', why: 'Flats or shops, all at once (e.g. floors 1–10, 10 per floor).', done: data.units > 0, to: '/properties', action: 'Add units' },
    { key: 'tenant', title: 'Add a tenant', why: 'Name, mobile and email of the person renting.', done: data.tenants > 0, to: '/tenants?new=1', action: 'Add tenant' },
    { key: 'lease', title: 'Create the rent agreement', why: 'Links the tenant to a unit with rent, deposit and dates. Invites them to the tenant app.', done: data.leases > 0, to: '/leases/new', action: 'New agreement' },
    { key: 'rent', title: 'Record this month’s rent', why: 'Mark each tenant’s rent as paid when it comes in.', done: data.rent > 0, to: '/rent', action: 'Open rent' },
    { key: 'team', title: owner ? 'Invite your staff and finance person' : 'Invite staff and finance people', why: 'Staff handle repairs; finance records rent and expenses.', done: data.team > 0, to: '/users?new=1', action: 'Invite' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next || hidden) {
    return hidden && next ? (
      <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => (setHidden(false), localStorage.removeItem('setup-hidden'))}>
        Show the getting-started steps ({doneCount}/{steps.length} done)
      </button>
    ) : null;
  }

  return (
    <section className="card card-pad" aria-label="Getting started">
      <div className="row between" style={{ marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 18 }}>Getting started</h2>
          <div className="muted small">
            {doneCount} of {steps.length} done · follow the steps in order — the green button is your next step.
          </div>
        </div>
        <button
          className="btn ghost sm"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem('setup-hidden', '1');
            } catch {
              /* ignore */
            }
          }}
        >
          Hide
        </button>
      </div>
      <div className="bar" style={{ height: 6, margin: '8px 0 6px' }}>
        <span style={{ width: `${(doneCount / steps.length) * 100}%`, background: 'var(--primary)', borderRadius: 999 }} />
      </div>
      <div className="steps-list">
        {steps.map((s, i) => {
          const isNext = s === next;
          return (
            <div key={s.key} className={`step-row ${s.done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <span className="step-dot">{s.done ? <Icon name="check" size={16} stroke={2.4} /> : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="step-title" style={{ fontWeight: 700 }}>
                  {s.title}
                </div>
                {!s.done && <div className="muted small">{s.why}</div>}
              </div>
              {!s.done && (
                <Link className={`btn sm ${isNext ? 'primary' : ''}`} to={s.to}>
                  {s.action}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
