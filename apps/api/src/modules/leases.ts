import { Body, Controller, Get, Injectable, Logger, Param, Post, Query } from '@nestjs/common';
import { LeaseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError } from '../common/errors';
import { NotifyService } from '../common/notify.service';
import { ScopeService } from '../common/scope.service';
import { addDays, dateOnly, daysBetween, isoDate, num, today, prettyDate } from '../common/util';
import { parse, zDate, zMoney, zOptText } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { TenantsService } from './tenants';

const createSchema = z
  .object({
    unitId: z.string().uuid('Choose a unit'),
    tenantId: z.string().uuid('Choose a tenant'),
    startDate: zDate,
    endDate: zDate,
    monthlyRent: zMoney.refine((v) => v > 0, 'Enter the monthly rent'),
    securityDeposit: zMoney,
    dueDay: z.coerce.number().int().min(1, 'Between 1 and 28').max(28, 'Between 1 and 28').default(5),
    noticeDays: z.coerce.number().int().min(0).max(365).default(30),
    escalationPct: z.coerce.number().min(0).max(100).default(0),
    renewalTerms: zOptText,
    activate: z.boolean().default(true),
    invitePortal: z.boolean().default(false),
  })
  .refine((d) => d.endDate > d.startDate, { path: ['endDate'], message: 'End date must be after the start date' });

const terminateSchema = z.object({ date: zDate, reason: z.string().trim().min(3, 'Give a short reason') });
const renewSchema = z.object({ startDate: zDate.optional(), endDate: zDate, monthlyRent: zMoney.optional() });

type Tx = Prisma.TransactionClient;

