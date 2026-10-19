import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { currentPeriod, mask, num } from '../common/util';
import { parse, zOptText, zPhone } from '../common/validation';
import { PrismaService } from '../prisma.service';

const ownerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the owner name'),
  phone: zPhone,
  email: z.string().trim().email('Enter a valid email').optional().nullable().or(z.literal('')).transform((v) => v || null),
  address: zOptText,
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN looks like ABCDE1234F').optional().nullable().or(z.literal('')).transform((v) => v || null),
  bankAccount: zOptText,
  ifsc: zOptText,
  notes: zOptText,
});

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private where(u: AuthUser): Prisma.OwnerWhereInput {
    const base: Prisma.OwnerWhereInput = { companyId: u.companyId, deletedAt: null };
    if (u.role === 'OWNER') return { ...base, id: u.ownerId ?? '__none__' };
    if (u.role === 'SUPER_ADMIN') return base;
    // Managers and finance see owners of their properties, plus owners with no property yet.
    return { ...base, OR: [{ properties: { none: {} } }, { properties: { some: { id: { in: u.propertyIds } } } }] };
  }

  private canSeeBank(u: AuthUser) {
    return u.role === 'SUPER_ADMIN' || u.role === 'OWNER';
  }

  async list(u: AuthUser) {
    const period = currentPeriod();
    const owners = await this.prisma.owner.findMany({
      where: this.where(u),
      include: { properties: { where: { deletedAt: null }, select: { id: true, name: true } }, user: { select: { id: true, status: true } } },
      orderBy: { name: 'asc' },
    });
    const paid = await this.prisma.rentEntry.groupBy({
      by: ['unitId'],
      where: { period, status: 'PAID', unit: { property: { ownerId: { in: owners.map((o) => o.id) } } } },
      _sum: { amount: true },
    });
    const unitOwners = await this.prisma.unit.findMany({ where: { id: { in: paid.map((p) => p.unitId) } }, select: { id: true, property: { select: { ownerId: true } } } });
    const ownerOfUnit = new Map(unitOwners.map((x) => [x.id, x.property.ownerId]));
    const collected = new Map<string, number>();
    for (const p of paid) {
      const ownerId = ownerOfUnit.get(p.unitId)!;
      collected.set(ownerId, (collected.get(ownerId) ?? 0) + num(p._sum.amount));
    }
    return owners.map((o) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      properties: o.properties,
      hasLogin: !!o.user,
      collectedThisMonth: collected.get(o.id) ?? 0,
    }));
  }

  async get(u: AuthUser, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { AND: [this.where(u), { id }] }, include: { properties: { where: { deletedAt: null } } } });
    if (!owner) throw new NotFound('Owner');
    return { ...owner, bankAccount: this.canSeeBank(u) ? owner.bankAccount : mask(owner.bankAccount), pan: this.canSeeBank(u) ? owner.pan : mask(owner.pan) };
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(ownerSchema, body);
    const owner = await this.prisma.owner.create({ data: { ...data, companyId: u.companyId } });
    await this.activity.log(u, u.companyId, { entityType: 'OWNER', entityId: owner.id, action: 'create', summary: `Added owner ${owner.name}` });
    return owner;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const before = await this.get(u, id);
    const data = parse(ownerSchema.partial(), body);
    const owner = await this.prisma.owner.update({ where: { id }, data });
    await this.activity.log(u, u.companyId, { entityType: 'OWNER', entityId: id, action: 'update', summary: `Updated owner ${before.name}`, newValues: data });
    return owner;
  }

  async remove(u: AuthUser, id: string) {
    const owner = await this.get(u, id);
    if (owner.properties.length) throw new BusinessError('HAS_PROPERTIES', 'Move or archive this owner’s properties first.');
    await this.prisma.owner.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(u, u.companyId, { entityType: 'OWNER', entityId: id, action: 'delete', summary: `Archived owner ${owner.name}` });
    return { ok: true };
  }
}

@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Can('owners:read')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.owners.list(u);
  }

  @Can('owners:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.owners.get(u, id);
  }

  @Can('owners:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.owners.create(u, body);
  }

  @Can('owners:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.update(u, id, body);
  }

  @Can('owners:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.owners.remove(u, id);
  }
}
