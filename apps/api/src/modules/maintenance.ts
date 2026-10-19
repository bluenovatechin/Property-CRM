import { Body, Controller, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, Priority, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { NotifyService } from '../common/notify.service';
import { ScopeService } from '../common/scope.service';
import { formatINR, num, today } from '../common/util';
import { parse, zMoney, zOptText } from '../common/validation';
import { PrismaService } from '../prisma.service';

export const CATEGORIES = ['Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Cleaning', 'Appliance', 'Lift', 'Security', 'Other'] as const;

/** SLA target by priority (SRS FR-MNT-9). */
export const SLA_HOURS: Record<Priority, number> = { URGENT: 24, HIGH: 48, MEDIUM: 120, LOW: 240 };

/** Allowed status moves (SRS 5.5 state diagram). */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

export const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'REOPENED'];

const createSchema = z.object({
  propertyId: z.string().uuid('Choose a property'),
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3, 'Give the problem a short title').max(120),
  description: z.string().trim().min(3, 'Describe the problem').max(2000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedToId: z.string().uuid().optional().nullable(),
  vendorName: zOptText,
  estimatedCost: zMoney.optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(CATEGORIES),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  assignedToId: z.string().uuid().nullable(),
  vendorName: zOptText,
  estimatedCost: zMoney.nullable(),
  actualCost: zMoney.nullable(),
}).partial();

const statusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']),
  comment: z.string().trim().max(1000).optional(),
  actualCost: zMoney.optional().nullable(),
});

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
  ) {}

  private readonly include = {
    property: { select: { id: true, name: true, companyId: true } },
    unit: { select: { id: true, unitNo: true } },
    tenant: { select: { id: true, fullName: true, email: true, phone: true } },
    assignedTo: { select: { id: true, name: true } },
    raisedBy: { select: { id: true, name: true, role: true } },
  } satisfies Prisma.MaintenanceRequestInclude;

  private shape(t: Prisma.MaintenanceRequestGetPayload<{ include: MaintenanceService['include'] }>) {
    const open = OPEN_STATUSES.includes(t.status);
    return {
      id: t.id,
      ticketNo: t.ticketNo,
      title: t.title,
      description: t.description,
      category: t.category,
      priority: t.priority,
      status: t.status,
      property: { id: t.property.id, name: t.property.name },
      unit: t.unit,
      tenant: t.tenant ? { id: t.tenant.id, fullName: t.tenant.fullName } : null,
      assignedTo: t.assignedTo,
      vendorName: t.vendorName,
      estimatedCost: t.estimatedCost === null ? null : num(t.estimatedCost),
      actualCost: t.actualCost === null ? null : num(t.actualCost),
      slaDueAt: t.slaDueAt,
      slaBreached: open && t.slaDueAt < new Date(),
      raisedBy: t.raisedBy,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
    };
  }

  async list(u: AuthUser, q: { propertyId?: string; status?: string; priority?: string; category?: string; assignedToId?: string; unitId?: string }) {
    const where: Prisma.MaintenanceRequestWhereInput = {
      AND: [
        this.scope.ticketWhere(u, q.propertyId),
        q.status ? { status: { in: q.status.split(',') as TicketStatus[] } } : {},
        q.priority ? { priority: q.priority as Priority } : {},
        q.category ? { category: q.category } : {},
        q.unitId ? { unitId: q.unitId } : {},
        q.assignedToId === 'none' ? { assignedToId: null } : q.assignedToId ? { assignedToId: q.assignedToId } : {},
      ],
    };
    const tickets = await this.prisma.maintenanceRequest.findMany({ where, include: this.include, orderBy: [{ createdAt: 'desc' }], take: 500 });
    return tickets.map((t) => this.shape(t));
  }

  private async assertTicket(u: AuthUser, id: string) {
    const t = await this.prisma.maintenanceRequest.findFirst({ where: { AND: [this.scope.ticketWhere(u), { id }] }, include: this.include });
    if (!t) throw new NotFound('Ticket');
    return t;
  }

  async get(u: AuthUser, id: string) {
    const t = await this.assertTicket(u, id);
    const comments = await this.prisma.maintenanceComment.findMany({ where: { requestId: id }, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'asc' } });
    return {
      ...this.shape(t),
      allowedNext: TRANSITIONS[t.status],
      comments: comments.map((c) => ({ id: c.id, comment: c.comment, oldStatus: c.oldStatus, newStatus: c.newStatus, createdAt: c.createdAt, by: c.user.name, role: c.user.role })),
    };
  }

  /** Used by staff screens and by the tenant portal (raisedBy = tenant user). */
  async createTicket(
    u: Pick<AuthUser, 'id' | 'companyId' | 'role' | 'name'>,
    data: z.infer<typeof createSchema> & { tenantId?: string | null },
  ) {
    let tenantId = data.tenantId ?? null;
    if (data.unitId && !tenantId) {
      const lease = await this.prisma.lease.findFirst({ where: { unitId: data.unitId, status: 'ACTIVE' } });
      tenantId = lease?.tenantId ?? null;
    }
    if (data.assignedToId) {
      const assignee = await this.prisma.user.findFirst({ where: { id: data.assignedToId, companyId: u.companyId, role: { in: ['STAFF', 'MANAGER'] }, status: 'ACTIVE' } });
      if (!assignee) throw new NotFound('Assignee');
    }
    const t = await this.prisma.maintenanceRequest.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId ?? null,
        tenantId,
        category: data.category,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignedToId: data.assignedToId ?? null,
        vendorName: data.vendorName ?? null,
        estimatedCost: data.estimatedCost ?? null,
        slaDueAt: new Date(Date.now() + SLA_HOURS[data.priority] * 3_600_000),
        raisedById: u.id,
      },
      include: this.include,
    });
    await this.activity.log(u, u.companyId, { entityType: 'TICKET', entityId: t.id, action: 'create', summary: `Ticket #${t.ticketNo} raised: ${t.title}` });
    if (t.unitId) await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: t.unitId, action: 'ticket', summary: `Ticket #${t.ticketNo} raised: ${t.title} (${label(t.priority)})` });

    const recipients = [...(await this.notify.managersOf(u.companyId, t.propertyId)), ...(t.assignedToId ? [t.assignedToId] : [])].filter((id) => id !== u.id);
    await this.notify.toUsers(
      recipients,
      {
        type: 'TICKET_CREATED',
        title: `New ${label(t.priority)} ticket #${t.ticketNo}`,
        message: `${t.title} · ${t.unit ? `Unit ${t.unit.unitNo}, ` : ''}${t.property.name}`,
        link: `/maintenance?ticket=${t.id}`,
      },
      {
        subject: `New maintenance ticket #${t.ticketNo}: ${t.title}`,
        heading: `Ticket #${t.ticketNo} · ${label(t.priority)} priority`,
        lines: [`${t.title}`, `${t.unit ? `Unit ${t.unit.unitNo}, ` : ''}${t.property.name} · ${t.category}`, t.description],
      },
    );
    return this.shape(t);
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(createSchema, body);
    await this.scope.assertProperty(u, data.propertyId);
    if (data.unitId) {
      const unit = await this.scope.assertUnit(u, data.unitId);
      if (unit.propertyId !== data.propertyId) throw new BusinessError('UNIT_MISMATCH', 'That unit is not in the chosen property.', 400);
    }
    if (data.assignedToId && u.role === 'STAFF') data.assignedToId = u.id;
    return this.createTicket(u, data);
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const t = await this.assertTicket(u, id);
    const data = parse(updateSchema, body);
    if (u.role === 'STAFF' && (data.assignedToId !== undefined || data.priority !== undefined)) {
      throw new BusinessError('FORBIDDEN', 'Only a manager can change the assignee or priority.', 403);
    }
    if (data.assignedToId) {
      const assignee = await this.prisma.user.findFirst({ where: { id: data.assignedToId, companyId: u.companyId, role: { in: ['STAFF', 'MANAGER'] }, status: 'ACTIVE' } });
      if (!assignee) throw new NotFound('Assignee');
    }
    const updated = await this.prisma.maintenanceRequest.update({
      where: { id },
      data: { ...data, slaDueAt: data.priority && data.priority !== t.priority ? new Date(t.createdAt.getTime() + SLA_HOURS[data.priority] * 3_600_000) : undefined },
      include: this.include,
    });
    if (data.assignedToId && data.assignedToId !== t.assignedToId) {
      await this.prisma.maintenanceComment.create({ data: { requestId: id, userId: u.id, comment: `Assigned to ${updated.assignedTo?.name}` } });
      await this.notify.toUsers([data.assignedToId], {
        type: 'TICKET_ASSIGNED',
        title: `Ticket #${t.ticketNo} assigned to you`,
        message: `${t.title} · ${t.unit ? `Unit ${t.unit.unitNo}, ` : ''}${t.property.name}`,
        link: `/maintenance?ticket=${id}`,
      });
    }
    await this.activity.log(u, u.companyId, { entityType: 'TICKET', entityId: id, action: 'update', summary: `Ticket #${t.ticketNo} updated`, newValues: data });
    return this.shape(updated);
  }

  async changeStatus(u: AuthUser, id: string, body: unknown) {
    const t = await this.assertTicket(u, id);
    const data = parse(statusSchema, body);
    if (!TRANSITIONS[t.status].includes(data.status)) {
      throw new BusinessError('BAD_TRANSITION', `This ticket is ${label(t.status)} and cannot move to ${label(data.status)}.`);
    }
    if (u.role === 'STAFF' && data.status === 'CLOSED') throw new BusinessError('FORBIDDEN', 'A manager closes the ticket after checking the work.', 403);
    const actualCost = data.actualCost ?? (t.actualCost === null ? null : num(t.actualCost));

    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceRequest.update({
        where: { id },
        data: {
          status: data.status,
          actualCost: data.actualCost ?? undefined,
          resolvedAt: data.status === 'RESOLVED' ? new Date() : data.status === 'REOPENED' ? null : undefined,
          closedAt: data.status === 'CLOSED' ? new Date() : undefined,
        },
      });
      await tx.maintenanceComment.create({
        data: { requestId: id, userId: u.id, comment: data.comment || `Status changed to ${label(data.status)}`, oldStatus: t.status, newStatus: data.status },
      });
      // Closing a ticket with a cost books it as a maintenance expense (SRS FR-MNT-5).
      if (data.status === 'CLOSED' && actualCost && actualCost > 0) {
        await tx.expense.create({
          data: {
            propertyId: t.property.id,
            unitId: t.unit?.id ?? null,
            maintenanceRequestId: id,
            category: 'MAINTENANCE',
            amount: actualCost,
            expenseDate: today(),
            paidTo: t.vendorName || t.assignedTo?.name || null,
            notes: `Ticket #${t.ticketNo}: ${t.title}`,
            createdById: u.id,
          },
        });
      }
    });

    const costNote = data.status === 'CLOSED' && actualCost ? ` · ${formatINR(actualCost)} added to expenses` : '';
    await this.activity.log(u, u.companyId, { entityType: 'TICKET', entityId: id, action: 'status', summary: `Ticket #${t.ticketNo} → ${label(data.status)}${costNote}` });
    if (t.unit) await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: t.unit.id, action: 'ticket_status', summary: `Ticket #${t.ticketNo} ${label(data.status).toLowerCase()}${costNote}` });

    // Tell the tenant and the managers when work is resolved or closed (brief §14).
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      const managers = (await this.notify.managersOf(u.companyId, t.property.id)).filter((x) => x !== u.id);
      await this.notify.toUsers(managers, { type: 'TICKET_STATUS', title: `Ticket #${t.ticketNo} ${label(data.status).toLowerCase()}`, message: t.title, link: `/maintenance?ticket=${id}` });
      if (t.tenant) {
        const tenantUser = await this.prisma.user.findFirst({ where: { tenantId: t.tenant.id, status: 'ACTIVE' } });
        if (tenantUser) await this.notify.toUsers([tenantUser.id], { type: 'TICKET_STATUS', title: `Your request #${t.ticketNo} is ${label(data.status).toLowerCase()}`, message: t.title, link: '/portal/requests' });
        await this.notify.emailTenant(t.tenant, {
          subject: `Your maintenance request #${t.ticketNo} is ${label(data.status).toLowerCase()}`,
          heading: `Request #${t.ticketNo}: ${label(data.status)}`,
          lines: [t.title, data.comment || (data.status === 'RESOLVED' ? 'The work has been completed. Please let us know if the problem continues.' : 'This request is now closed.')],
        });
      }
    }
    return this.get(u, id);
  }

  async comment(u: AuthUser, id: string, body: unknown) {
    await this.assertTicket(u, id);
    const { comment } = parse(z.object({ comment: z.string().trim().min(1, 'Write an update').max(1000) }), body);
    await this.prisma.maintenanceComment.create({ data: { requestId: id, userId: u.id, comment } });
    return this.get(u, id);
  }
}

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Can('maintenance:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.maintenance.list(u, q);
  }

  @Can('maintenance:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.maintenance.get(u, id);
  }

  @Can('maintenance:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.maintenance.create(u, body);
  }

  @Can('maintenance:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.maintenance.update(u, id, body);
  }

  @Can('maintenance:write')
  @Post(':id/status')
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.maintenance.changeStatus(u, id, body);
  }

  @Can('maintenance:write')
  @Post(':id/comments')
  comment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.maintenance.comment(u, id, body);
  }
}
