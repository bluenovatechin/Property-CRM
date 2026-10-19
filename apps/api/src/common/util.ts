import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Converts a Prisma Decimal (or anything numeric) to a JS number. */
export function num(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date (YYYY-MM-DD) in the business timezone. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A date-only value stored as UTC midnight, matching Postgres DATE columns. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function today(): Date {
  return dateOnly(todayISO());
}

export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Date for people to read, e.g. 28 Oct 2026. */
export function prettyDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Current month as YYYY-MM. */
export function currentPeriod(): string {
  return todayISO().slice(0, 7);
}

export function isPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function periodStart(period: string): Date {
  return dateOnly(`${period}-01`);
}

export function periodEnd(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dateOnly(`${period}-${pad(last)}`);
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function periodDueDate(period: string, dueDay: number): Date {
  const end = periodEnd(period);
  const day = Math.min(dueDay, end.getUTCDate());
  return dateOnly(`${period}-${pad(day)}`);
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatINR(value: number): string {
  return '₹' + Math.round(value).toLocaleString('en-IN');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Masks all but the last 4 characters of an ID or account number. */
export function mask(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const clean = value.replace(/\s/g, '');
  if (clean.length <= 4) return 'XXXX';
  return 'X'.repeat(clean.length - 4) + clean.slice(-4);
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c.key])).join(','));
  return lines.join('\n');
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
