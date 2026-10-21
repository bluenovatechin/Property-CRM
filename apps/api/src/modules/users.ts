import { Body, Controller, Get, Injectable, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { parse } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth';

/**
 * People & access — who can invite whom:
 *   Super Admin → anyone
 *   Manager     → owners, and staff / finance (for an owner, or for chosen properties)
 *   Owner       → their own staff and finance person (they see only that owner's properties)
 * Tenants are invited from the tenant's page, not here.
 */
const CAN_INVITE: Record<string, Role[]> = {
  SUPER_ADMIN: ['MANAGER', 'OWNER', 'FINANCE', 'STAFF', 'SUPER_ADMIN'],
  MANAGER: ['OWNER', 'FINANCE', 'STAFF'],
  OWNER: ['FINANCE', 'STAFF'],
};

const roleEnum = z.enum(['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'STAFF', 'OWNER']);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().optional().nullable(),
  role: roleEnum,
  /** Staff / finance: the owner they work for. */
  teamOwnerId: z.string().uuid().optional().nullable(),
  /** Staff / finance working for the company: properties they may access. */
  propertyIds: z.array(z.string().uuid()).default([]),
  /** Owner login for an existing owner profile (otherwise a new owner profile is created). */
  ownerId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional().nullable(),
  role: roleEnum.optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  teamOwnerId: z.string().uuid().nullable().optional(),
  propertyIds: z.array(z.string().uuid()).optional(),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly activity: ActivityService,
  ) {}

  /** The people this user may see and manage. */
  private visible(u: AuthUser): Prisma.UserWhereInput {
    const base: Prisma.UserWhereInput = { companyId: u.companyId, deletedAt: null, role: { not: 'TENANT' } };
    if (u.role === 'SUPER_ADMIN') return base;
    if (u.role === 'MANAGER') return { ...base, OR: [{ role: { in: ['OWNER', 'FINANCE', 'STAFF'] } }, { id: u.id }] };
    if (u.role === 'OWNER') return { ...base, teamOwnerId: u.ownerId ?? '__none__' };
    return { id: '__none__' };
  }

  private allowed(u: AuthUser, role: Role) {
    if (!(CAN_INVITE[u.role] ?? []).includes(role)) {
      const names: Record<string, string> = { SUPER_ADMIN: 'a super admin', MANAGER: 'a manager', OWNER: 'an owner', FINANCE: 'a finance person', STAFF: 'staff' };
      throw new BusinessError('FORBIDDEN', `You cannot add ${names[role] ?? 'this role'}.`, 403);
    }
  }

  async list(u: AuthUser) {
    const users = await this.prisma.user.findMany({
      where: this.visible(u),
      include: {
        propertyAccess: { include: { property: { select: { id: true, name: true } } } },
        owner: { select: { id: true, name: true } },
        teamOwner: { select: { id: true, name: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return {
      canInvite: CAN_INVITE[u.role] ?? [],
      users: users.map((x) => ({
        id: x.id,
        name: x.name,
        email: x.email,
        phone: x.phone,
        role: x.role,
        status: x.status,
        lastLoginAt: x.lastLoginAt,
        owner: x.owner,
        teamOwner: x.teamOwner,
        properties: x.propertyAccess.map((a) => a.property),
      })),
    };
  }

  /** People a maintenance ticket can be assigned to. */
  assignees(u: AuthUser) {
    const where: Prisma.UserWhereInput =
      u.role === 'OWNER'
        ? { companyId: u.companyId, deletedAt: null, status: 'ACTIVE', role: 'STAFF', teamOwnerId: u.ownerId ?? '__none__' }
        : { companyId: u.companyId, deletedAt: null, status: 'ACTIVE', role: { in: ['STAFF', 'MANAGER'] } };
    return this.prisma.user.findMany({ where, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(createSchema, body);
    this.allowed(u, data.role);
    if (await this.prisma.user.findUnique({ where: { email: data.email } })) {
      throw new BusinessError('EMAIL_TAKEN', 'Someone already uses this email to sign in.');
    }

    let ownerId: string | null = null;
    let teamOwnerId: string | null = null;
    if (data.role === 'OWNER') {
      if (data.ownerId) {
        const owner = await this.prisma.owner.findFirst({ where: { id: data.ownerId, companyId: u.companyId, deletedAt: null }, include: { user: true } });
        if (!owner) throw new NotFound('Owner');
        if (owner.user) throw new BusinessError('OWNER_HAS_LOGIN', 'This owner already has a login.');
        ownerId = owner.id;
      } else {
        // New owner: create their owner profile at the same time.
        if (!data.phone?.trim()) {
          throw new BusinessError('VALIDATION', 'Enter the owner’s mobile number.', 400);
        }
        const owner = await this.prisma.owner.create({ data: { companyId: u.companyId, name: data.name, phone: data.phone, email: data.email } });
        ownerId = owner.id;
      }
    }
    if (data.role === 'FINANCE' || data.role === 'STAFF') {
      teamOwnerId = u.role === 'OWNER' ? u.ownerId : data.teamOwnerId ?? null;
      if (teamOwnerId && !(await this.prisma.owner.findFirst({ where: { id: teamOwnerId, companyId: u.companyId, deletedAt: null } }))) throw new NotFound('Owner');
    }

    const user = await this.prisma.user.create({
      data: {
        companyId: u.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        role: data.role,
        status: 'INVITED',
        ownerId,
        teamOwnerId,
        propertyAccess:
          u.role !== 'OWNER' && (data.role === 'FINANCE' || data.role === 'STAFF') && data.propertyIds.length
            ? { create: data.propertyIds.map((propertyId) => ({ propertyId })) }
            : undefined,
      },
    });
    const invite = await this.auth.sendInvite(user);
    await this.activity.log(u, u.companyId, { entityType: 'USER', entityId: user.id, action: 'create', summary: `Invited ${user.name} as ${user.role}` });
    return { id: user.id, ...invite };
  }

  private async assertVisible(u: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({ where: { AND: [this.visible(u), { id }] } });
    if (!user) throw new NotFound('Person');
    return user;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const data = parse(updateSchema, body);
    const user = await this.assertVisible(u, id);
    if (user.id === u.id && (data.status === 'DISABLED' || (data.role && data.role !== user.role))) {
      throw new BusinessError('SELF_CHANGE', 'You cannot disable yourself or change your own role.', 400);
    }
    if (user.id !== u.id) this.allowed(u, user.role);
    if (data.role && data.role !== user.role) {
      this.allowed(u, data.role);
      if (data.role === 'OWNER' || user.role === 'OWNER') throw new BusinessError('ROLE_CHANGE', 'Owner logins are linked to an owner profile and cannot change role.', 400);
    }
    const teamOwnerId = u.role === 'OWNER' ? undefined : data.teamOwnerId;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: data.name,
          phone: data.phone,
          role: data.role,
          teamOwnerId,
          status: user.status === 'INVITED' && data.status === 'ACTIVE' ? undefined : data.status,
        },
      });
      if (data.propertyIds && u.role !== 'OWNER') {
        await tx.userPropertyAccess.deleteMany({ where: { userId: id } });
        await tx.userPropertyAccess.createMany({ data: data.propertyIds.map((propertyId) => ({ userId: id, propertyId })) });
      }
      if (data.status === 'DISABLED') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.activity.log(u, u.companyId, { entityType: 'USER', entityId: id, action: 'update', summary: `Updated ${user.name}`, newValues: data });
    return { ok: true, user: { id, role: data.role ?? user.role, status: data.status ?? user.status } };
  }

  async resendInvite(u: AuthUser, id: string) {
    const user = await this.assertVisible(u, id);
    if (user.status !== 'INVITED') throw new BusinessError('ALREADY_ACTIVE', 'This person has already set a password.');
    return { ok: true, ...(await this.auth.sendInvite(user)) };
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Can('team:manage')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.users.list(u);
  }

  @Can('maintenance:assign')
  @Get('assignees')
  assignees(@CurrentUser() u: AuthUser) {
    return this.users.assignees(u);
  }

  @Can('team:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.users.create(u, body);
  }

  @Can('team:manage')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.users.update(u, id, body);
  }

  @Can('team:manage')
  @Post(':id/resend-invite')
  resend(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.users.resendInvite(u, id);
  }
}
