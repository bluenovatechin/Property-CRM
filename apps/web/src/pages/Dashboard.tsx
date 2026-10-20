import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { GettingStarted } from '../components/GettingStarted';
import { Icon } from '../components/Icon';
import { Chip, Empty, ErrorNote, Kpi, Loading, PageHead, PRIORITY_COLOR, StatusChip, UNIT_COLOR } from '../components/ui';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentPeriod, inr, inrShort, periodLabel, shiftPeriod } from '../lib/format';
import { useProperties } from '../lib/queries';

interface DashboardData {
  period: string;
  periodLabel: string;
  kpis: {
    properties: number;
    units: { total: number; OCCUPIED: number; VACANT: number; RESERVED: number; MAINTENANCE: number };
    activeTenants: number;
    activeLeases: number;
    rentEntered: number;
    rentDue: number;
    collected: number;
    pending: number;
    overdue: number;
    overdueTenants: number;
    openTickets: number;
    slaBreached: number;
    expiring30: number;
    expenses: number;
    netIncome: number;
  };
  occupancyByProperty: { id: string; name: string; occupied: number; total: number }[];
  attention: { kind: string; title: string; meta: string; action: string; link: string }[];
  trend: { period: string; label: string; due: number; paid: number }[];
  recentRent: { id: string; unit: { id: string; unitNo: string }; tenant: { id: string; fullName: string }; period: string; amount: number; status: string }[];
  recentTickets: { id: string; ticketNo: number; title: string; priority: string; status: string; unit: string | null; property: string; category: string }[];
}

const ATTENTION_TONE: Record<string, 'danger' | 'warn' | 'info'> = { OVERDUE: 'danger', EXPIRING: 'warn', SLA: 'danger', URGENT: 'danger' };
const ATTENTION_LABEL: Record<string, string> = { OVERDUE: 'Overdue', EXPIRING: 'Expiring', SLA: 'SLA breached', URGENT: 'Urgent' };

