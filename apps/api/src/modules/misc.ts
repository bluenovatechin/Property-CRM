import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { AnyRole, AuthUser, Can, CurrentUser } from '../common/auth';
import { ActivityService } from '../common/activity.service';
import { ScopeService } from '../common/scope.service';
import { PrismaService } from '../prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @AnyRole()
  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId: u.id, status: 'UNREAD' } }),
    ]);
    return { unread, items };
  }

  @AnyRole()
  @Patch(':id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: u.id }, data: { status: 'READ' } });
    return { ok: true };
  }

  @AnyRole()
  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: u.id, status: 'UNREAD' }, data: { status: 'READ' } });
    return { ok: true };
  }
}

@Controller('search')
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** Global search bar: tenant name or mobile, unit number, property name or code (FR-SRCH-1). */
  @Can('search:use')
  @Get()
  async search(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    const term = q.trim();
    if (term.length < 2) return { tenants: [], units: [], properties: [] };
    const [tenants, units, properties] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { AND: [this.scope.tenantWhere(u), { OR: [{ fullName: { contains: term, mode: 'insensitive' } }, { phone: { contains: term } }] }] },
        select: { id: true, fullName: true, phone: true, status: true },
        take: 6,
      }),
      this.prisma.unit.findMany({
        where: { AND: [this.scope.unitWhere(u), { unitNo: { contains: term, mode: 'insensitive' } }] },
        select: { id: true, unitNo: true, status: true, property: { select: { name: true } } },
        take: 6,
      }),
      this.prisma.property.findMany({
        where: { AND: [this.scope.propertyWhere(u), { OR: [{ name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }] }] },
        select: { id: true, name: true, code: true },
        take: 5,
      }),
    ]);
    return { tenants, units, properties };
  }
}

/** Progress for the "Getting started" checklist on the dashboard (counts within the user's scope). */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  @Can('dashboard:read')
  @Get()
  async progress(@CurrentUser() u: AuthUser) {
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
    const ownerScope = u.role === 'OWNER' ? u.ownerId : null;
    const [owners, ownersWithLogin, properties, units, tenants, leases, rent, team] = await Promise.all([
      this.prisma.owner.count({ where: { companyId: u.companyId, deletedAt: null, ...(ownerScope ? { id: ownerScope } : {}) } }),
      this.prisma.owner.count({ where: { companyId: u.companyId, deletedAt: null, user: { isNot: null } } }),
      this.prisma.property.count({ where: this.scope.propertyWhere(u) }),
      this.prisma.unit.count({ where: this.scope.unitWhere(u) }),
      this.prisma.tenant.count({ where: this.scope.tenantWhere(u) }),
      this.prisma.lease.count({ where: { AND: [this.scope.leaseWhere(u), { status: 'ACTIVE' }] } }),
      this.prisma.rentEntry.count({ where: { period: month, lease: this.scope.leaseWhere(u) } }),
      this.prisma.user.count({
        where:
          u.role === 'OWNER'
            ? { teamOwnerId: u.ownerId ?? '__none__', deletedAt: null }
            : { companyId: u.companyId, deletedAt: null, role: { in: ['FINANCE', 'STAFF'] } },
      }),
    ]);
    return { owners, ownersWithLogin, properties, units, tenants, leases, rent, team };
  }
}

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  @Can('activity:read')
  @Get()
  async list(@CurrentUser() u: AuthUser, @Query() q: { entityType?: string; entityId?: string }) {
    if (q.entityType && q.entityId) {
      const rows = await this.activity.forEntities([{ type: q.entityType, id: q.entityId }], 50);
      return rows.filter((r) => r.companyId === u.companyId);
    }
    return this.prisma.activityLog.findMany({
      where: { companyId: u.companyId },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
