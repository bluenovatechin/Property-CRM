import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { AuthUser } from './auth';

export interface ActivityInput {
  entityType: 'PROPERTY' | 'UNIT' | 'TENANT' | 'OWNER' | 'LEASE' | 'RENT' | 'TICKET' | 'EXPENSE' | 'USER' | 'AUTH';
  entityId: string;
  action: string;
  summary: string;
  oldValues?: unknown;
  newValues?: unknown;
}

/** Append-only audit trail (SRS FR-LOG-1). Never throws: a logging failure must not break the request. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger('Activity');

  constructor(private readonly prisma: PrismaService) {}

  async log(user: Pick<AuthUser, 'id' | 'companyId'> | null, companyId: string, input: ActivityInput, tx?: Prisma.TransactionClient) {
    try {
      await (tx ?? this.prisma).activityLog.create({
        data: {
          companyId,
          userId: user?.id ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          summary: input.summary,
          oldValues: (input.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
          newValues: (input.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Could not write activity log: ${(e as Error).message}`);
    }
  }

  forEntities(entities: { type: string; id: string }[], take = 30) {
    if (!entities.length) return Promise.resolve([]);
    return this.prisma.activityLog.findMany({
      where: { OR: entities.map((e) => ({ entityType: e.type, entityId: e.id })) },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
