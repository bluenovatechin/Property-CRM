import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { confirmAction, Empty, ErrorNote, Field, Loading, Modal, PageHead, useForm, useToast } from '../components/ui';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentPeriod, date, inr, inrShort, label, periodLabel, shiftPeriod, todayISO } from '../lib/format';
import { useProperties } from '../lib/queries';

const CATEGORIES = ['MAINTENANCE', 'UTILITY', 'VENDOR', 'SALARY', 'TAX', 'INSURANCE', 'ADMIN', 'OTHER'];

interface ExpenseData {
  period: string;
  total: number;
  byCategory: Record<string, number>;
  rows: { id: string; category: string; amount: number; expenseDate: string; paidTo: string | null; mode: string | null; notes: string | null; property: { id: string; name: string }; unit: { id: string; unitNo: string } | null; ticket: { id: string; ticketNo: number } | null }[];
}

export function ExpensesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? currentPeriod();
  const propertyId = params.get('property') ?? '';
  const [category, setCategory] = useState('');
  const [adding, setAdding] = useState(false);
  const properties = useProperties();
  const { data, isLoading, error } = useQuery({
    queryKey: ['expenses', period, propertyId, category],
    queryFn: () => api.get<ExpenseData>(`/expenses${qs({ period, propertyId, category })}`),
  });
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), -i));
  const cats = Object.entries(data?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);

  const remove = async (id: string) => {
    if (!confirmAction('Delete this expense?')) return;
    try {
      await api.del(`/expenses/${id}`);
      toast('Expense deleted');
      qc.invalidateQueries({ queryKey: ['expenses'] });
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={periodLabel(period)}
        title="Expenses"
        hint="Money spent on a property: electricity, salaries, vendors. Repair costs are added here automatically when a repair is closed."
        actions={
          can('expenses:write') && (
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add expense
            </button>
          )
        }
      />
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
        <label className="select-inline">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorNote error={error} />
      {data && (
        <section className="card strip">
          <div>
            <div className="label">Total</div>
            <div className="value">{inrShort(data.total)}</div>
          </div>
          {cats.slice(0, 4).map(([c, v]) => (
            <div key={c}>
              <div className="label">{label(c)}</div>
              <div className="value">{inrShort(v)}</div>
            </div>
          ))}
        </section>
      )}
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : !data?.rows.length ? (
          <Empty title="No expenses this month" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Property</th>
                  <th>Paid to</th>
                  <th>Notes</th>
                  <th className="right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.expenseDate)}</td>
                    <td>
                      <b>{label(r.category)}</b>
                    </td>
                    <td>
                      {r.property.name}
                      {r.unit && <span className="muted"> · {r.unit.unitNo}</span>}
                    </td>
                    <td>{r.paidTo ?? '—'}</td>
                    <td className="muted" style={{ whiteSpace: 'normal', maxWidth: 280 }}>
                      {r.ticket ? <Link to={`/maintenance?ticket=${r.ticket.id}`}>Ticket #{r.ticket.ticketNo}</Link> : r.notes ?? '—'}
                    </td>
                    <td className="right num">
                      <b>{inr(r.amount)}</b>
                    </td>
                    <td className="right">
                      {can('expenses:write') && !r.ticket && (
                        <button className="btn sm ghost" onClick={() => remove(r.id)} aria-label="Delete expense">
                          <Icon name="x" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {adding && <ExpenseForm defaultProperty={propertyId} onClose={() => setAdding(false)} />}
    </>
  );
}

function ExpenseForm({ defaultProperty, onClose }: { defaultProperty: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const properties = useProperties();
  const f = useForm({ propertyId: defaultProperty, category: 'UTILITY', amount: '', expenseDate: todayISO(), paidTo: '', mode: 'BANK', notes: '' });
  const save = f.submit(async (v) => {
    await api.post('/expenses', v);
    toast('Expense added');
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    onClose();
  });
  return (
    <Modal
      title="Add expense"
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
          <Field label="Property" error={f.errors.propertyId}>
            <select {...f.bind('propertyId')}>
              <option value="">Choose…</option>
              {properties.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" error={f.errors.category}>
            <select {...f.bind('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Amount (₹)" error={f.errors.amount}>
            <input type="number" {...f.bind('amount')} autoFocus />
          </Field>
          <Field label="Date" error={f.errors.expenseDate}>
            <input type="date" {...f.bind('expenseDate')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Paid to">
            <input {...f.bind('paidTo')} />
          </Field>
          <Field label="Mode">
            <select {...f.bind('mode')}>
              <option value="BANK">Bank transfer</option>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <input {...f.bind('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