@Injectable()
export class LeasesService {
  private readonly logger = new Logger('Leases');

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly tenants: TenantsService,
  ) {}

  private shape(l: Prisma.LeaseGetPayload<{ include: { unit: { include: { property: true } }; tenant: true } }>) {
    return {
      id: l.id,
      status: l.status,
      startDate: isoDate(l.startDate),
      endDate: isoDate(l.endDate),
      daysLeft: daysBetween(today(), l.endDate),
      monthlyRent: num(l.monthlyRent),
      securityDeposit: num(l.securityDeposit),
      dueDay: l.dueDay,
      noticeDays: l.noticeDays,
      escalationPct: num(l.escalationPct),
      renewalTerms: l.renewalTerms,
      previousLeaseId: l.previousLeaseId,
      terminatedOn: isoDate(l.terminatedOn),
      terminationReason: l.terminationReason,
      unit: { id: l.unit.id, unitNo: l.unit.unitNo, unitType: l.unit.unitType, property: { id: l.unit.property.id, name: l.unit.property.name } },
      tenant: { id: l.tenant.id, fullName: l.tenant.fullName, phone: l.tenant.phone, email: l.tenant.email },
    };
  }

  async list(u: AuthUser, q: { status?: string; propertyId?: string; tenantId?: string; expiringInDays?: string }) {
    const where: Prisma.LeaseWhereInput = {
      AND: [
        this.scope.leaseWhere(u, q.propertyId),
        q.status ? { status: { in: q.status.split(',') as LeaseStatus[] } } : {},
        q.tenantId ? { tenantId: q.tenantId } : {},
        q.expiringInDays ? { status: 'ACTIVE', endDate: { lte: addDays(today(), Number(q.expiringInDays)) } } : {},
      ],
    };
    const leases = await this.prisma.lease.findMany({ where, include: { unit: { include: { property: true } }, tenant: true }, orderBy: { endDate: 'asc' }, take: 1000 });
    return leases.map((l) => this.shape(l));
  }

  async get(u: AuthUser, id: string) {
    return this.shape(await this.scope.assertLease(u, id));
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(createSchema, body);
    const unit = await this.scope.assertUnit(u, data.unitId);
    await this.scope.assertTenant(u, data.tenantId);
    if (unit.status === 'OCCUPIED' || unit.status === 'MAINTENANCE') {
      throw new BusinessError('UNIT_NOT_AVAILABLE', `Unit ${unit.unitNo} is ${unit.status.toLowerCase()}. Only vacant or reserved units can get a new lease.`);
    }
    const lease = await this.prisma.lease.create({
      data: {
        unitId: data.unitId,
        tenantId: data.tenantId,
        startDate: dateOnly(data.startDate),
        endDate: dateOnly(data.endDate),
        monthlyRent: data.monthlyRent,
        securityDeposit: data.securityDeposit,
        dueDay: data.dueDay,
        noticeDays: data.noticeDays,
        escalationPct: data.escalationPct,
        renewalTerms: data.renewalTerms,
        status: 'DRAFT',
      },
    });
    await this.activity.log(u, u.companyId, { entityType: 'LEASE', entityId: lease.id, action: 'create', summary: `Created lease for unit ${unit.unitNo}` });
    if (data.activate) await this.activate(u, lease.id);
    let inviteUrl: string | undefined;
    if (data.invitePortal) {
      try {
        inviteUrl = (await this.tenants.invite(u, data.tenantId)).inviteUrl;
      } catch (e) {
        this.logger.warn(`Lease saved but portal invite failed: ${(e as Error).message}`);
      }
    }
    return { ...(await this.get(u, lease.id)), inviteUrl };
  }

  /** Draft → Active: unit becomes Occupied and the tenant Active (SRS FR-LEASE-3). */
  async activate(u: AuthUser, id: string) {
    const lease = await this.scope.assertLease(u, id);
    if (lease.status !== 'DRAFT') throw new BusinessError('BAD_STATUS', 'Only a draft lease can be activated.');
    await this.prisma.$transaction(async (tx) => {
      const other = await tx.lease.findFirst({ where: { unitId: lease.unitId, status: 'ACTIVE' } });
      if (other) throw new BusinessError('UNIT_ALREADY_OCCUPIED', `Unit ${lease.unit.unitNo} already has an active lease.`);
      await tx.lease.update({ where: { id }, data: { status: 'ACTIVE' } });
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'OCCUPIED', vacantSince: null } });
      await tx.tenant.update({ where: { id: lease.tenantId }, data: { status: 'ACTIVE', ownerId: lease.unit.property.ownerId } });
      await this.activity.log(u, u.companyId, { entityType: 'LEASE', entityId: id, action: 'activate', summary: `Lease activated · unit ${lease.unit.unitNo} is now Occupied by ${lease.tenant.fullName}` }, tx);
      await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: lease.unitId, action: 'occupied', summary: `Status changed to Occupied (${lease.tenant.fullName})` }, tx);
    });
    return this.get(u, id);
  }

  /** Shared clean-up when a lease stops being active (terminated, expired or renewed-out). */
  async releaseUnit(tx: Tx, lease: { id: string; unitId: string; tenantId: string }, onDate: Date) {
    await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'VACANT', vacantSince: onDate } });
    const stillActive = await tx.lease.count({ where: { tenantId: lease.tenantId, status: 'ACTIVE', NOT: { id: lease.id } } });
    if (!stillActive) await tx.tenant.update({ where: { id: lease.tenantId }, data: { status: 'PREVIOUS' } });
  }

  async terminate(u: AuthUser, id: string, body: unknown) {
    const data = parse(terminateSchema, body);
    const lease = await this.scope.assertLease(u, id);
    if (lease.status !== 'ACTIVE') throw new BusinessError('BAD_STATUS', 'Only an active lease can be terminated.');
    const on = dateOnly(data.date);
    await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({ where: { id }, data: { status: 'TERMINATED', terminatedOn: on, terminationReason: data.reason } });
      await this.releaseUnit(tx, lease, on);
      await this.activity.log(u, u.companyId, { entityType: 'LEASE', entityId: id, action: 'terminate', summary: `Lease terminated on ${data.date}: ${data.reason}` }, tx);
      await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: lease.unitId, action: 'vacant', summary: 'Status changed to Vacant (lease terminated)' }, tx);
    });
    return this.get(u, id);
  }

  /** Active → Renewed; a new Active lease continues from the old one, rent raised by the escalation %. */
  async renew(u: AuthUser, id: string, body: unknown) {
    const data = parse(renewSchema, body);
    const lease = await this.scope.assertLease(u, id);
    if (lease.status !== 'ACTIVE') throw new BusinessError('BAD_STATUS', 'Only an active lease can be renewed.');
    const start = data.startDate ? dateOnly(data.startDate) : addDays(lease.endDate, 1);
    const end = dateOnly(data.endDate);
    if (end <= start) throw new BusinessError('BAD_DATES', 'The new end date must be after the new start date.', 400);
    const rent = data.monthlyRent ?? Math.round(num(lease.monthlyRent) * (1 + num(lease.escalationPct) / 100));
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({ where: { id }, data: { status: 'RENEWED' } });
      const created = await tx.lease.create({
        data: {
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          startDate: start,
          endDate: end,
          monthlyRent: rent,
          securityDeposit: lease.securityDeposit,
          dueDay: lease.dueDay,
          noticeDays: lease.noticeDays,
          escalationPct: lease.escalationPct,
          renewalTerms: lease.renewalTerms,
          status: 'ACTIVE',
          previousLeaseId: id,
        },
      });
      await this.activity.log(u, u.companyId, { entityType: 'LEASE', entityId: created.id, action: 'renew', summary: `Lease renewed until ${prettyDate(end)} at ₹${rent.toLocaleString('en-IN')}/month` }, tx);
      return created;
    });
    return this.get(u, next.id);
  }

  /** Daily job: active leases past their end date become Expired and the unit Vacant. */
  async expireEnded(): Promise<number> {
    const ended = await this.prisma.lease.findMany({ where: { status: 'ACTIVE', endDate: { lt: today() } }, include: { unit: { include: { property: true } }, tenant: true } });
    for (const lease of ended) {
      await this.prisma.$transaction(async (tx) => {
        await tx.lease.update({ where: { id: lease.id }, data: { status: 'EXPIRED' } });
        await this.releaseUnit(tx, lease, addDays(lease.endDate, 1));
        await this.activity.log(null, lease.unit.property.companyId, { entityType: 'LEASE', entityId: lease.id, action: 'expire', summary: `Lease expired on ${prettyDate(lease.endDate)} · unit ${lease.unit.unitNo} is now Vacant` }, tx);
      });
      const managers = await this.notify.managersOf(lease.unit.property.companyId, lease.unit.propertyId);
      await this.notify.toUsers(managers, {
        type: 'LEASE_EXPIRED',
        title: `Lease expired · unit ${lease.unit.unitNo}`,
        message: `${lease.tenant.fullName}'s lease at ${lease.unit.property.name} ended. The unit is now vacant.`,
        link: `/units/${lease.unitId}`,
        dedupeKey: `expired:${lease.id}`,
      });
    }
    return ended.length;
  }
}

@Controller('leases')
export class LeasesController {
  constructor(private readonly leases: LeasesService) {}

  @Can('leases:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.leases.list(u, q);
  }

  @Can('leases:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.leases.get(u, id);
  }

  @Can('leases:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.leases.create(u, body);
  }

  @Can('leases:write')
  @Post(':id/activate')
  activate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.leases.activate(u, id);
  }

  @Can('leases:write')
  @Post(':id/terminate')
  terminate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leases.terminate(u, id, body);
  }

  @Can('leases:write')
  @Post(':id/renew')
  renew(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.leases.renew(u, id, body);
  }
}
