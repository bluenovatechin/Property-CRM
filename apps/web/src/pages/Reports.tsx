import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorNote, Loading, PageHead } from '../components/ui';
import { api, downloadUrl, qs } from '../lib/api';
import { currentPeriod, date, inr, periodLabel, shiftPeriod } from '../lib/format';
import { useProperties } from '../lib/queries';
import type { ReportData } from '../lib/types';

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const key = params.get('r') ?? 'collection';
  const period = params.get('period') ?? currentPeriod();
  const propertyId = params.get('property') ?? '';
  const properties = useProperties();
  const list = useQuery({ queryKey: ['report-list'], queryFn: () => api.get<{ key: string; title: string; question: string }[]>('/reports') });
  const report = useQuery({
    queryKey: ['report', key, period, propertyId],
    queryFn: () => api.get<ReportData>(`/reports/${key}${qs({ period, propertyId })}`),
    placeholderData: (prev) => prev,
  });
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), -i));
  const fmt = (v: string | number | null | undefined, f?: string) => {
    if (v === null || v === undefined || v === '') return '—';
    if (f === 'money') return inr(Number(v));
    if (f === 'pct') return `${v}%`;
    if (f === 'date') return date(String(v));
    return typeof v === 'number' ? v.toLocaleString('en-IN') : v;
  };
  const r = report.data;

  return (
    <>
      <PageHead
        eyebrow="Insights"
        title="Reports"
        actions={
          <>
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
          </>
        }
      />
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(260px, 1fr) minmax(0, 3fr)' }}>
        <nav className="card" aria-label="Report list" style={{ padding: 8 }}>
          {list.data?.map((x) => (
            <button
              key={x.key}
              onClick={() => setParam('r', x.key)}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', width: '100%', border: 0, borderRadius: 12, padding: '10px 14px', cursor: 'pointer', background: x.key === key ? 'var(--primary-soft)' : 'transparent', minHeight: 56 }}
            >
              <b style={{ color: x.key === key ? 'var(--primary-ink)' : 'var(--ink)' }}>{x.title}</b>
              <span className="muted small">{x.question}</span>
            </button>
          ))}
        </nav>
        <section className="card">
          <ErrorNote error={report.error} />
          {!r ? (
            <Loading />
          ) : (
            <>
              <div className="card-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800 }}>{r.title}</h2>
                  <div className="muted">
                    {r.question} · {periodLabel(period)} · {propertyId ? properties.data?.find((p) => p.id === propertyId)?.name : 'all properties'}
                  </div>
                </div>
                <div className="row">
                  <a className="btn" href={downloadUrl(`/reports/${key}${qs({ period, propertyId, format: 'csv' })}`)}>
                    <Icon name="download" /> Export CSV
                  </a>
                  <button className="btn" onClick={() => window.print()}>
                    Print / PDF
                  </button>
                </div>
              </div>
              <div className="row" style={{ padding: '4px 22px 18px', alignItems: 'stretch' }}>
                {r.tiles.map((t) => (
                  <div key={t.label} style={{ flex: '1 1 150px', background: 'var(--surface-2)', borderRadius: 12, padding: '12px 16px' }}>
                    <div className="muted small" style={{ fontWeight: 600 }}>
                      {t.label}
                    </div>
                    <div className={`${t.tone ? `tone-${t.tone}` : ''}`} style={{ fontSize: 22, fontWeight: 800 }}>
                      {fmt(t.value, t.format)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {r.columns.map((c) => (
                        <th key={c.key} className={c.align === 'right' ? 'right' : ''}>
                          {c.label}
                        </th>
                      ))}
                      {r.bar && <th style={{ minWidth: 140 }} className="hide-sm" />}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i}>
                        {r.columns.map((c, j) => (
                          <td key={c.key} className={`${c.align === 'right' ? 'right num' : ''}`} style={j === 0 ? { fontWeight: 700 } : undefined}>
                            {fmt(row[c.key], c.format)}
                          </td>
                        ))}
                        {r.bar && (
                          <td className="hide-sm">
                            <div className="bar" style={{ height: 8 }}>
                              <span style={{ width: `${Number(row[r.bar]) || 0}%`, background: 'var(--primary)', borderRadius: 999 }} />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {!r.rows.length && (
                      <tr>
                        <td colSpan={r.columns.length + 1} className="muted">
                          Nothing to report.
                        </td>
                      </tr>
                    )}
                    {r.total && (
                      <tr className="total">
                        {r.columns.map((c) => (
                          <td key={c.key} className={c.align === 'right' ? 'right num' : ''}>
                            {fmt(r.total![c.key], c.format)}
                          </td>
                        ))}
                        {r.bar && <td className="hide-sm" />}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="muted small" style={{ padding: '12px 22px', margin: 0 }}>
                {r.note}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
