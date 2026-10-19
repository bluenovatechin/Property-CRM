import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, UnitStatus } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { BusinessError, NotFound } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { addDays, currentPeriod, daysBetween, isoDate, num, today } from '../common/util';
import { parse, zMoney, zOptText } from '../common/validation';
import { PrismaService } from '../prisma.service';

const OPEN_TICKET = ['OPEN', 'IN_PROGRESS', 'REOPENED'] as const;

const propertySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, 'Use 2–20 letters, numbers or dashes, e.g. SUN-RES'),
  name: z.string().trim().min(2, 'Enter the property name'),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'OFFICE', 'SHOP', 'WAREHOUSE', 'MIXED']),
  addressLine1: z.string().trim().min(3, 'Enter the address'),
  addressLine2: zOptText,
  area: zOptText,
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Enter the state'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code has 6 digits'),
  ownerId: z.string().uuid('Choose an owner'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE']).default('ACTIVE'),
  notes: zOptText,
});

const unitFields = {
  unitType: z.string().trim().min(1, 'Enter the unit type, e.g. 2BHK'),
  block: zOptText,
  areaSqft: z.coerce.number().int().positive().optional().nullable(),
  expectedRent: zMoney,
  securityDeposit: zMoney,
};

const unitSchema = z.object({
  unitNo: z.string().trim().min(1, 'Enter the unit number').max(20),
  floor: z.coerce.number().int().min(-5).max(200).optional().nullable(),
  status: z.enum(['VACANT', 'RESERVED', 'MAINTENANCE']).default('VACANT'),
  notes: zOptText,
  ...unitFields,
});

const bulkSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('floors'),
    floorFrom: z.coerce.number().int().min(0).max(200),
    floorTo: z.coerce.number().int().min(0).max(200),
    unitsPerFloor: z.coerce.number().int().min(1).max(99),
    ...unitFields,
  }),
  z.object({
    mode: z.literal('range'),
    prefix: z.string().trim().max(10).default(''),
    from: z.coerce.number().int().min(0),
    to: z.coerce.number().int().min(0),
    padTo: z.coerce.number().int().min(1).max(6).default(3),
    floor: z.coerce.number().int().optional().nullable(),
    ...unitFields,
  }),
]);

