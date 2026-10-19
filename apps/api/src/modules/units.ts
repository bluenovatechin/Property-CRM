import { Body, Controller, Delete, Get, Injectable, Param, Patch, Query } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { daysBetween, isoDate, num, today } from '../common/util';
import { parse, zMoney, zOptText } from '../common/validation';
import { PrismaService } from '../prisma.service';

const updateSchema = z.object({
  unitNo: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().optional().nullable(),
  block: zOptText,
  unitType: z.string().trim().min(1),
  areaSqft: z.coerce.number().int().positive().optional().nullable(),
  expectedRent: zMoney,
  securityDeposit: zMoney,
  // OCCUPIED is set only by activating a lease.
  status: z.enum(['VACANT', 'RESERVED', 'MAINTENANCE']),
  notes: zOptText,
}).partial();

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
  ) {}

  /** Units for pickers, e.g. ?propertyId=…&status=VACANT,RESERVED for a new lease. */
  async list(u: AuthUser, q: { propertyId?: string; status?: string }) {
    const statuses = q.status ? (q.status.split(',') as UnitStatus[]) : undefined;
    const units = await this.prisma.unit.findMany({
      where: { AND: [this.scope.unitWhere(u, q.propertyId), statuses ? { status: { in: statuses } } : {}] },
      include: { property: { select: { id: true, name: true } } },
      orderBy: [{ property: { name: 'asc' } }, { floor: 'asc' }, { unitNo: 'asc' }],
      take: 2000,
    });
    return units.map((x) => ({
      id: x.id,
      unitNo: x.unitNo,
      unitType: x.unitType,
      status: x.status,
      expectedRent: num(x.expectedRent),
      securityDeposit: num(x.securityDeposit),
      property: x.property,
    }));
  }

  /** Everything brief §9 asks for on the unit page. */
  async get(u: AuthUser, id: string) {
    const unit = await this.scope.assertUnit(u, id);
    const [leases, rent, tickets] = await Promise.all([
      this.prisma.lease.findMany({ where: { unitId: id }, include: { tenant: { select: { id: true, fullName: true, phone: true, email: true } } }, orderBy: { startDate: 'desc' } }),
      this.prisma.rentEntry.findMany({ where: { unitId: id }, orderBy: { period: 'desc' }, take: 24 }),
      this.prisma.maintenanceRequest.findMany({ where: { unitId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const active = leases.find((l) => l.status === 'ACTIVE');
    const timeline = await this.activity.forEntities([{ type: 'UNIT', id }, ...leases.map((l) => ({ type: 'LEASE', id: l.id })), ...rent.map((r) => ({ type: 'RENT', id: r.id }))], 25);
    const pending = rent.filter((r) => r.status !== 'PAID').reduce((s, r) => s + num(r.amount), 0);
    const receivedThisLease = active ? rent.filter((r) => r.leaseId === active.id && r.status === 'PAID').reduce((s, r) => s + num(r.amount), 0) : 0;
    return {
      id: unit.id,
      unitNo: unit.unitNo,
      floor: unit.floor,
      block: unit.block,
      unitType: unit.unitType,
      areaSqft: unit.areaSqft,
      expectedRent: num(unit.expectedRent),
      securityDeposit: num(unit.securityDeposit),
      status: unit.status,
      vacantSince: isoDate(unit.vacantSince),
      notes: unit.notes,
      property: { id: unit.property.id, name: unit.property.name, code: unit.property.code },
      activeLease: active
        ? {
            id: active.id,
            tenant: active.tenant,
            startDate: isoDate(active.startDate),
            endDate: isoDate(active.endDate),
            monthlyRent: num(active.monthlyRent),
            securityDeposit: num(active.securityDeposit),
            dueDay: active.dueDay,
            daysLeft: daysBetween(today(), active.endDate),
          }
        : null,
      pendingAmount: pending,
      receivedThisLease,
      leases: leases.map((l) => ({ id: l.id, status: l.status, startDate: isoDate(l.startDate), endDate: isoDate(l.endDate), monthlyRent: num(l.monthlyRent), tenant: l.tenant })),
      rent: rent.map((r) => ({ id: r.id, period: r.period, amount: num(r.amount), dueDate: isoDate(r.dueDate), status: r.status, paidOn: isoDate(r.paidOn), mode: r.mode, reference: r.reference })),
      tickets: tickets.map((t) => ({ id: t.id, ticketNo: t.ticketNo, title: t.title, category: t.category, priority: t.priority, status: t.status, actualCost: t.actualCost ? num(t.actualCost) : null, createdAt: t.createdAt, closedAt: t.closedAt })),
      timeline: timeline.map((a) => ({ id: a.id, action: a.action, summary: a.summary, createdAt: a.createdAt, by: a.user?.name ?? 'System' })),
    };
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const unit = await this.scope.assertUnit(u, id);
    const data = parse(updateSchema, body);
    if (data.status && unit.status === 'OCCUPIED') {
      throw new BusinessError('UNIT_OCCUPIED', 'This unit has an active lease. End the lease to change its status.');
    }
    if (data.unitNo && data.unitNo !== unit.unitNo) {
      const dup = await this.prisma.unit.findFirst({ where: { propertyId: unit.propertyId, unitNo: data.unitNo } });
      if (dup) throw new BusinessError('UNIT_EXISTS', `Unit ${data.unitNo} already exists.`);
    }
    const updated = await this.prisma.unit.update({
      where: { id },
      data: { ...data, vacantSince: data.status === 'VACANT' && unit.status !== 'VACANT' ? today() : undefined },
    });
    await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: id, action: 'update', summary: `Updated unit ${unit.unitNo}`, newValues: data });
    return updated;
  }

  async remove(u: AuthUser, id: string) {
    const unit = await this.scope.assertUnit(u, id);
    if (unit.status === 'OCCUPIED') throw new BusinessError('UNIT_OCCUPIED', 'End the active lease before deleting this unit.');
    await this.prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: id, action: 'delete', summary: `Deleted unit ${unit.unitNo}` });
    return { ok: true };
  }
}

@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Can('properties:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.units.list(u, q);
  }

  @Can('properties:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.units.get(u, id);
  }

  @Can('units:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.units.update(u, id, body);
  }

  @Can('units:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.units.remove(u, id);
  }
}
