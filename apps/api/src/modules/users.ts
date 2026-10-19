import { Body, Controller, Get, Injectable, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { parse } from '../common/validation';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth';

const staffRoles = ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'STAFF', 'OWNER'] as const;

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(staffRoles),
  propertyIds: z.array(z.string().uuid()).default([]),
  ownerId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(staffRoles).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  propertyIds: z.array(z.string().uuid()).optional(),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly activity: ActivityService,
  ) {}

  list(u: AuthUser) {
    return this.prisma.user
      .findMany({
        where: { companyId: u.companyId, deletedAt: null, role: { not: 'TENANT' } },
        include: { propertyAccess: { include: { property: { select: { id: true, name: true } } } }, owner: { select: { id: true, name: true } } },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
      .then((users) =>
        users.map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          phone: x.phone,
          role: x.role,
          status: x.status,
          lastLoginAt: x.lastLoginAt,
          owner: x.owner,
          properties: x.propertyAccess.map((a) => a.property),
        })),
      );
  }

  /** Users that maintenance tickets can be assigned to. */
  assignees(u: AuthUser) {
    return this.prisma.user.findMany({
      where: { companyId: u.companyId, deletedAt: null, status: 'ACTIVE', role: { in: ['STAFF', 'MANAGER'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(createSchema, body);
    if (data.role === 'OWNER') {
      if (!data.ownerId) throw new BusinessError('OWNER_REQUIRED', 'Pick the owner profile this login belongs to.', 400);
      const owner = await this.prisma.owner.findFirst({ where: { id: data.ownerId, companyId: u.companyId, deletedAt: null }, include: { user: true } });
      if (!owner) throw new NotFound('Owner');
      if (owner.user) throw new BusinessError('OWNER_HAS_LOGIN', 'This owner already has a login.');
    }
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new BusinessError('EMAIL_TAKEN', 'A user with this email already exists.');

    const user = await this.prisma.user.create({
      data: {
        companyId: u.companyId,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        role: data.role,
        status: 'INVITED',
        ownerId: data.role === 'OWNER' ? data.ownerId : null,
        propertyAccess: ['MANAGER', 'FINANCE', 'STAFF'].includes(data.role)
          ? { create: data.propertyIds.map((propertyId) => ({ propertyId })) }
          : undefined,
      },
    });
    const invite = await this.auth.sendInvite(user);
    await this.activity.log(u, u.companyId, { entityType: 'USER', entityId: user.id, action: 'create', summary: `Invited ${user.name} as ${user.role}` });
    return { id: user.id, ...invite };
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const data = parse(updateSchema, body);
    const user = await this.prisma.user.findFirst({ where: { id, companyId: u.companyId, deletedAt: null } });
    if (!user) throw new NotFound('User');
    if (user.id === u.id && (data.status === 'DISABLED' || (data.role && data.role !== user.role))) {
      throw new BusinessError('SELF_CHANGE', 'You cannot disable yourself or change your own role.', 400);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { name: data.name, phone: data.phone, role: data.role, status: user.status === 'INVITED' && data.status === 'ACTIVE' ? undefined : data.status },
      });
      if (data.propertyIds) {
        await tx.userPropertyAccess.deleteMany({ where: { userId: id } });
        await tx.userPropertyAccess.createMany({ data: data.propertyIds.map((propertyId) => ({ userId: id, propertyId })) });
      }
      if (data.status === 'DISABLED') await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.activity.log(u, u.companyId, { entityType: 'USER', entityId: id, action: 'update', summary: `Updated user ${user.name}`, newValues: data });
    return { ok: true };
  }

  async resendInvite(u: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, companyId: u.companyId, deletedAt: null } });
    if (!user) throw new NotFound('User');
    if (user.status !== 'INVITED') throw new BusinessError('ALREADY_ACTIVE', 'This user has already set a password.');
    return { ok: true, ...(await this.auth.sendInvite(user)) };
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Can('users:manage')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.users.list(u);
  }

  @Can('maintenance:assign')
  @Get('assignees')
  assignees(@CurrentUser() u: AuthUser) {
    return this.users.assignees(u);
  }

  @Can('users:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.users.create(u, body);
  }

  @Can('users:manage')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.users.update(u, id, body);
  }

  @Can('users:manage')
  @Post(':id/resend-invite')
  resend(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.users.resendInvite(u, id);
  }
}
