import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { label } from '../lib/format';
import { Icon } from './Icon';

/* ── Status chips (one colour language everywhere) ──────────────────────── */
type Tone = 'primary' | 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

const TONES: Record<string, Tone> = {
  // units
  OCCUPIED: 'primary', VACANT: 'info', RESERVED: 'warn', MAINTENANCE: 'danger',
  // rent
  PAID: 'success', PENDING: 'neutral', OVERDUE: 'danger', NOT_ENTERED: 'accent',
  // leases
  ACTIVE: 'primary', DRAFT: 'neutral', EXPIRED: 'neutral', RENEWED: 'info', TERMINATED: 'danger',
  // tenants
  INACTIVE: 'neutral', PREVIOUS: 'neutral',
  // tickets
  OPEN: 'warn', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'neutral', REOPENED: 'warn', CANCELLED: 'neutral',
  // priority
  URGENT: 'danger', HIGH: 'warn', MEDIUM: 'info', LOW: 'success',
  // users
  INVITED: 'accent', DISABLED: 'danger',
};

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function StatusChip({ status, text }: { status: string; text?: string }) {
  return <Chip tone={TONES[status] ?? 'neutral'}>{text ?? (status === 'NOT_ENTERED' ? 'Not entered' : label(status))}</Chip>;
}

export const PRIORITY_COLOR: Record<string, string> = { URGENT: '#c8243f', HIGH: '#c98a0b', MEDIUM: '#2563c9', LOW: '#16683b' };
export const UNIT_COLOR: Record<string, string> = { OCCUPIED: 'var(--occupied)', VACANT: 'var(--vacant)', RESERVED: 'var(--reserved)', MAINTENANCE: 'var(--maint)' };

/* ── Layout helpers ────────────────────────────────────────────────────── */
export function PageHead({ eyebrow, title, actions, children }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Loading({ full }: { full?: boolean }) {
  return (
    <div className="center" style={full ? { minHeight: '100vh' } : undefined} role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  return (
    <div className="alert error" role="alert">
      <Icon name="alert" /> <span>{msg}</span>
    </div>
  );
}

export function Kpi({ label: l, value, sub, tone, to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; to?: string }) {
  const inner = (
    <>
      <span className="label">{l}</span>
      <span className={`value ${tone ? `tone-${tone}` : ''}`}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </>
  );
  return to ? (
    <Link className="card kpi" to={to}>
      {inner}
    </Link>
  ) : (
    <div className="card kpi">{inner}</div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────────── */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn icon sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Form fields ───────────────────────────────────────────────────────── */
interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function Field({ label: l, error, hint, children, style }: FieldProps) {
  return (
    <label className={`field ${error ? 'invalid' : ''}`} style={style}>
      <span>{l}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

/**
 * Small form helper: keeps values, shows per-field API validation errors,
 * and runs the submit with a busy flag.
 */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const { [key as string]: _, ...rest } = e;
      return rest;
    });
  }, []);

  const bind = (key: keyof T) => ({
    value: (values[key] ?? '') as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(key, e.target.value as T[keyof T]),
  });

  const submit = (fn: (v: T) => Promise<unknown>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setFormError(null);
    setErrors({});
    try {
      await fn(values);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setFormError(err);
    } finally {
      setBusy(false);
    }
  };

  return { values, set, setValues, bind, errors, formError, busy, submit };
}

/* ── Toasts ────────────────────────────────────────────────────────────── */
interface ToastItem {
  id: number;
  text: string;
  error?: boolean;
}
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, error }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Shown when an invite could not be emailed (no email service set up yet):
 * the person who invited copies the link and sends it on WhatsApp / SMS.
 */
export function InviteLinkModal({ url, who, onClose }: { url: string; who: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Hello ${who}, your Property CRM account is ready. Set your password here (valid for 48 hours): ${url}`;
  return (
    <Modal
      title="Share the invite link"
      onClose={onClose}
      footer={
        <>
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <button
            className="btn primary"
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="alert warn small">
          Email is not set up yet, so no email was sent. Send this link to <b>{who}</b> yourself. It works once and expires in 48 hours.
        </div>
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
      </div>
    </Modal>
  );
}

/** Confirmation before destructive actions (SRS FR-LOG-3). */
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}
