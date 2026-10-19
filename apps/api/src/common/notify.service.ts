import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MailInput, MailService } from './mail.service';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string;
  /** Same key twice = second one is skipped (used by the daily reminder jobs). */
  dedupeKey?: string;
}

/** In-app notifications (bell icon) plus email, the confirmed first channel. */
@Injectable()
export class NotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Creates one in-app notification per user. Returns false if the dedupe key was already used. */
  async toUsers(userIds: string[], input: NotificationInput, email?: Omit<MailInput, 'to'>): Promise<boolean> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return false;
    if (input.dedupeKey) {
      const exists = await this.prisma.notification.findFirst({ where: { dedupeKey: { startsWith: input.dedupeKey + '|' } } });
      if (exists) return false;
    }
    for (const userId of ids) {
      try {
        await this.prisma.notification.create({
          data: {
            userId,
            type: input.type,
            title: input.title,
            message: input.message,
            link: input.link,
            dedupeKey: input.dedupeKey ? `${input.dedupeKey}|${userId}` : undefined,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    if (email) {
      const users = await this.prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { email: true } });
      for (const u of users) await this.mail.send({ ...email, to: u.email });
    }
    return true;
  }

  /** Super Admins of the company plus Managers assigned to the property. */
  async managersOf(companyId: string, propertyId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        OR: [{ role: 'SUPER_ADMIN' }, { role: 'MANAGER', propertyAccess: { some: { propertyId } } }],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async ownerUserOf(propertyId: string): Promise<string[]> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { owner: { select: { user: { select: { id: true, status: true } } } } } });
    const user = property?.owner.user;
    return user && user.status === 'ACTIVE' ? [user.id] : [];
  }

  /** Emails a tenant directly (tenants may not have a portal login yet). */
  async emailTenant(tenant: { email: string | null }, email: Omit<MailInput, 'to'>) {
    if (tenant.email) await this.mail.send({ ...email, to: tenant.email });
  }
}
