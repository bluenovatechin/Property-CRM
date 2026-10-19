const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,20,000 */
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '₹' + inrFormatter.format(Math.round(n));
}

/** ₹38.4 L / ₹1.2 Cr for large figures, otherwise the full amount. */
export function inrShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-19 → 19 Oct 2026 */
export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "3 h ago", "2 days ago" */
export function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function timeLeft(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'SLA breached';
  if (mins < 60) return `${mins} min left`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h left`;
  return `${Math.round(h / 24)} days left`;
}

/** 2026-10 → October 2026 */
export function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function shiftPeriod(p: string, months: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** UPPER_SNAKE → Title case */
export function label(s: string | null | undefined): string {
  if (!s) return '—';
  const t = s.toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const MODE: Record<string, string> = { UPI: 'UPI', BANK: 'Bank transfer', CASH: 'Cash', CHEQUE: 'Cheque', CARD: 'Card' };
/** Payment mode label, e.g. BANK → Bank transfer */
export function modeLabel(mode: string | null | undefined): string {
  return mode ? MODE[mode] ?? label(mode) : '—';
}

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Property Manager',
  FINANCE: 'Finance',
  STAFF: 'Maintenance Staff',
  OWNER: 'Owner',
  TENANT: 'Tenant',
};
