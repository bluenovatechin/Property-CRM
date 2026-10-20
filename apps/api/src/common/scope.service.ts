import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser, ownerScopeOf } from './auth';
import { NotFound } from './errors';

/**
 * Decides WHICH records a user may see:
 *  - Super Admin, Manager: the whole company (the manager looks after all owners)
 *  - Owner: their own properties
 *  - Owner's finance / staff: that owner's properties (+ any property the company assigned to them)
 *  - Tenant: only through /portal endpoints
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  propertyWhere(u: AuthUser): Prisma.PropertyWhereInput {
    const base: Prisma.PropertyWhereInput = { companyId: u.companyId, deletedAt: null };
    switch (u.role) {
      case 'SUPER_ADMIN':
      case 'MANAGER':
        return base;
      case 'OWNER':
        return { ...base, ownerId: u.ownerId ?? '__none__' };
      case 'FINANCE':
      case 'STAFF': {
        const or: Prisma.PropertyWhereInput[] = [{ id: { in: u.propertyIds } }];
        if (u.teamOwnerId) or.push({ ownerId: u.teamOwnerId });
        return { ...base, OR: or };
      }
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
    if (u.role === 'SUPER_ADMIN' || u.role === 'MANAGER') return base;
    const ownerId = ownerScopeOf(u);
    if (u.role === 'OWNER' || u.role === 'FINANCE') {
      const or: Prisma.TenantWhereInput[] = [{ leases: { some: { unit: { propertyId: { in: u.propertyIds } } } } }];
      if (ownerId) or.push({ ownerId }, { leases: { some: { unit: { property: { ownerId } } } } });
      return { ...base, OR: or };
    }
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
