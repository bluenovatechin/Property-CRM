import { Controller, HttpCode, Injectable, Logger, OnApplicationBootstrap, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Can } from '../common/auth';
import { NotifyService } from '../common/notify.service';
import { addDays, daysBetween, formatINR, isoDate, num, periodLabel, today, prettyDate } from '../common/util';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { LeasesService } from './leases';
import { OPEN_STATUSES } from './maintenance';

const EXPIRY_THRESHOLDS = [60, 30, 7];

/**
 * Daily reminders and status updates (SRS 9.4 C), at 00:30 in the business timezone.
 * Each reminder has a dedupe key, so running twice never sends the same reminder twice.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly leases: LeasesService,
  ) {}

  async onApplicationBootstrap() {
    // Keep statuses correct if the server was off at 00:30.
    try {
      await this.markOverdue();
      await this.leases.expireEnded();
    } catch (e) {
      this.logger.warn(`Start-up check skipped: ${(e as Error).message}`);
    }
  }

  @Cron('30 0 * * *', { timeZone: config.tz })
  async runDaily() {
    const result = {
      overdue: await this.markOverdue(),
      dueReminders: await this.rentDueReminders(),
      expiryReminders: await this.leaseExpiryReminders(),
      expired: await this.leases.expireEnded(),
      slaAlerts: await this.slaAlerts(),
    };
    this.logger.log(`Daily jobs done: ${JSON.stringify(result)}`);
    return result;
  }

  /** Pending rent past its due date becomes Overdue; tenant and managers are told once. */
  async markOverdue(): Promise<number> {
    const late = await this.prisma.rentEntry.findMany({
      where: { status: 'PENDING', dueDate: { lt: today() } },
      include: { tenant: true, unit: { include: { property: true } } },
    });
    if (!late.length) return 0;
    await this.prisma.rentEntry.updateMany({ where: { id: { in: late.map((e) => e.id) } }, data: { status: 'OVERDUE' } });
    for (const e of late) {
      const amount = formatINR(num(e.amount));
      const managers = await this.notify.managersOf(e.unit.property.companyId, e.unit.propertyId);
      const sent = await this.notify.toUsers([...managers, ...(await this.notify.ownerUserOf(e.unit.propertyId))], {
        type: 'RENT_OVERDUE',
        title: `Rent overdue · Unit ${e.unit.unitNo}`,
        message: `${e.tenant.fullName} has not paid ${amount} for ${periodLabel(e.period)} (due ${prettyDate(e.dueDate)}).`,
        link: `/rent?period=${e.period}&status=OVERDUE`,
        dedupeKey: `overdue:${e.id}`,
      });
      if (sent) {
        await this.notify.emailTenant(e.tenant, {
          subject: `Rent overdue for ${periodLabel(e.period)}`,
          heading: 'Your rent is overdue',
          lines: [`Your rent of ${amount} for ${periodLabel(e.period)} (unit ${e.unit.unitNo}, ${e.unit.property.name}) was due on ${prettyDate(e.dueDate)}.`, 'Please pay as soon as possible, or contact your property manager if you already have.'],
        });
      }
    }
    return late.length;
  }

  /** Email the tenant 3 days before rent is due (brief §14 "Rent due"). */
  async rentDueReminders(): Promise<number> {
    const target = addDays(today(), 3);
    const due = await this.prisma.rentEntry.findMany({ where: { status: 'PENDING', dueDate: target }, include: { tenant: { include: { user: true } }, unit: { include: { property: true } } } });
    let count = 0;
    for (const e of due) {
      const recipients = e.tenant.user?.status === 'ACTIVE' ? [e.tenant.user.id] : [];
      const key = `due:${e.id}`;
      const already = await this.prisma.notification.findFirst({ where: { dedupeKey: { startsWith: key + '|' } } });
      if (already) continue;
      if (recipients.length) {
        await this.notify.toUsers(recipients, { type: 'RENT_DUE', title: `Rent due on ${prettyDate(e.dueDate)}`, message: `${formatINR(num(e.amount))} for ${periodLabel(e.period)}`, link: '/portal/rent', dedupeKey: key });
      } else {
        // No portal login: record the reminder against the managers so it is not sent again.
        const managers = await this.notify.managersOf(e.unit.property.companyId, e.unit.propertyId);
        await this.notify.toUsers(managers.slice(0, 1), { type: 'RENT_DUE_SENT', title: `Due-date reminder emailed · Unit ${e.unit.unitNo}`, message: `${e.tenant.fullName} · ${formatINR(num(e.amount))}`, dedupeKey: key });
      }
      await this.notify.emailTenant(e.tenant, {
        subject: `Rent reminder: ${periodLabel(e.period)}`,
        heading: 'Your rent is due soon',
        lines: [`${formatINR(num(e.amount))} for ${periodLabel(e.period)} (unit ${e.unit.unitNo}, ${e.unit.property.name}) is due on ${prettyDate(e.dueDate)}.`],
      });
      count++;
    }
    return count;
  }

  /** Lease ending in 60, 30 or 7 days: managers, the owner and the tenant are reminded. */
  async leaseExpiryReminders(): Promise<number> {
    const now = today();
    const leases = await this.prisma.lease.findMany({
      where: { status: 'ACTIVE', endDate: { gte: now, lte: addDays(now, Math.max(...EXPIRY_THRESHOLDS)) } },
      include: { tenant: true, unit: { include: { property: true } } },
    });
    let count = 0;
    for (const l of leases) {
      const left = daysBetween(now, l.endDate);
      const threshold = EXPIRY_THRESHOLDS.filter((t) => left <= t).sort((a, b) => a - b)[0];
      if (threshold === undefined) continue;
      const managers = await this.notify.managersOf(l.unit.property.companyId, l.unit.propertyId);
      const sent = await this.notify.toUsers([...managers, ...(await this.notify.ownerUserOf(l.unit.propertyId))], {
        type: 'LEASE_EXPIRING',
        title: `Lease ends in ${left} days · Unit ${l.unit.unitNo}`,
        message: `${l.tenant.fullName}'s lease at ${l.unit.property.name} ends on ${prettyDate(l.endDate)}. Start the renewal or plan the move-out.`,
        link: `/leases/${l.id}`,
        dedupeKey: `expiry:${l.id}:${threshold}`,
      });
      if (sent) {
        count++;
        await this.notify.emailTenant(l.tenant, {
          subject: `Your lease ends on ${prettyDate(l.endDate)}`,
          heading: `Your lease ends in ${left} days`,
          lines: [`Your lease for unit ${l.unit.unitNo}, ${l.unit.property.name} ends on ${prettyDate(l.endDate)}.`, 'Please contact your property manager if you would like to renew.'],
        });
      }
    }
    return count;
  }

  /** Open tickets past their SLA are flagged to the managers once. */
  async slaAlerts(): Promise<number> {
    const late = await this.prisma.maintenanceRequest.findMany({
      where: { status: { in: OPEN_STATUSES }, slaDueAt: { lt: new Date() } },
      include: { property: true, unit: true },
    });
    let count = 0;
    for (const t of late) {
      const managers = await this.notify.managersOf(t.property.companyId, t.propertyId);
      const sent = await this.notify.toUsers(managers, {
        type: 'TICKET_SLA',
        title: `SLA breached · ticket #${t.ticketNo}`,
        message: `${t.title}${t.unit ? ` · Unit ${t.unit.unitNo}` : ''}, ${t.property.name}`,
        link: `/maintenance?ticket=${t.id}`,
        dedupeKey: `sla:${t.id}`,
      });
      if (sent) count++;
    }
    return count;
  }
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Runs the daily jobs now (handy for demos and testing). */
  @Can('jobs:run')
  @Post('run')
  @HttpCode(200)
  run() {
    return this.jobs.runDaily();
  }
}
