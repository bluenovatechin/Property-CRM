import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, RentStatus } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { currentPeriod, dateOnly, formatINR, isPeriod, isoDate, num, periodDueDate, periodEnd, periodLabel, periodStart, today } from '../common/util';
import { parse, zDate, zMoney, zOptText, zPeriod } from '../common/validation';
import { PrismaService } from '../prisma.service';

const modes = ['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD'] as const;

const createSchema = z.object({
  leaseId: z.string().uuid('Choose a unit'),
  period: zPeriod,
  amount: zMoney.optional(),
  dueDate: zDate.optional(),
  status: z.enum(['PENDING', 'PAID']).default('PENDING'),
  paidOn: zDate.optional().nullable(),
  mode: z.enum(modes).optional().nullable(),
  reference: zOptText,
  notes: zOptText,
});

const updateSchema = z.object({
  amount: zMoney.optional(),
  dueDate: zDate.optional(),
  status: z.enum(['PENDING', 'PAID']).optional(),
  paidOn: zDate.optional().nullable(),
  mode: z.enum(modes).optional().nullable(),
  reference: zOptText,
  notes: zOptText,
});

/** PENDING past its due date is shown (and stored by the daily job) as OVERDUE. */
function effectiveStatus(status: 'PENDING' | 'PAID', due: Date): RentStatus {
  if (status === 'PAID') return 'PAID';
  return due < today() ? 'OVERDUE' : 'PENDING';
}

