import { Body, Controller, Get, Injectable, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { daysBetween, isoDate, num, today } from '../common/util';
import { parse, zPhone } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { CATEGORIES, MaintenanceService } from './maintenance';

const requestSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3, 'Give the problem a short title').max(120).optional(),
  description: z.string().trim().min(5, 'Describe the problem in a few words').max(2000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

const profileSchema = z.object({
  altPhone: zPhone.optional().nullable().or(z.literal('')).transform((v) => v || null),
  emergencyName: z.string().trim().max(100).optional().nullable(),
  emergencyPhone: zPhone.optional().nullable().or(z.literal('')).transform((v) => v || null),
});

/** Tenant portal (Phase 1, confirmed). Every query is pinned to the signed-in tenant (FR-TP-6). */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  private async tenantOf(u: AuthUser) {
    if (!u.tenantId) throw new NotFound('Tenant profile');
    const tenant = await this.prisma.tenant.findFirst({ where: { id: u.tenantId, deletedAt: null } });
    if (!tenant) throw new NotFound('Tenant profile');
    return tenant;
  }

  async me(u: AuthUser) {
    const tenant = await this.tenantOf(u);
    const lease = await this.prisma.lease.findFirst({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      include: { unit: { include: { property: { select: { name: true, addressLine1: true, city: true } } } } },
    });
    const entries = await this.prisma.rentEntry.findMany({ where: { tenantId: tenant.id }, orderBy: { period: 'desc' }, take: 1 });
    const dues = await this.prisma.rentEntry.aggregate({ where: { tenantId: tenant.id, status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true } });
    const lastRequest = await this.prisma.maintenanceRequest.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    const latest = entries[0];
    return {
      tenant: {
        id: tenant.id,
        fullName: tenant.fullName,
        phone: tenant.phone,
        altPhone: tenant.altPhone,
        email: tenant.email,
        emergencyName: tenant.emergencyName,
        emergencyPhone: tenant.emergencyPhone,
      },
      lease: lease
        ? {
            unitNo: lease.unit.unitNo,
            unitType: lease.unit.unitType,
            property: lease.unit.property.name,
            address: `${lease.unit.property.addressLine1}, ${lease.unit.property.city}`,
            startDate: isoDate(lease.startDate),
            endDate: isoDate(lease.endDate),
            daysLeft: daysBetween(today(), lease.endDate),
            totalDays: daysBetween(lease.startDate, lease.endDate),
            monthlyRent: num(lease.monthlyRent),
            securityDeposit: num(lease.securityDeposit),
            dueDay: lease.dueDay,
          }
        : null,
      latestRent: latest ? { period: latest.period, amount: num(latest.amount), status: latest.status, dueDate: isoDate(latest.dueDate), paidOn: isoDate(latest.paidOn), mode: latest.mode } : null,
      dues: num(dues._sum.amount),
      lastRequest: lastRequest ? { ticketNo: lastRequest.ticketNo, title: lastRequest.title, status: lastRequest.status, createdAt: lastRequest.createdAt } : null,
    };
  }

  async rent(u: AuthUser) {
    const tenant = await this.tenantOf(u);
    const rows = await this.prisma.rentEntry.findMany({ where: { tenantId: tenant.id }, orderBy: { period: 'desc' }, take: 24, include: { unit: { select: { unitNo: true } } } });
    return rows.map((r) => ({ id: r.id, period: r.period, unitNo: r.unit.unitNo, amount: num(r.amount), status: r.status, dueDate: isoDate(r.dueDate), paidOn: isoDate(r.paidOn), mode: r.mode }));
  }

  async requests(u: AuthUser) {
    const tenant = await this.tenantOf(u);
    const rows = await this.prisma.maintenanceRequest.findMany({
      where: { tenantId: tenant.id },
      include: { comments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      ticketNo: r.ticketNo,
      title: r.title,
      category: r.category,
      priority: r.priority,
      status: r.status,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      lastUpdate: r.comments[0]?.comment ?? null,
    }));
  }

  async createRequest(u: AuthUser, body: unknown) {
    const data = parse(requestSchema, body);
    const tenant = await this.tenantOf(u);
    const lease = await this.prisma.lease.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE' }, include: { unit: true } });
    if (!lease) throw new BusinessError('NO_ACTIVE_LEASE', 'You need an active lease to raise a request. Please contact your manager.', 400);
    const title = data.title || `${data.category}: ${data.description.slice(0, 60)}${data.description.length > 60 ? '…' : ''}`;
    return this.maintenance.createTicket(u, {
      propertyId: lease.unit.propertyId,
      unitId: lease.unitId,
      tenantId: tenant.id,
      category: data.category,
      title,
      description: data.description,
      priority: data.priority,
      assignedToId: null,
      vendorName: null,
      estimatedCost: null,
    });
  }

  async updateProfile(u: AuthUser, body: unknown) {
    const data = parse(profileSchema, body);
    const tenant = await this.tenantOf(u);
    await this.prisma.tenant.update({ where: { id: tenant.id }, data });
    return this.me(u);
  }
}

@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Can('portal')
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.portal.me(u);
  }

  @Can('portal')
  @Get('rent')
  rent(@CurrentUser() u: AuthUser) {
    return this.portal.rent(u);
  }

  @Can('portal')
  @Get('requests')
  requests(@CurrentUser() u: AuthUser) {
    return this.portal.requests(u);
  }

  @Can('portal')
  @Post('requests')
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.portal.createRequest(u, body);
  }

  @Can('portal')
  @Patch('profile')
  profile(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.portal.updateProfile(u, body);
  }
}