export async function propertyStats(prisma: PrismaService, ids: string[]) {
  const result = new Map<string, { units: Record<UnitStatus, number> & { total: number }; dues: number; openTickets: number }>();
  for (const id of ids) result.set(id, { units: { VACANT: 0, OCCUPIED: 0, RESERVED: 0, MAINTENANCE: 0, total: 0 }, dues: 0, openTickets: 0 });
  if (!ids.length) return result;

  const units = await prisma.unit.groupBy({ by: ['propertyId', 'status'], where: { propertyId: { in: ids }, deletedAt: null }, _count: { _all: true } });
  for (const g of units) {
    const s = result.get(g.propertyId)!;
    s.units[g.status] = g._count._all;
    s.units.total += g._count._all;
  }
  const dues = await prisma.$queryRaw<{ id: string; due: Prisma.Decimal }[]>`
    SELECT u."propertyId" AS id, SUM(r.amount) AS due
    FROM "RentEntry" r JOIN "Unit" u ON u.id = r."unitId"
    WHERE r.status IN ('PENDING', 'OVERDUE') AND u."propertyId" IN (${Prisma.join(ids)})
    GROUP BY u."propertyId"`;
  for (const d of dues) result.get(d.id)!.dues = num(d.due);
  const tickets = await prisma.maintenanceRequest.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, status: { in: [...OPEN_TICKET] } }, _count: { _all: true } });
  for (const t of tickets) result.get(t.propertyId)!.openTickets = t._count._all;
  return result;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
  ) {}

  async list(u: AuthUser, q: { q?: string; type?: string; ownerId?: string; status?: string }) {
    const where: Prisma.PropertyWhereInput = {
      AND: [
        this.scope.propertyWhere(u),
        q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {},
        q.type ? { type: q.type as Prisma.EnumPropertyTypeFilter['equals'] } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.status ? { status: q.status as Prisma.EnumPropertyStatusFilter['equals'] } : {},
      ],
    };
    const properties = await this.prisma.property.findMany({ where, include: { owner: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } });
    const stats = await propertyStats(this.prisma, properties.map((p) => p.id));
    return properties.map((p) => ({ ...p, stats: stats.get(p.id) }));
  }

  async get(u: AuthUser, id: string) {
    const property = await this.prisma.property.findFirst({
      where: { AND: [this.scope.propertyWhere(u), { id }] },
      include: { owner: { select: { id: true, name: true, phone: true, email: true } } },
    });
    if (!property) throw new NotFound('Property');
    const stats = (await propertyStats(this.prisma, [id])).get(id);
    return { ...property, stats };
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(propertySchema, body);
    const owner = await this.prisma.owner.findFirst({ where: { id: data.ownerId, companyId: u.companyId, deletedAt: null } });
    if (!owner) throw new NotFound('Owner');
    const dup = await this.prisma.property.findFirst({ where: { companyId: u.companyId, code: data.code } });
    if (dup) throw new BusinessError('CODE_TAKEN', `The code ${data.code} is already used by ${dup.name}.`);
    const property = await this.prisma.property.create({
      data: {
        ...data,
        companyId: u.companyId,
        // The manager who creates a property is given access to it.
        access: u.role === 'MANAGER' ? { create: { userId: u.id } } : undefined,
      },
    });
    await this.activity.log(u, u.companyId, { entityType: 'PROPERTY', entityId: property.id, action: 'create', summary: `Created property ${property.name}` });
    return property;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    const before = await this.scope.assertProperty(u, id);
    const data = parse(propertySchema.partial(), body);
    if (data.ownerId) {
      const owner = await this.prisma.owner.findFirst({ where: { id: data.ownerId, companyId: u.companyId, deletedAt: null } });
      if (!owner) throw new NotFound('Owner');
    }
    if (data.code && data.code !== before.code) {
      const dup = await this.prisma.property.findFirst({ where: { companyId: u.companyId, code: data.code } });
      if (dup) throw new BusinessError('CODE_TAKEN', `The code ${data.code} is already used.`);
    }
    const property = await this.prisma.property.update({ where: { id }, data });
    await this.activity.log(u, u.companyId, { entityType: 'PROPERTY', entityId: id, action: 'update', summary: `Updated property ${before.name}`, newValues: data });
    return property;
  }

  async archive(u: AuthUser, id: string) {
    const property = await this.scope.assertProperty(u, id);
    const active = await this.prisma.lease.count({ where: { status: 'ACTIVE', unit: { propertyId: id } } });
    if (active) throw new BusinessError('HAS_ACTIVE_LEASES', `This property has ${active} active lease(s). End them before archiving.`);
    await this.prisma.property.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await this.activity.log(u, u.companyId, { entityType: 'PROPERTY', entityId: id, action: 'archive', summary: `Archived property ${property.name}` });
    return { ok: true };
  }

  /** Unit grid for a property: status, current tenant, this month's rent and alert flags. */
  async units(u: AuthUser, id: string, q: { status?: string; floor?: string; q?: string }) {
    await this.scope.assertProperty(u, id);
    const period = currentPeriod();
    const soon = addDays(today(), 30);
    const units = await this.prisma.unit.findMany({
      where: {
        propertyId: id,
        deletedAt: null,
        ...(q.status ? { status: q.status as UnitStatus } : {}),
        ...(q.floor ? { floor: Number(q.floor) } : {}),
        ...(q.q ? { unitNo: { contains: q.q, mode: 'insensitive' as const } } : {}),
      },
      include: {
        leases: { where: { status: 'ACTIVE' }, take: 1, include: { tenant: { select: { id: true, fullName: true, phone: true } } } },
        rentEntries: { where: { OR: [{ period }, { status: 'OVERDUE' }] }, select: { period: true, status: true, amount: true } },
        _count: { select: { tickets: { where: { status: { in: [...OPEN_TICKET] } } } } },
      },
      orderBy: [{ floor: 'asc' }, { unitNo: 'asc' }],
    });
    return units.map((x) => {
      const lease = x.leases[0];
      const thisMonth = x.rentEntries.find((r) => r.period === period);
      return {
        id: x.id,
        unitNo: x.unitNo,
        floor: x.floor,
        block: x.block,
        unitType: x.unitType,
        areaSqft: x.areaSqft,
        expectedRent: num(x.expectedRent),
        securityDeposit: num(x.securityDeposit),
        status: x.status,
        vacantSince: isoDate(x.vacantSince),
        vacantDays: x.vacantSince ? daysBetween(x.vacantSince, today()) : null,
        lease: lease
          ? { id: lease.id, endDate: isoDate(lease.endDate), monthlyRent: num(lease.monthlyRent), tenant: lease.tenant }
          : null,
        rentThisMonth: thisMonth ? { status: thisMonth.status, amount: num(thisMonth.amount) } : null,
        overdue: x.rentEntries.some((r) => r.status === 'OVERDUE'),
        expiringSoon: !!lease && lease.endDate <= soon,
        openTickets: x._count.tickets,
      };
    });
  }

  async addUnit(u: AuthUser, propertyId: string, body: unknown) {
    const property = await this.scope.assertProperty(u, propertyId);
    const data = parse(unitSchema, body);
    const dup = await this.prisma.unit.findFirst({ where: { propertyId, unitNo: data.unitNo } });
    if (dup) throw new BusinessError('UNIT_EXISTS', `Unit ${data.unitNo} already exists in ${property.name}.`);
    const unit = await this.prisma.unit.create({ data: { ...data, propertyId, vacantSince: data.status === 'VACANT' ? today() : null } });
    await this.activity.log(u, u.companyId, { entityType: 'UNIT', entityId: unit.id, action: 'create', summary: `Added unit ${unit.unitNo}` });
    return unit;
  }

  /** Creates many units at once, e.g. floors 1–10 × 10 units = 101…1010, or a range 001…100. */
  async bulkUnits(u: AuthUser, propertyId: string, body: unknown) {
    const property = await this.scope.assertProperty(u, propertyId);
    const data = parse(bulkSchema, body);
    const pad = (n: number, len: number) => String(n).padStart(len, '0');
    const rows: { unitNo: string; floor: number | null }[] = [];
    if (data.mode === 'floors') {
      if (data.floorTo < data.floorFrom) throw new BusinessError('BAD_RANGE', 'The last floor must be after the first floor.', 400);
      for (let f = data.floorFrom; f <= data.floorTo; f++) {
        for (let n = 1; n <= data.unitsPerFloor; n++) rows.push({ unitNo: f === 0 ? `G${pad(n, 2)}` : `${f}${pad(n, 2)}`, floor: f });
      }
    } else {
      if (data.to < data.from) throw new BusinessError('BAD_RANGE', 'The last number must be after the first number.', 400);
      for (let n = data.from; n <= data.to; n++) rows.push({ unitNo: `${data.prefix}${pad(n, data.padTo)}`, floor: data.floor ?? null });
    }
    if (rows.length > 1000) throw new BusinessError('TOO_MANY', 'You can add up to 1,000 units at a time.', 400);

    const existing = new Set(
      (await this.prisma.unit.findMany({ where: { propertyId, unitNo: { in: rows.map((r) => r.unitNo) } }, select: { unitNo: true } })).map((x) => x.unitNo),
    );
    const fresh = rows.filter((r) => !existing.has(r.unitNo));
    await this.prisma.unit.createMany({
      data: fresh.map((r) => ({
        propertyId,
        unitNo: r.unitNo,
        floor: r.floor,
        unitType: data.unitType,
        block: data.block,
        areaSqft: data.areaSqft ?? null,
        expectedRent: data.expectedRent,
        securityDeposit: data.securityDeposit,
        status: 'VACANT' as const,
        vacantSince: today(),
      })),
    });
    await this.activity.log(u, u.companyId, {
      entityType: 'PROPERTY',
      entityId: propertyId,
      action: 'bulk_units',
      summary: `Added ${fresh.length} units to ${property.name}${existing.size ? ` (${existing.size} already existed)` : ''}`,
    });
    return { created: fresh.length, skipped: [...existing] };
  }
}

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Can('properties:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.properties.list(u, q);
  }

  @Can('properties:read')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.properties.get(u, id);
  }

  @Can('properties:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.properties.create(u, body);
  }

  @Can('properties:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.update(u, id, body);
  }

  @Can('properties:write')
  @Delete(':id')
  archive(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.properties.archive(u, id);
  }

  @Can('properties:read')
  @Get(':id/units')
  units(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query() q: Record<string, string>) {
    return this.properties.units(u, id, q);
  }

  @Can('units:write')
  @Post(':id/units')
  addUnit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.addUnit(u, id, body);
  }

  @Can('units:write')
  @Post(':id/units/bulk')
  bulk(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.properties.bulkUnits(u, id, body);
  }
}
