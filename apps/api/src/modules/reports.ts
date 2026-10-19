import { Controller, Get, Injectable, Param, Query, Res } from '@nestjs/common';
import { Prisma, RentStatus } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { NotFound } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { addDays, currentPeriod, daysBetween, isPeriod, isoDate, num, periodEnd, periodLabel, periodStart, shiftPeriod, toCsv, today, prettyDate } from '../common/util';
import { PrismaService } from '../prisma.service';
import { OPEN_STATUSES } from './maintenance';
import { propertyStats } from './properties';

type Tone = 'good' | 'warn' | 'bad' | undefined;
interface Column { key: string; label: string; align?: 'right'; format?: 'money' | 'pct' | 'date' }
interface Report {
  key: string;
  title: string;
  question: string;
  tiles: { label: string; value: number | string; format?: 'money' | 'pct'; tone?: Tone }[];
  columns: Column[];
  rows: Record<string, string | number | null>[];
  total?: Record<string, string | number | null>;
  bar?: string;
  note: string;
}

export const REPORTS = [
  { key: 'collection', title: 'Rent collection', question: 'How much rent was collected this month?' },
  { key: 'occupancy', title: 'Unit occupancy', question: 'How many units are occupied and vacant?' },
  { key: 'overdue', title: 'Overdue tenants', question: 'Which tenants are overdue?' },
  { key: 'expiry', title: 'Agreement expiry', question: 'Which agreements are about to expire?' },
  { key: 'maintenance', title: 'Maintenance by property', question: 'Which property has the most requests?' },
  { key: 'income-expense', title: 'Income vs expense', question: 'What is the income and expense per property?' },
  { key: 'vacancy', title: 'Long-vacant units', question: 'Which units have been vacant for long?' },
  { key: 'owner-statement', title: 'Owner statement', question: 'How is each owner performing?' },
  { key: 'tenants', title: 'Tenant report', question: 'Who are the tenants and what do they owe?' },
] as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async propertiesInScope(u: AuthUser, propertyId?: string) {
    return this.prisma.property.findMany({
      where: this.scope.propertyFilter(u, propertyId),
      select: { id: true, name: true, ownerId: true, owner: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Rent sums per property and status for one month. */
  async rentByProperty(ids: string[], period: string) {
    const out = new Map<string, Record<RentStatus, number>>();
    for (const id of ids) out.set(id, { PENDING: 0, PAID: 0, OVERDUE: 0 });
    if (!ids.length) return out;
    const rows = await this.prisma.$queryRaw<{ id: string; status: RentStatus; amt: Prisma.Decimal }[]>`
      SELECT u."propertyId" AS id, r.status, SUM(r.amount) AS amt
      FROM "RentEntry" r JOIN "Unit" u ON u.id = r."unitId"
      WHERE r.period = ${period} AND u."propertyId" IN (${Prisma.join(ids)})
      GROUP BY u."propertyId", r.status`;
    for (const r of rows) out.get(r.id)![r.status] = num(r.amt);
    return out;
  }

  async expensesByProperty(ids: string[], period: string) {
    const out = new Map<string, number>(ids.map((id) => [id, 0]));
    if (!ids.length) return out;
    const rows = await this.prisma.expense.groupBy({
      by: ['propertyId'],
      where: { propertyId: { in: ids }, deletedAt: null, expenseDate: { gte: periodStart(period), lte: periodEnd(period) } },
      _sum: { amount: true },
    });
    for (const r of rows) out.set(r.propertyId, num(r._sum.amount));
    return out;
  }

  async build(u: AuthUser, key: string, q: { propertyId?: string; period?: string }): Promise<Report> {
    const meta = REPORTS.find((r) => r.key === key);
    if (!meta) throw new NotFound('Report');
    const period = q.period && isPeriod(q.period) ? q.period : currentPeriod();
    const props = await this.propertiesInScope(u, q.propertyId);
    const ids = props.map((p) => p.id);
    const base = { key: meta.key, title: meta.title, question: meta.question };
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

    switch (key) {
      case 'collection': {
        const rent = await this.rentByProperty(ids, period);
        const rows = props.map((p) => {
          const r = rent.get(p.id)!;
          const due = r.PAID + r.PENDING + r.OVERDUE;
          return { property: p.name, due, paid: r.PAID, pending: r.PENDING, overdue: r.OVERDUE, collected: pct(r.PAID, due) };
        });
        const t = rows.reduce((a, r) => ({ due: a.due + r.due, paid: a.paid + r.paid, pending: a.pending + r.pending, overdue: a.overdue + r.overdue }), { due: 0, paid: 0, pending: 0, overdue: 0 });
        return {
          ...base,
          tiles: [
            { label: 'Due', value: t.due, format: 'money' },
            { label: 'Paid', value: t.paid, format: 'money', tone: 'good' },
            { label: 'Pending', value: t.pending, format: 'money' },
            { label: 'Overdue', value: t.overdue, format: 'money', tone: 'bad' },
          ],
          columns: [
            { key: 'property', label: 'Property' },
            { key: 'due', label: 'Due', align: 'right', format: 'money' },
            { key: 'paid', label: 'Paid', align: 'right', format: 'money' },
            { key: 'pending', label: 'Pending', align: 'right', format: 'money' },
            { key: 'overdue', label: 'Overdue', align: 'right', format: 'money' },
            { key: 'collected', label: 'Collected', align: 'right', format: 'pct' },
          ],
          rows,
          total: { property: 'Total', ...t, collected: pct(t.paid, t.due) },
          bar: 'collected',
          note: `${periodLabel(period)} · based on rent entered by owners. Partial payments will appear once the payment module is added.`,
        };
      }
      case 'occupancy': {
        const stats = await propertyStats(this.prisma, ids);
        const rows = props.map((p) => {
          const s = stats.get(p.id)!.units;
          return { property: p.name, total: s.total, occupied: s.OCCUPIED, vacant: s.VACANT, reserved: s.RESERVED, maintenance: s.MAINTENANCE, occupancy: pct(s.OCCUPIED, s.total) };
        });
        const t = rows.reduce((a, r) => ({ total: a.total + r.total, occupied: a.occupied + r.occupied, vacant: a.vacant + r.vacant, reserved: a.reserved + r.reserved, maintenance: a.maintenance + r.maintenance }), { total: 0, occupied: 0, vacant: 0, reserved: 0, maintenance: 0 });
        return {
          ...base,
          tiles: [
            { label: 'Occupied', value: t.occupied },
            { label: 'Vacant', value: t.vacant, tone: 'warn' },
            { label: 'Reserved', value: t.reserved },
            { label: 'Occupancy', value: pct(t.occupied, t.total), format: 'pct', tone: 'good' },
          ],
          columns: [
            { key: 'property', label: 'Property' },
            { key: 'total', label: 'Units', align: 'right' },
            { key: 'occupied', label: 'Occupied', align: 'right' },
            { key: 'vacant', label: 'Vacant', align: 'right' },
            { key: 'reserved', label: 'Reserved', align: 'right' },
            { key: 'maintenance', label: 'Maint.', align: 'right' },
            { key: 'occupancy', label: 'Occupancy', align: 'right', format: 'pct' },
          ],
          rows,
          total: { property: 'Total', ...t, occupancy: pct(t.occupied, t.total) },
          bar: 'occupancy',
          note: 'Unit status changes automatically when a lease is activated or ends.',
        };
      }
      case 'overdue': {
        const entries = await this.prisma.rentEntry.findMany({
          where: { status: 'OVERDUE', unit: { propertyId: { in: ids } } },
          include: { tenant: { select: { fullName: true, phone: true } }, unit: { select: { unitNo: true, property: { select: { name: true } } } } },
          orderBy: { dueDate: 'asc' },
        });
        const rows = entries.map((e) => ({ tenant: e.tenant.fullName, phone: e.tenant.phone, unit: e.unit.unitNo, property: e.unit.property.name, month: periodLabel(e.period), amount: num(e.amount), daysLate: daysBetween(e.dueDate, today()) }));
        const tenants = new Set(entries.map((e) => e.tenantId)).size;
        return {
          ...base,
          tiles: [
            { label: 'Tenants overdue', value: tenants, tone: 'bad' },
            { label: 'Amount overdue', value: rows.reduce((s, r) => s + r.amount, 0), format: 'money', tone: 'bad' },
            { label: 'Oldest', value: rows.length ? `${Math.max(...rows.map((r) => r.daysLate))} days` : '—' },
          ],
          columns: [
            { key: 'tenant', label: 'Tenant' },
            { key: 'phone', label: 'Mobile' },
            { key: 'unit', label: 'Unit' },
            { key: 'property', label: 'Property' },
            { key: 'month', label: 'Month' },
            { key: 'amount', label: 'Amount', align: 'right', format: 'money' },
            { key: 'daysLate', label: 'Days late', align: 'right' },
          ],
          rows,
          note: 'Overdue = rent still unpaid after its due date. Reminder emails go out the day after the due date.',
        };
      }
      case 'expiry': {
        const leases = await this.prisma.lease.findMany({
          where: { status: 'ACTIVE', endDate: { lte: addDays(today(), 60) }, unit: { propertyId: { in: ids } } },
          include: { tenant: { select: { fullName: true } }, unit: { select: { unitNo: true, property: { select: { name: true } } } } },
          orderBy: { endDate: 'asc' },
        });
        const rows = leases.map((l) => ({ tenant: l.tenant.fullName, unit: l.unit.unitNo, property: l.unit.property.name, endDate: isoDate(l.endDate), daysLeft: daysBetween(today(), l.endDate), rent: num(l.monthlyRent) }));
        const renewed = await this.prisma.lease.count({ where: { previousLeaseId: { not: null }, createdAt: { gte: periodStart(currentPeriod()) }, unit: { propertyId: { in: ids } } } });
        return {
          ...base,
          tiles: [
            { label: 'Next 30 days', value: rows.filter((r) => r.daysLeft <= 30).length, tone: 'warn' },
            { label: 'Next 60 days', value: rows.length },
            { label: 'Renewed this month', value: renewed, tone: 'good' },
          ],
          columns: [
            { key: 'tenant', label: 'Tenant' },
            { key: 'unit', label: 'Unit' },
            { key: 'property', label: 'Property' },
            { key: 'endDate', label: 'Ends', format: 'date' },
            { key: 'daysLeft', label: 'Days left', align: 'right' },
            { key: 'rent', label: 'Rent', align: 'right', format: 'money' },
          ],
          rows,
          note: 'Reminder emails are sent at 60, 30 and 7 days before the end date.',
        };
      }
      case 'maintenance': {
        const [open, progress, closed, costs, breached] = await Promise.all([
          this.prisma.maintenanceRequest.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, status: { in: ['OPEN', 'REOPENED'] } }, _count: { _all: true } }),
          this.prisma.maintenanceRequest.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, status: 'IN_PROGRESS' }, _count: { _all: true } }),
          this.prisma.maintenanceRequest.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, status: 'CLOSED', closedAt: { gte: periodStart(period), lt: addDays(periodEnd(period), 1) } }, _count: { _all: true } }),
          this.prisma.expense.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, category: 'MAINTENANCE', deletedAt: null, expenseDate: { gte: periodStart(period), lte: periodEnd(period) } }, _sum: { amount: true } }),
          this.prisma.maintenanceRequest.count({ where: { propertyId: { in: ids }, status: { in: OPEN_STATUSES }, slaDueAt: { lt: new Date() } } }),
        ]);
        const get = (arr: { propertyId: string; _count: { _all: number } }[], id: string) => arr.find((x) => x.propertyId === id)?._count._all ?? 0;
        const rows = props
          .map((p) => ({ property: p.name, open: get(open, p.id), inProgress: get(progress, p.id), closed: get(closed, p.id), cost: num(costs.find((c) => c.propertyId === p.id)?._sum.amount) }))
          .sort((a, b) => b.open + b.inProgress - (a.open + a.inProgress));
        return {
          ...base,
          tiles: [
            { label: 'Open + in progress', value: rows.reduce((s, r) => s + r.open + r.inProgress, 0) },
            { label: 'Past SLA', value: breached, tone: breached ? 'bad' : 'good' },
            { label: `Repair cost (${periodLabel(period)})`, value: rows.reduce((s, r) => s + r.cost, 0), format: 'money' },
          ],
          columns: [
            { key: 'property', label: 'Property' },
            { key: 'open', label: 'Open', align: 'right' },
            { key: 'inProgress', label: 'In progress', align: 'right' },
            { key: 'closed', label: 'Closed this month', align: 'right' },
            { key: 'cost', label: 'Cost this month', align: 'right', format: 'money' },
          ],
          rows,
          note: 'Sorted by open requests. A ticket’s cost becomes an expense when it is closed.',
        };
      }
      case 'income-expense': {
        const [rent, exp] = await Promise.all([this.rentByProperty(ids, period), this.expensesByProperty(ids, period)]);
        const rows = props.map((p) => {
          const income = rent.get(p.id)!.PAID;
          const expenses = exp.get(p.id)!;
          return { property: p.name, income, expenses, net: income - expenses };
        });
        const t = rows.reduce((a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses, net: a.net + r.net }), { income: 0, expenses: 0, net: 0 });
        return {
          ...base,
          tiles: [
            { label: 'Income', value: t.income, format: 'money', tone: 'good' },
            { label: 'Expenses', value: t.expenses, format: 'money' },
            { label: 'Net income', value: t.net, format: 'money' },
          ],
          columns: [
            { key: 'property', label: 'Property' },
            { key: 'income', label: 'Income', align: 'right', format: 'money' },
            { key: 'expenses', label: 'Expenses', align: 'right', format: 'money' },
            { key: 'net', label: 'Net', align: 'right', format: 'money' },
          ],
          rows,
          total: { property: 'Total', ...t },
          note: `${periodLabel(period)} · income = rent marked Paid; expenses include maintenance, utilities, salaries and vendor bills.`,
        };
      }
      case 'vacancy': {
        const units = await this.prisma.unit.findMany({
          where: { propertyId: { in: ids }, deletedAt: null, status: 'VACANT' },
          include: { property: { select: { name: true } } },
          orderBy: { vacantSince: 'asc' },
        });
        const rows = units.map((x) => ({ unit: x.unitNo, property: x.property.name, since: isoDate(x.vacantSince), days: x.vacantSince ? daysBetween(x.vacantSince, today()) : 0, expectedRent: num(x.expectedRent) }));
        const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) : 0;
        return {
          ...base,
          tiles: [
            { label: 'Vacant > 90 days', value: rows.filter((r) => r.days > 90).length, tone: 'warn' },
            { label: 'Average vacancy', value: `${avg} days` },
            { label: 'Rent not earned / month', value: rows.reduce((s, r) => s + r.expectedRent, 0), format: 'money' },
          ],
          columns: [
            { key: 'unit', label: 'Unit' },
            { key: 'property', label: 'Property' },
            { key: 'since', label: 'Vacant since', format: 'date' },
            { key: 'days', label: 'Days', align: 'right' },
            { key: 'expectedRent', label: 'Expected rent', align: 'right', format: 'money' },
          ],
          rows,
          note: 'Days counted from when the unit last became vacant.',
        };
      }
      case 'owner-statement': {
        const [rent, exp] = await Promise.all([this.rentByProperty(ids, period), this.expensesByProperty(ids, period)]);
        const byOwner = new Map<string, { owner: string; properties: number; income: number; expenses: number }>();
        for (const p of props) {
          const o = byOwner.get(p.ownerId) ?? { owner: p.owner.name, properties: 0, income: 0, expenses: 0 };
          o.properties += 1;
          o.income += rent.get(p.id)!.PAID;
          o.expenses += exp.get(p.id)!;
          byOwner.set(p.ownerId, o);
        }
        const rows = [...byOwner.values()].map((o) => ({ ...o, net: o.income - o.expenses }));
        const t = rows.reduce((a, r) => ({ properties: a.properties + r.properties, income: a.income + r.income, expenses: a.expenses + r.expenses, net: a.net + r.net }), { properties: 0, income: 0, expenses: 0, net: 0 });
        return {
          ...base,
          tiles: [
            { label: 'Owners', value: rows.length },
            { label: 'Properties', value: t.properties },
            { label: 'Net to owners', value: t.net, format: 'money', tone: 'good' },
          ],
          columns: [
            { key: 'owner', label: 'Owner' },
            { key: 'properties', label: 'Properties', align: 'right' },
            { key: 'income', label: 'Income', align: 'right', format: 'money' },
            { key: 'expenses', label: 'Expenses', align: 'right', format: 'money' },
            { key: 'net', label: 'Net', align: 'right', format: 'money' },
          ],
          rows,
          total: { owner: 'Total', ...t },
          note: `${periodLabel(period)} · one owner per property; an owner can hold several properties.`,
        };
      }
      case 'tenants': {
        const tenants = await this.prisma.tenant.findMany({
          where: { deletedAt: null, companyId: u.companyId, leases: { some: { unit: { propertyId: { in: ids } } } } },
          include: { leases: { where: { status: 'ACTIVE' }, take: 1, include: { unit: { select: { unitNo: true, property: { select: { name: true } } } } } } },
          orderBy: { fullName: 'asc' },
        });
        const dues = await this.prisma.rentEntry.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenants.map((t) => t.id) }, status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true } });
        const dueMap = new Map(dues.map((d) => [d.tenantId, num(d._sum.amount)]));
        const rows = tenants.map((t) => {
          const l = t.leases[0];
          return { tenant: t.fullName, phone: t.phone, status: t.status, unit: l?.unit.unitNo ?? '—', property: l?.unit.property.name ?? '—', rent: l ? num(l.monthlyRent) : 0, leaseEnd: isoDate(l?.endDate), dues: dueMap.get(t.id) ?? 0 };
        });
        return {
          ...base,
          tiles: [
            { label: 'Active', value: rows.filter((r) => r.status === 'ACTIVE').length, tone: 'good' },
            { label: 'Previous', value: rows.filter((r) => r.status === 'PREVIOUS').length },
            { label: 'Total dues', value: rows.reduce((s, r) => s + r.dues, 0), format: 'money', tone: 'warn' },
          ],
          columns: [
            { key: 'tenant', label: 'Tenant' },
            { key: 'phone', label: 'Mobile' },
            { key: 'status', label: 'Status' },
            { key: 'unit', label: 'Unit' },
            { key: 'property', label: 'Property' },
            { key: 'rent', label: 'Rent', align: 'right', format: 'money' },
            { key: 'leaseEnd', label: 'Lease ends', format: 'date' },
            { key: 'dues', label: 'Dues', align: 'right', format: 'money' },
          ],
          rows,
          note: 'Dues = pending + overdue rent entries.',
        };
      }
    }
    throw new NotFound('Report');
  }

  /** Data for the dashboard (brief §6): everything a manager needs in 15 seconds. */
  async dashboard(u: AuthUser, q: { propertyId?: string; period?: string }) {
    const period = q.period && isPeriod(q.period) ? q.period : currentPeriod();
    const props = await this.propertiesInScope(u, q.propertyId);
    const ids = props.map((p) => p.id);
    const now = today();
    const [stats, rent, exp, activeTenants, activeLeases, entered, openTickets, breached, expiring] = await Promise.all([
      propertyStats(this.prisma, ids),
      this.rentByProperty(ids, period),
      this.expensesByProperty(ids, period),
      this.prisma.tenant.count({ where: { deletedAt: null, leases: { some: { status: 'ACTIVE', unit: { propertyId: { in: ids } } } } } }),
      this.prisma.lease.count({ where: { status: 'ACTIVE', unit: { propertyId: { in: ids } } } }),
      this.prisma.rentEntry.count({ where: { period, unit: { propertyId: { in: ids } }, lease: { status: 'ACTIVE' } } }),
      this.prisma.maintenanceRequest.count({ where: { propertyId: { in: ids }, status: { in: OPEN_STATUSES } } }),
      this.prisma.maintenanceRequest.count({ where: { propertyId: { in: ids }, status: { in: OPEN_STATUSES }, slaDueAt: { lt: new Date() } } }),
      this.prisma.lease.count({ where: { status: 'ACTIVE', endDate: { gte: now, lte: addDays(now, 30) }, unit: { propertyId: { in: ids } } } }),
    ]);

    const units = { total: 0, OCCUPIED: 0, VACANT: 0, RESERVED: 0, MAINTENANCE: 0 };
    let openFromStats = 0;
    for (const s of stats.values()) {
      units.total += s.units.total;
      units.OCCUPIED += s.units.OCCUPIED;
      units.VACANT += s.units.VACANT;
      units.RESERVED += s.units.RESERVED;
      units.MAINTENANCE += s.units.MAINTENANCE;
      openFromStats += s.openTickets;
    }
    const money = { paid: 0, pending: 0, overdue: 0 };
    for (const r of rent.values()) {
      money.paid += r.PAID;
      money.pending += r.PENDING;
      money.overdue += r.OVERDUE;
    }
    const expenses = [...exp.values()].reduce((s, v) => s + v, 0);
    const overdueTenants = await this.prisma.rentEntry.findMany({ where: { status: 'OVERDUE', unit: { propertyId: { in: ids } } }, distinct: ['tenantId'], select: { tenantId: true } });

    // "Needs your attention": overdue rent, leases ending soon, urgent or late tickets.
    const [overdueList, expiringList, ticketList] = await Promise.all([
      this.prisma.rentEntry.findMany({
        where: { status: 'OVERDUE', unit: { propertyId: { in: ids } } },
        include: { tenant: { select: { id: true, fullName: true } }, unit: { select: { id: true, unitNo: true, property: { select: { name: true } } } } },
        orderBy: { dueDate: 'asc' },
        take: 4,
      }),
      this.prisma.lease.findMany({
        where: { status: 'ACTIVE', endDate: { gte: now, lte: addDays(now, 30) }, unit: { propertyId: { in: ids } } },
        include: { tenant: { select: { id: true, fullName: true } }, unit: { select: { id: true, unitNo: true, property: { select: { name: true } } } } },
        orderBy: { endDate: 'asc' },
        take: 3,
      }),
      this.prisma.maintenanceRequest.findMany({
        where: { propertyId: { in: ids }, status: { in: OPEN_STATUSES }, OR: [{ priority: 'URGENT' }, { slaDueAt: { lt: new Date() } }] },
        include: { unit: { select: { unitNo: true } }, property: { select: { name: true } }, assignedTo: { select: { name: true } } },
        orderBy: { slaDueAt: 'asc' },
        take: 3,
      }),
    ]);
    const attention = [
      ...overdueList.map((e) => ({
        kind: 'OVERDUE',
        title: `${e.tenant.fullName} · Unit ${e.unit.unitNo}, ${e.unit.property.name}`,
        meta: `₹${num(e.amount).toLocaleString('en-IN')} · ${daysBetween(e.dueDate, now)} days past due`,
        action: 'Open tenant',
        link: `/tenants/${e.tenant.id}`,
      })),
      ...expiringList.map((l) => ({
        kind: 'EXPIRING',
        title: `${l.tenant.fullName} · Unit ${l.unit.unitNo}, ${l.unit.property.name}`,
        meta: `Lease ends ${prettyDate(l.endDate)} · ${daysBetween(now, l.endDate)} days left`,
        action: 'Renew lease',
        link: `/leases/${l.id}`,
      })),
      ...ticketList.map((t) => ({
        kind: t.slaDueAt < new Date() ? 'SLA' : 'URGENT',
        title: `${t.title} · ${t.unit ? `Unit ${t.unit.unitNo}, ` : ''}${t.property.name}`,
        meta: `Ticket #${t.ticketNo} · ${t.slaDueAt < new Date() ? 'SLA breached' : 'Urgent'} · ${t.assignedTo ? `assigned to ${t.assignedTo.name}` : 'unassigned'}`,
        action: t.assignedTo ? 'View ticket' : 'Assign staff',
        link: `/maintenance?ticket=${t.id}`,
      })),
    ];

    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const p = shiftPeriod(period, -i);
      const r = await this.rentByProperty(ids, p);
      let due = 0;
      let paid = 0;
      for (const v of r.values()) {
        due += v.PAID + v.PENDING + v.OVERDUE;
        paid += v.PAID;
      }
      trend.push({ period: p, label: periodLabel(p).split(' ')[0].slice(0, 3), due, paid });
    }

    const [recentRent, recentTickets] = await Promise.all([
      this.prisma.rentEntry.findMany({
        where: { unit: { propertyId: { in: ids } } },
        include: { tenant: { select: { id: true, fullName: true } }, unit: { select: { id: true, unitNo: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.maintenanceRequest.findMany({
        where: { propertyId: { in: ids } },
        include: { unit: { select: { unitNo: true } }, property: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      period,
      periodLabel: periodLabel(period),
      kpis: {
        properties: props.length,
        units,
        activeTenants,
        activeLeases,
        rentEntered: entered,
        rentDue: money.paid + money.pending + money.overdue,
        collected: money.paid,
        pending: money.pending,
        overdue: money.overdue,
        overdueTenants: overdueTenants.length,
        openTickets: openTickets || openFromStats,
        slaBreached: breached,
        expiring30: expiring,
        expenses,
        netIncome: money.paid - expenses,
      },
      occupancyByProperty: props.map((p) => {
        const s = stats.get(p.id)!.units;
        return { id: p.id, name: p.name, occupied: s.OCCUPIED, total: s.total };
      }),
      attention,
      trend,
      recentRent: recentRent.map((r) => ({ id: r.id, unit: r.unit, tenant: r.tenant, period: r.period, amount: num(r.amount), status: r.status })),
      recentTickets: recentTickets.map((t) => ({ id: t.id, ticketNo: t.ticketNo, title: t.title, priority: t.priority, status: t.status, unit: t.unit?.unitNo ?? null, property: t.property.name, category: t.category })),
    };
  }
}

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Can('dashboard:read')
  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.dashboard(u, q);
  }

  @Can('reports:read')
  @Get('reports')
  list() {
    return REPORTS;
  }

  @Can('reports:read')
  @Get('reports/:key')
  async report(@CurrentUser() u: AuthUser, @Param('key') key: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.build(u, key, q);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.key}-${q.period || currentPeriod()}.csv"`);
      const rows = report.total ? [...report.rows, report.total] : report.rows;
      return '﻿' + toCsv(report.columns, rows);
    }
    return report;
  }
}
