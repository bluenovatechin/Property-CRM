import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { isoDate, mask, num } from '../common/util';
import { parse, zOptText, zPhone } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth';

const optionalEmail = z.string().trim().toLowerCase().email('Enter a valid email').optional().nullable().or(z.literal('')).transform((v) => v || null);
const optionalPhone = zPhone.optional().nullable().or(z.literal('')).transform((v) => v || null);

const tenantSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
  fullName: z.string().trim().min(2, 'Enter the full name'),
  phone: zPhone,
  altPhone: optionalPhone,
  email: optionalEmail,
  address: zOptText,
  idType: z.enum(['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID', 'GSTIN', 'OTHER']).optional().nullable(),
  idNumber: zOptText,
  emergencyName: zOptText,
  emergencyPhone: optionalPhone,
  notes: zOptText,
});

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly auth: AuthService,
  ) {}

  private canSeeId(u: AuthUser) {
    return u.role === 'SUPER_ADMIN' || u.role === 'MANAGER';
  }

  async list(u: AuthUser, q: { q?: string; status?: string; propertyId?: string }) {
    const where: Prisma.TenantWhereInput = {
      AND: [
        this.scope.tenantWhere(u),
        q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {},
        q.status ? { status: q.status as TenantStatus } : {},
        q.propertyId ? { leases: { some: { status: 'ACTIVE', unit: { propertyId: q.propertyId } } } } : {},
      ],
    };
    const tenants = await this.prisma.tenant.findMany({
      where,
      include: {
        leases: { where: { status: 'ACTIVE' }, take: 1, include: { unit: { select: { id: true, unitNo: true, property: { select: { id: true, name: true } } } } } },
        user: { select: { status: true } },
      },
      orderBy: { fullName: 'asc' },
      take: 500,
    });
    const dues = await this.prisma.rentEntry.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenants.map((t) => t.id) }, status: { in: ['PENDING', 'OVERDUE'] } },
      _sum: { amount: true },
    });
    const overdue = await this.prisma.rentEntry.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenants.map((t) => t.id) }, status: 'OVERDUE' },
      _sum: { amount: true },
    });
    const dueMap = new Map(dues.map((d) => [d.tenantId, num(d._sum.amount)]));
    const overdueMap = new Map(overdue.map((d) => [d.tenantId, num(d._sum.amount)]));
    return tenants.map((t) => {
      const lease = t.leases[0];
      return {
        id: t.id,
        fullName: t.fullName,
        type: t.type,
        phone: t.phone,
        email: t.email,
        status: t.status,
        portal: t.user?.status ?? null,
        unit: lease ? { id: lease.unit.id, unitNo: lease.unit.unitNo, property: lease.unit.property } : null,
        leaseEnd: lease ? isoDate(lease.endDate) : null,
        monthlyRent: lease ? num(lease.monthlyRent) : null,
        dues: dueMap.get(t.id) ?? 0,
        overdue: overdueMap.get(t.id) ?? 0,
      };
    });
  }

  async get(u: AuthUser, id: string) {
    await this.scope.assertTenant(u, id);
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id },
      include: {
        leases: { include: { unit: { select: { id: true, unitNo: true, unitType: true, property: { select: { id: true, name: true } } } } }, orderBy: { startDate: 'desc' } },
        rentEntries: { orderBy: { period: 'desc' }, take: 12, include: { unit: { select: { unitNo: true } } } },
        tickets: { orderBy: { createdAt: 'desc' }, take: 10 },
        user: { select: { status: true, lastLoginAt: true, email: true, createdAt: true } },
      },
    });
    const active = t.leases.find((l) => l.status === 'ACTIVE');
    const dues = t.rentEntries.filter((r) => r.status !== 'PAID').reduce((s, r) => s + num(r.amount), 0);
    return {
      id: t.id,
      type: t.type,
      fullName: t.fullName,
      phone: t.phone,
      altPhone: t.altPhone,
      email: t.email,
      address: t.address,
      idType: t.idType,
      idNumber: this.canSeeId(u) ? t.idNumber : mask(t.idNumber),
      emergencyName: t.emergencyName,
      emergencyPhone: t.emergencyPhone,
      status: t.status,
      notes: t.notes,
      createdAt: t.createdAt,
      dues,
      deposit: active ? num(active.securityDeposit) : 0,
      activeLease: active ? { id: active.id, unit: active.unit, startDate: isoDate(active.startDate), endDate: isoDate(active.endDate), monthlyRent: num(active.monthlyRent), dueDay: active.dueDay } : null,
      leases: t.leases.map((l) => ({
        id: l.id,
        status: l.status,
        unit: l.unit,
        startDate: isoDate(l.startDate),
        endDate: isoDate(l.endDate),
        monthlyRent: num(l.monthlyRent),
        securityDeposit: num(l.securityDeposit),
      })),
      rent: t.rentEntries.map((r) => ({ id: r.id, period: r.period, unitNo: r.unit.unitNo, amount: num(r.amount), status: r.status, dueDate: isoDate(r.dueDate), paidOn: isoDate(r.paidOn), mode: r.mode, reference: r.reference })),
      tickets: t.tickets.map((k) => ({ id: k.id, ticketNo: k.ticketNo, title: k.title, status: k.status, priority: k.priority, createdAt: k.createdAt })),
      portal: t.user,
    };
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(tenantSchema, body);
    const dup = await this.prisma.tenant.findFirst({ where: { companyId: u.companyId, phone: data.phone, deletedAt: null } });
    if (dup) throw new BusinessError('DUPLICATE_PHONE', `${dup.fullName} already uses this mobile number.`);
    const tenant = await this.prisma.tenant.create({ data: { ...data, companyId: u.companyId, status: 'INACTIVE' } });
    await this.activity.log(u, u.companyId, { entityType: 'TENANT', entityId: tenant.id, action: 'create', summary: `Added tenant ${tenant.fullName}` });
    return tenant;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const before = await this.scope.assertTenant(u, id);
    const data = parse(tenantSchema.partial(), body);
    if (data.phone && data.phone !== before.phone) {
      const dup = await this.prisma.tenant.findFirst({ where: { companyId: u.companyId, phone: data.phone, deletedAt: null, NOT: { id } } });
      if (dup) throw new BusinessError('DUPLICATE_PHONE', `${dup.fullName} already uses this mobile number.`);
    }
    const tenant = await this.prisma.tenant.update({ where: { id }, data });
    await this.activity.log(u, u.companyId, { entityType: 'TENANT', entityId: id, action: 'update', summary: `Updated tenant ${before.fullName}` });
    return tenant;
  }

  async remove(u: AuthUser, id: string) {
    const tenant = await this.scope.assertTenant(u, id);
    const active = await this.prisma.lease.count({ where: { tenantId: id, status: 'ACTIVE' } });
    if (active) throw new BusinessError('HAS_ACTIVE_LEASE', 'End this tenant’s lease before archiving them.');
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.user.updateMany({ where: { tenantId: id }, data: { status: 'DISABLED' } }),
    ]);
    await this.activity.log(u, u.companyId, { entityType: 'TENANT', entityId: id, action: 'delete', summary: `Archived tenant ${tenant.fullName}` });
    return { ok: true };
  }

  /** Creates (or re-sends) the tenant's portal login and emails the invite link. */
  async invite(u: Pick<AuthUser, 'id' | 'companyId'>, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, companyId: u.companyId, deletedAt: null }, include: { user: true } });
    if (!tenant) throw new NotFound('Tenant');
    if (!tenant.email) throw new BusinessError('EMAIL_REQUIRED', 'Add the tenant’s email address before sending a portal invite.', 400);
    if (tenant.user?.status === 'ACTIVE') throw new BusinessError('ALREADY_ACTIVE', 'This tenant already uses the portal.');

    let user = tenant.user;
    if (!user) {
      const taken = await this.prisma.user.findUnique({ where: { email: tenant.email } });
      if (taken) throw new BusinessError('EMAIL_TAKEN', 'Another login already uses this email address.');
      user = await this.prisma.user.create({
        data: { companyId: u.companyId, name: tenant.fullName, email: tenant.email, phone: tenant.phone, role: 'TENANT', status: 'INVITED', tenantId: tenant.id },
      });
    } else if (user.email !== tenant.email) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { email: tenant.email } });
    }
    const invite = await this.auth.sendInvite(user);
    await this.activity.log(u, u.companyId, { entityType: 'TENANT', entityId: tenant.id, action: 'portal_invite', summary: `Sent tenant portal invite to ${tenant.email}` });
    return { ok: true, ...invite };
  }
}

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Can('tenants:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.tenants.list(u, q);
  }

  @Can('tenants:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tenants.get(u, id);
  }

  @Can('tenants:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.tenants.create(u, body);
  }

  @Can('tenants:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.tenants.update(u, id, body);
  }

  @Can('tenants:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tenants.remove(u, id);
  }

  @Can('tenants:write')
  @Post(':id/invite')
  async invite(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.tenants.get(u, id);
    return this.tenants.invite(u, id);
  }
}