export function DashboardPage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const propertyId = params.get('property') ?? '';
  const period = params.get('period') ?? currentPeriod();
  const properties = useProperties();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', propertyId, period],
    queryFn: () => api.get<DashboardData>(`/dashboard${qs({ propertyId, period })}`),
  });

  const hasProperties = (properties.data?.length ?? 0) > 0;
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), -i));

  return (
    <>
      <PageHead
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={`${greeting}, ${me?.name}`}
        hint="Your business at a glance. Click any number to see the list behind it."
        actions={
          hasProperties && (
            <>
              <Link className="btn" to="/leases/new">
                New agreement
              </Link>
              <Link className="btn primary" to={`/rent?period=${period}`}>
                <Icon name="plus" /> Record {periodLabel(period).split(' ')[0]} rent
              </Link>
            </>
          )
        }
      />
      <GettingStarted />
      {hasProperties && (
      <div className="row">
        <label className="select-inline">
          <span>Property</span>
          <select value={propertyId} onChange={(e) => setParam('property', e.target.value)}>
            <option value="">All properties</option>
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      )}

      <ErrorNote error={error} />
      {isLoading || !data ? (
        <Loading />
      ) : !hasProperties ? (
        <section className="card">
          <Empty title="Your numbers will appear here">Once a property with units is added, this page shows occupancy, rent collected, dues and repairs.</Empty>
        </section>
      ) : (
        <>
          <Hero data={data} />
          <section className="kpis" aria-label="Key figures">
            <Kpi label="Properties" value={data.kpis.properties} sub={`${data.kpis.units.total} units`} to="/properties" />
            <Kpi label="Active tenants" value={data.kpis.activeTenants} sub={`${data.kpis.activeLeases} active leases`} to="/tenants?status=ACTIVE" />
            <Kpi label="Open maintenance" value={data.kpis.openTickets} sub={data.kpis.slaBreached ? `${data.kpis.slaBreached} past SLA` : 'All within SLA'} tone={data.kpis.slaBreached ? 'bad' : undefined} to="/maintenance" />
            <Kpi label="Pending rent" value={inrShort(data.kpis.pending)} sub="Not yet due" to={`/rent?period=${period}&status=PENDING`} />
            <Kpi label="Overdue rent" value={inrShort(data.kpis.overdue)} sub={`${data.kpis.overdueTenants} tenants past due`} tone={data.kpis.overdue ? 'bad' : undefined} to={`/rent?period=${period}&status=OVERDUE`} />
            <Kpi label="Leases expiring" value={data.kpis.expiring30} sub="In the next 30 days" tone={data.kpis.expiring30 ? 'warn' : undefined} to="/leases?expiring=30" />
            <Kpi label="Expenses" value={inrShort(data.kpis.expenses)} sub={periodLabel(period)} to={`/expenses?period=${period}`} />
            <Kpi label="Net income" value={inrShort(data.kpis.netIncome)} sub="Rent paid − expenses" to={`/reports?r=income-expense&period=${period}`} />
          </section>

          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <h2>Needs your attention</h2>
                <Chip tone={data.attention.length ? 'danger' : 'success'}>{data.attention.length ? `${data.attention.length} items` : 'All clear'}</Chip>
              </div>
              <div style={{ padding: '0 22px 10px' }}>
                {!data.attention.length && <Empty title="Nothing urgent">No overdue rent, expiring leases or late tickets.</Empty>}
                {data.attention.map((a, i) => (
                  <div className="list-item" key={i} style={{ flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 96 }}>
                      <Chip tone={ATTENTION_TONE[a.kind]}>{ATTENTION_LABEL[a.kind]}</Chip>
                    </span>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{a.title}</div>
                      <div className="muted small">{a.meta}</div>
                    </div>
                    <Link className="btn sm" to={a.link}>
                      {a.action}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
            <section className="card card-pad stack" style={{ gap: 16 }}>
              <h2 style={{ fontSize: 16 }}>Occupancy by property</h2>
              {data.occupancyByProperty.map((p) => {
                const pct = p.total ? Math.round((p.occupied / p.total) * 100) : 0;
                return (
                  <Link key={p.id} to={`/properties/${p.id}`} style={{ color: 'var(--ink)' }} className="stack">
                    <div className="row between" style={{ gap: 6 }}>
                      <b>{p.name}</b>
                      <span className="muted">
                        {p.occupied} / {p.total} · <b style={{ color: 'var(--ink)' }}>{pct}%</b>
                      </span>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${pct}%`, background: 'var(--primary)', borderRadius: 999 }} />
                    </div>
                  </Link>
                );
              })}
              <Trend trend={data.trend} />
            </section>
          </div>

          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <h2>Recent rent entries</h2>
                <Link to={`/rent?period=${period}`} style={{ fontWeight: 700 }}>
                  All rent →
                </Link>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Tenant</th>
                      <th>Month</th>
                      <th className="right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRent.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/units/${r.unit.id}`}>
                            <b>{r.unit.unitNo}</b>
                          </Link>
                        </td>
                        <td>
                          <Link to={`/tenants/${r.tenant.id}`} style={{ color: 'var(--ink)' }}>
                            {r.tenant.fullName}
                          </Link>
                        </td>
                        <td className="muted">{periodLabel(r.period)}</td>
                        <td className="right num">{inr(r.amount)}</td>
                        <td>
                          <StatusChip status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Recent maintenance</h2>
                <Link to="/maintenance" style={{ fontWeight: 700 }}>
                  Board →
                </Link>
              </div>
              <div style={{ padding: '0 22px 10px' }}>
                {data.recentTickets.map((t) => (
                  <Link key={t.id} to={`/maintenance?ticket=${t.id}`} className="list-item" style={{ color: 'var(--ink)' }}>
                    <span className="stripe" style={{ background: PRIORITY_COLOR[t.priority] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{t.title}</div>
                      <div className="muted small">
                        #{t.ticketNo} · {t.unit ? `Unit ${t.unit}` : 'Common area'} · {t.property}
                      </div>
                    </div>
                    <StatusChip status={t.status} />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Hero({ data }: { data: DashboardData }) {
  const u = data.kpis.units;
  const occPct = u.total ? (u.OCCUPIED / u.total) * 100 : 0;
  const due = data.kpis.rentDue;
  const paidPct = due ? (data.kpis.collected / due) * 100 : 0;
  const segs: [string, number, string][] = [
    ['Occupied', u.OCCUPIED, UNIT_COLOR.OCCUPIED],
    ['Vacant', u.VACANT, UNIT_COLOR.VACANT],
    ['Reserved', u.RESERVED, UNIT_COLOR.RESERVED],
    ['Maintenance', u.MAINTENANCE, UNIT_COLOR.MAINTENANCE],
  ];
  return (
    <section className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 40 }}>
      <div className="stack" style={{ flex: '1 1 340px' }}>
        <div className="row between">
          <h2 style={{ fontSize: 15 }}>Occupancy</h2>
          <span className="muted small">{u.total} units</span>
        </div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em' }}>{occPct.toFixed(1)}%</span>
          <span className="muted">
            {u.OCCUPIED} of {u.total} units occupied
          </span>
        </div>
        <div className="bar" style={{ height: 12 }} role="img" aria-label={segs.map(([l, n]) => `${n} ${l}`).join(', ')}>
          {segs.map(([l, n, c]) => n > 0 && <span key={l} style={{ width: `${(n / u.total) * 100}%`, background: c }} />)}
        </div>
        <div className="legend">
          {segs.map(([l, n, c]) => (
            <Link key={l} to="/properties" style={{ color: 'var(--ink)' }}>
              <span>
                <i className="dot" style={{ background: c }} />
                {l} <b>{n}</b>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="stack" style={{ flex: '1 1 340px' }}>
        <div className="row between">
          <h2 style={{ fontSize: 15 }}>{data.periodLabel} rent</h2>
          <span className="muted small">
            {inrShort(due)} entered · {data.kpis.rentEntered}/{data.kpis.activeLeases} leases
          </span>
        </div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em' }}>{inrShort(data.kpis.collected)}</span>
          <span className="muted">collected · {Math.round(paidPct)}%</span>
        </div>
        <div className="bar" style={{ height: 12 }}>
          {due > 0 && (
            <>
              <span style={{ width: `${paidPct}%`, background: 'var(--success)' }} />
              <span style={{ width: `${(data.kpis.pending / due) * 100}%`, background: 'var(--line-strong)' }} />
              <span style={{ width: `${(data.kpis.overdue / due) * 100}%`, background: 'var(--danger-solid)' }} />
            </>
          )}
        </div>
        <div className="legend">
          <span>
            <i className="dot" style={{ background: 'var(--success)' }} />
            Paid <b>{inrShort(data.kpis.collected)}</b>
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--line-strong)' }} />
            Pending <b>{inrShort(data.kpis.pending)}</b>
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--danger-solid)' }} />
            Overdue <b>{inrShort(data.kpis.overdue)}</b>
          </span>
        </div>
      </div>
    </section>
  );
}

function Trend({ trend }: { trend: DashboardData['trend'] }) {
  const max = Math.max(1, ...trend.map((t) => t.due));
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="row between" style={{ marginBottom: 10 }}>
        <b style={{ fontSize: 14 }}>Rent collected vs entered</b>
        <span className="legend small">
          <span>
            <i className="dot" style={{ background: 'var(--primary-tint)' }} />
            Entered
          </span>
          <span>
            <i className="dot" style={{ background: 'var(--primary)' }} />
            Paid
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }} role="img" aria-label="Rent entered and paid for the last six months">
        {trend.map((t) => (
          <div key={t.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${periodLabel(t.period)}: ${inr(t.paid)} paid of ${inr(t.due)}`}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 96 }}>
              <span style={{ width: 12, height: `${(t.due / max) * 96}px`, background: 'var(--primary-tint)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ width: 12, height: `${(t.paid / max) * 96}px`, background: 'var(--primary)', borderRadius: '4px 4px 0 0' }} />
            </div>
            <span className="muted small">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
