import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ActivityService } from '../common/activity.service';
import { AuthUser, Can, CurrentUser } from '../common/auth';
import { NotFound } from '../common/errors';
import { ScopeService } from '../common/scope.service';
import { currentPeriod, dateOnly, formatINR, isPeriod, isoDate, num, periodEnd, periodStart } from '../common/util';
import { parse, zDate, zMoney, zOptText } from '../common/validation';
import { PrismaService } from '../prisma.service';

const categories = ['MAINTENANCE', 'UTILITY', 'VENDOR', 'SALARY', 'TAX', 'INSURANCE', 'ADMIN', 'OTHER'] as const;

const expenseSchema = z.object({
  propertyId: z.string().uuid('Choose a property'),
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum(categories),
  amount: zMoney.refine((v) => v > 0, 'Enter the amount'),
  expenseDate: zDate,
  paidTo: zOptText,
  mode: z.enum(['CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD']).optional().nullable(),
  notes: zOptText,
});

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
  ) {}

  async list(u: AuthUser, q: { propertyId?: string; period?: string; category?: string }) {
    const period = q.period && isPeriod(q.period) ? q.period : currentPeriod();
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      property: this.scope.propertyFilter(u, q.propertyId),
      expenseDate: { gte: periodStart(period), lte: periodEnd(period) },
      ...(q.category ? { category: q.category as ExpenseCategory } : {}),
    };
    const rows = await this.prisma.expense.findMany({
      where,
      include: { property: { select: { id: true, name: true } }, unit: { select: { id: true, unitNo: true } }, maintenanceRequest: { select: { id: true, ticketNo: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    const byCategory: Record<string, number> = {};
    for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + num(r.amount);
    return {
      period,
      total: rows.reduce((s, r) => s + num(r.amount), 0),
      byCategory,
      rows: rows.map((r) => ({
        id: r.id,
        category: r.category,
        amount: num(r.amount),
        expenseDate: isoDate(r.expenseDate),
        paidTo: r.paidTo,
        mode: r.mode,
        notes: r.notes,
        property: r.property,
        unit: r.unit,
        ticket: r.maintenanceRequest,
      })),
    };
  }

  async create(u: AuthUser, body: unknown) {
    const data = parse(expenseSchema, body);
    await this.scope.assertProperty(u, data.propertyId);
    if (data.unitId) await this.scope.assertUnit(u, data.unitId);
    const e = await this.prisma.expense.create({ data: { ...data, expenseDate: dateOnly(data.expenseDate), createdById: u.id } });
    await this.activity.log(u, u.companyId, { entityType: 'EXPENSE', entityId: e.id, action: 'create', summary: `Expense ${formatINR(data.amount)} (${data.category.toLowerCase()}) recorded` });
    return e;
  }

  private async assertExpense(u: AuthUser, id: string) {
    const e = await this.prisma.expense.findFirst({ where: { id, deletedAt: null, property: this.scope.propertyWhere(u) } });
    if (!e) throw new NotFound('Expense');
    return e;
  }

  async update(u: AuthUser, id: string, body: unknown) {
    await this.assertExpense(u, id);
    const data = parse(expenseSchema.partial(), body);
    if (data.propertyId) await this.scope.assertProperty(u, data.propertyId);
    const e = await this.prisma.expense.update({ where: { id }, data: { ...data, expenseDate: data.expenseDate ? dateOnly(data.expenseDate) : undefined } });
    await this.activity.log(u, u.companyId, { entityType: 'EXPENSE', entityId: id, action: 'update', summary: 'Expense updated', newValues: data });
    return e;
  }

  async remove(u: AuthUser, id: string) {
    const e = await this.assertExpense(u, id);
    await this.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.activity.log(u, u.companyId, { entityType: 'EXPENSE', entityId: id, action: 'delete', summary: `Expense ${formatINR(num(e.amount))} deleted` });
    return { ok: true };
  }
}

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Can('expenses:read')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.expenses.list(u, q);
  }

  @Can('expenses:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.expenses.create(u, body);
  }

  @Can('expenses:write')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.expenses.update(u, id, body);
  }

  @Can('expenses:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.expenses.remove(u, id);
  }
}
