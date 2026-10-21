import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser, ownerScopeOf } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { currentPeriod, mask, num } from '../common/util';
import { parse, zOptText, zPhone } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth';

const ownerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the owner name'),
  phone: zPhone,
  email: z.string().trim().email('Enter a valid email').optional().nullable().or(z.literal('')).transform((v) => v || null),
  address: zOptText,
  pan: zOptText,
  bankAccount: zOptText,
  ifsc: zOptText,
  notes: zOptText,
});

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly auth: AuthService,
  ) {}

  private where(u: AuthUser): Prisma.OwnerWhereInput {
    const base: Prisma.OwnerWhereInput = { companyId: u.companyId, deletedAt: null };
    if (u.role === 'SUPER_ADMIN' || u.role === 'MANAGER') return base;
    // An owner sees themself; their finance/staff see the owner they work for.
    return { ...base, id: ownerScopeOf(u) ?? '__none__' };
  }

  private canSeeBank(u: AuthUser) {
    return u.role === 'SUPER_ADMIN' || u.role === 'OWNER';
  }

  async list(u: AuthUser) {
    const period = currentPeriod();
    const owners = await this.prisma.owner.findMany({
      where: this.where(u),
      include: { properties: { where: { deletedAt: null }, select: { id: true, name: true } }, user: { select: { id: true, status: true } }, _count: { select: { team: { where: { deletedAt: null } }, tenants: { where: { deletedAt: null } } } } },
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
      login: o.user?.status ?? null,
      teamCount: o._count.team,
      tenantCount: o._count.tenants,
      collectedThisMonth: collected.get(o.id) ?? 0,
    }));
  }

  async get(u: AuthUser, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { AND: [this.where(u), { id }] }, include: { properties: { where: { deletedAt: null } } } });
    if (!owner) throw new NotFound('Owner');
    return { ...owner, bankAccount: this.canSeeBank(u) ? owner.bankAccount : mask(owner.bankAccount), pan: this.canSeeBank(u) ? owner.pan : mask(owner.pan) };
  }

  /** Adds an owner. With `giveLogin`, also creates their login and sends the invite (one step for the manager). */
  async create(u: AuthUser, body: unknown) {
    const { giveLogin, ...rest } = (body ?? {}) as Record<string, unknown> & { giveLogin?: boolean };
    const data = parse(ownerSchema, rest);
    if (giveLogin) {
      if (!data.email) throw new BusinessError('EMAIL_REQUIRED', 'Add the owner’s email so they can get a login.', 400);
      if (await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })) {
        throw new BusinessError('EMAIL_TAKEN', 'Someone already uses this email to sign in.');
      }
    }
    const owner = await this.prisma.owner.create({ data: { ...data, companyId: u.companyId } });
    await this.activity.log(u, u.companyId, { entityType: 'OWNER', entityId: owner.id, action: 'create', summary: `Added owner ${owner.name}` });
    const invite = giveLogin ? await this.inviteOwner(u, owner.id) : {};
    return { ...owner, ...invite };
  }

  /** Creates (or re-sends) the owner's login invite. */
  async inviteOwner(u: AuthUser, id: string) {
    const owner = await this.prisma.owner.findFirst({ where: { AND: [this.where(u), { id }] }, include: { user: true } });
    if (!owner) throw new NotFound('Owner');
    if (!owner.email) throw new BusinessError('EMAIL_REQUIRED', 'Add the owner’s email first.', 400);
    if (owner.user?.status === 'ACTIVE') throw new BusinessError('ALREADY_ACTIVE', 'This owner already has a login.');
    let user = owner.user;
    if (!user) {
      if (await this.prisma.user.findUnique({ where: { email: owner.email.toLowerCase() } })) throw new BusinessError('EMAIL_TAKEN', 'Someone already uses this email to sign in.');
      user = await this.prisma.user.create({ data: { companyId: u.companyId, name: owner.name, email: owner.email.toLowerCase(), phone: owner.phone, role: 'OWNER', status: 'INVITED', ownerId: owner.id } });
    }
    const invite = await this.auth.sendInvite(user);
    await this.activity.log(u, u.companyId, { entityType: 'OWNER', entityId: owner.id, action: 'invite', summary: `Sent login invite to owner ${owner.name}` });
    return invite;
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
  @Post(':id/invite')
  invite(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.owners.inviteOwner(u, id);
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