@Injectable()
export class RentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
  ) {}

  /** Leases that should have rent for the given month. */
  private leasesForPeriod(u: AuthUser, period: string, propertyId?: string): Prisma.LeaseWhereInput {
    const start = periodStart(period);
    const end = periodEnd(period);
    return {
      AND: [
        this.scope.leaseWhere(u, propertyId),
        { startDate: { lte: end } },
        {
          OR: [
            { status: 'ACTIVE' },
            { status: { in: ['EXPIRED', 'RENEWED'] }, endDate: { gte: start } },
            { status: 'TERMINATED', terminatedOn: { gte: start } },
          ],
        },
      ],
    };
  }

  async month(u: AuthUser, q: { period?: string; propertyId?: string; status?: string; q?: string }) {
    const period = q.period && isPeriod(q.period) ? q.period : currentPeriod();
    const leases = await this.prisma.lease.findMany({
      where: this.leasesForPeriod(u, period, q.propertyId),
      include: {
        unit: { select: { id: true, unitNo: true, floor: true, property: { select: { id: true, name: true } } } },
        tenant: { select: { id: true, fullName: true, phone: true } },
        rentEntries: { where: { period }, include: { enteredBy: { select: { name: true } } } },
      },
      orderBy: [{ unit: { property: { name: 'asc' } } }, { unit: { floor: 'asc' } }, { unit: { unitNo: 'asc' } }],
    });

    let rows = leases.map((l) => {
      const e = l.rentEntries[0];
      return {
        leaseId: l.id,
        entryId: e?.id ?? null,
        unit: l.unit,
        tenant: l.tenant,
        monthlyRent: num(l.monthlyRent),
        amount: e ? num(e.amount) : num(l.monthlyRent),
        dueDate: e ? isoDate(e.dueDate) : isoDate(periodDueDate(period, l.dueDay)),
        status: (e?.status ?? 'NOT_ENTERED') as RentStatus | 'NOT_ENTERED',
        paidOn: isoDate(e?.paidOn),
        mode: e?.mode ?? null,
        reference: e?.reference ?? null,
        notes: e?.notes ?? null,
        enteredBy: e?.enteredBy.name ?? null,
      };
    });

    const sum = (s: string) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.amount, 0);
    const summary = {
      period,
      label: periodLabel(period),
      leases: rows.length,
      entered: rows.filter((r) => r.status !== 'NOT_ENTERED').length,
      due: rows.filter((r) => r.status !== 'NOT_ENTERED').reduce((t, r) => t + r.amount, 0),
      paid: sum('PAID'),
      pending: sum('PENDING'),
      overdue: sum('OVERDUE'),
      notEnteredRent: sum('NOT_ENTERED'),
      counts: {
        PAID: rows.filter((r) => r.status === 'PAID').length,
        PENDING: rows.filter((r) => r.status === 'PENDING').length,
        OVERDUE: rows.filter((r) => r.status === 'OVERDUE').length,
        NOT_ENTERED: rows.filter((r) => r.status === 'NOT_ENTERED').length,
      },
    };

    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter((r) => r.unit.unitNo.toLowerCase().includes(needle) || r.tenant.fullName.toLowerCase().includes(needle) || r.tenant.phone.includes(needle));
    }
    return { summary, rows };
  }

  private validatePaid(status: 'PENDING' | 'PAID' | undefined, paidOn?: string | null, mode?: string | null) {
    if (status === 'PAID' && (!paidOn || !mode)) {
      throw new BusinessError('PAID_DETAILS_REQUIRED', 'Add the paid-on date and payment mode to mark rent as paid.', 400);
    }
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(createSchema, body);
    this.validatePaid(data.status, data.paidOn, data.mode);
    const lease = await this.prisma.lease.findFirst({ where: { AND: [this.leasesForPeriod(u, data.period), { id: data.leaseId }] }, include: { unit: true, tenant: true } });
    if (!lease) throw new NotFound('Lease for this month');
    const exists = await this.prisma.rentEntry.findUnique({ where: { leaseId_period: { leaseId: lease.id, period: data.period } } });
    if (exists) throw new BusinessError('ALREADY_ENTERED', `Rent for unit ${lease.unit.unitNo} in ${periodLabel(data.period)} is already entered. Edit that entry instead.`);

    const due = data.dueDate ? dateOnly(data.dueDate) : periodDueDate(data.period, lease.dueDay);
    const entry = await this.prisma.rentEntry.create({
      data: {
        leaseId: lease.id,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        period: data.period,
        amount: data.amount ?? lease.monthlyRent,
        dueDate: due,
        status: effectiveStatus(data.status, due),
        paidOn: data.status === 'PAID' && data.paidOn ? dateOnly(data.paidOn) : null,
        mode: data.status === 'PAID' ? data.mode : null,
        reference: data.reference,
        notes: data.notes,
        enteredById: u.id,
      },
    });
    const amount = formatINR(num(entry.amount));
    await this.activity.log(u, u.companyId, {
      entityType: 'RENT',
      entityId: entry.id,
      action: 'create',
      summary: data.status === 'PAID' ? `${periodLabel(data.period)} rent ${amount} entered and marked Paid (${data.mode})` : `${periodLabel(data.period)} rent ${amount} entered`,
    });
    return entry;
  }

  private async assertEntry(u: AuthUser, id: string) {
    const entry = await this.prisma.rentEntry.findFirst({ where: { id, lease: this.scope.leaseWhere(u) }, include: { unit: true } });
    if (!entry) throw new NotFound('Rent entry');
    return entry;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const entry = await this.assertEntry(u, id);
    const data = parse(updateSchema, body);
    const nextStatus = data.status ?? (entry.status === 'PAID' ? 'PAID' : 'PENDING');
    const paidOn = data.paidOn !== undefined ? data.paidOn : isoDate(entry.paidOn);
    const mode = data.mode !== undefined ? data.mode : entry.mode;
    this.validatePaid(nextStatus, paidOn, mode);
    const due = data.dueDate ? dateOnly(data.dueDate) : entry.dueDate;
    const updated = await this.prisma.rentEntry.update({
      where: { id },
      data: {
        amount: data.amount,
        dueDate: due,
        status: effectiveStatus(nextStatus, due),
        paidOn: nextStatus === 'PAID' && paidOn ? dateOnly(paidOn) : null,
        mode: nextStatus === 'PAID' ? mode : null,
        reference: data.reference !== undefined ? data.reference : entry.reference,
        notes: data.notes !== undefined ? data.notes : entry.notes,
      },
    });
    const changedToPaid = entry.status !== 'PAID' && updated.status === 'PAID';
    await this.activity.log(u, u.companyId, {
      entityType: 'RENT',
      entityId: id,
      action: changedToPaid ? 'mark_paid' : 'update',
      summary: changedToPaid
        ? `${periodLabel(entry.period)} rent marked Paid · ${formatINR(num(updated.amount))} (${updated.mode})`
        : `${periodLabel(entry.period)} rent entry updated`,
      oldValues: { status: entry.status, amount: num(entry.amount) },
      newValues: { status: updated.status, amount: num(updated.amount) },
    });
    return updated;
  }

  async remove(u: AuthUser, id: string) {
    const entry = await this.assertEntry(u, id);
    if (entry.status === 'PAID') throw new BusinessError('PAID_LOCKED', 'A paid entry cannot be deleted. Change it back to Pending first if it was a mistake.');
    await this.prisma.rentEntry.delete({ where: { id } });
    await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: entry.unitId, action: 'rent_deleted', summary: `${periodLabel(entry.period)} rent entry deleted` });
    return { ok: true };
  }

  /** Creates Pending entries for every lease that has none yet this month; the owner then reviews them. */
  async prefill(u: AuthUser, body: unknown) {
    const data = parse(z.object({ period: zPeriod, propertyId: z.string().uuid().optional() }), body);
    const leases = await this.prisma.lease.findMany({
      where: { AND: [this.leasesForPeriod(u, data.period, data.propertyId), { rentEntries: { none: { period: data.period } } }] },
    });
    await this.prisma.rentEntry.createMany({
      data: leases.map((l) => {
        const due = periodDueDate(data.period, l.dueDay);
        return { leaseId: l.id, unitId: l.unitId, tenantId: l.tenantId, period: data.period, amount: l.monthlyRent, dueDate: due, status: effectiveStatus('PENDING', due), enteredById: u.id };
      }),
      skipDuplicates: true,
    });
    return { created: leases.length };
  }
}

@Controller('rent')
export class RentController {
  constructor(private readonly rent: RentService) {}

  @Can('rent:read')
  @Get()
  month(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.rent.month(u, q);
  }

  @Can('rent:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.rent.create(u, body);
  }

  @Can('rent:write')
  @Post('prefill')
  prefill(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.rent.prefill(u, body);
  }

  @Can('rent:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.rent.update(u, id, body);
  }

  @Can('rent:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.rent.remove(u, id);
  }
}
