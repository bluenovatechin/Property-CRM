import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { PERMS, Permission } from './permissions';

export interface AuthUser {
  id: string;
  companyId: string;
  role: Role;
  name: string;
  email: string;
  ownerId: string | null;
  tenantId: string | null;
  /** Properties a MANAGER / FINANCE / STAFF user is assigned to. */
  propertyIds: string[];
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** Route needs no login. */
export const Public = () => SetMetadata('isPublic', true);
/** Route is open to every signed-in role, tenants included. */
export const AnyRole = () => SetMetadata('anyRole', true);
/** Route requires a permission from PERMS. */
export const Can = (permission: Permission) => SetMetadata('permission', permission);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException({ code: 'NOT_SIGNED_IN', message: 'Please sign in.' });

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: config.jwtAccessSecret });
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', message: 'Your session has expired.' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { propertyAccess: { select: { propertyId: true } } },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ code: 'NOT_SIGNED_IN', message: 'Please sign in.' });
    }

    req.user = {
      id: user.id,
      companyId: user.companyId,
      role: user.role,
      name: user.name,
      email: user.email,
      ownerId: user.ownerId,
      tenantId: user.tenantId,
      propertyIds: user.propertyAccess.map((a) => a.propertyId),
    };

    const permission = this.reflector.getAllAndOverride<Permission | undefined>('permission', targets);
    const anyRole = this.reflector.getAllAndOverride<boolean>('anyRole', targets);
    if (permission) {
      if (!(PERMS[permission] as Role[]).includes(user.role)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have access to this.' });
      }
    } else if (!anyRole) {
      // Every route must declare @Can or @AnyRole; anything else is closed to tenants by default.
      if (user.role === 'TENANT') throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have access to this.' });
    }
    return true;
  }
}
