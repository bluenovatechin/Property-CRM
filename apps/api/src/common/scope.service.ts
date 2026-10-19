import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from './auth';
import { NotFound } from './errors';

/**
 * Decides WHICH records a user may see (SRS 2.2, "Scope of data"):
 *  - Super Admin: the whole company
 *  - Manager / Finance / Staff: properties they are assigned to
 *  - Owner: properties they own
 *  - Tenant: only through /portal endpoints
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  propertyWhere(u: AuthUser): Prisma.PropertyWhereInput {
    const base: Prisma.PropertyWhereInput = { companyId: u.companyId, deletedAt: null };
    switch (u.role) {
      case 'SUPER_ADMIN':
        return base;
      case 'OWNER':
        return { ...base, ownerId: u.ownerId ?? '__none__' };
      case 'MANAGER':
      case 'FINANCE':
      case 'STAFF':
        return { ...base, id: { in: u.propertyIds } };
      default:
        return { id: '__none__' };
    }
  }

  /** Optional single-property filter, validated against the user's scope. */
  propertyFilter(u: AuthUser, propertyId?: string | null): Prisma.PropertyWhereInput {
    const where = this.propertyWhere(u);
    return propertyId ? { AND: [where, { id: propertyId }] } : where;
  }

  async assertProperty(u: AuthUser, id: string) {
    const property = await this.prisma.property.findFirst({ where: { AND: [this.propertyWhere(u), { id }] } });
    if (!property) throw new NotFound('Property');
    return property;
  }

  unitWhere(u: AuthUser, propertyId?: string | null): Prisma.UnitWhereInput {
    return { deletedAt: null, property: this.propertyFilter(u, propertyId) };
  }

  async assertUnit(u: AuthUser, id: string) {
    const unit = await this.prisma.unit.findFirst({ where: { AND: [this.unitWhere(u), { id }] }, include: { property: true } });
    if (!unit) throw new NotFound('Unit');
    return unit;
  }

  tenantWhere(u: AuthUser): Prisma.TenantWhereInput {
    const base: Prisma.TenantWhereInput = { companyId: u.companyId, deletedAt: null };
    if (u.role === 'SUPER_ADMIN') return base;
    if (u.role === 'MANAGER' || u.role === 'FINANCE') {
      // Tenants without any lease yet stay visible so a manager can create their first lease.
      return { ...base, OR: [{ leases: { none: {} } }, { leases: { some: { unit: { propertyId: { in: u.propertyIds } } } } }] };
    }
    if (u.role === 'OWNER') return { ...base, leases: { some: { unit: { property: { ownerId: u.ownerId ?? '__none__' } } } } };
    return { id: '__none__' };
  }

  async assertTenant(u: AuthUser, id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { AND: [this.tenantWhere(u), { id }] } });
    if (!tenant) throw new NotFound('Tenant');
    return tenant;
  }

  leaseWhere(u: AuthUser, propertyId?: string | null): Prisma.LeaseWhereInput {
    return { unit: this.unitWhere(u, propertyId) };
  }

  async assertLease(u: AuthUser, id: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { AND: [this.leaseWhere(u), { id }] },
      include: { unit: { include: { property: true } }, tenant: true },
    });
    if (!lease) throw new NotFound('Lease');
    return lease;
  }

  ticketWhere(u: AuthUser, propertyId?: string | null): Prisma.MaintenanceRequestWhereInput {
    if (u.role === 'STAFF') return { assignedToId: u.id, ...(propertyId ? { propertyId } : {}) };
    return { property: this.propertyFilter(u, propertyId) };
  }

  /** Throws unless the user is a Super Admin or the given role-specific check passes. */
  ensure(condition: boolean, message = 'You do not have access to this.') {
    if (!condition) throw new ForbiddenException({ code: 'FORBIDDEN', message });
  }
}
