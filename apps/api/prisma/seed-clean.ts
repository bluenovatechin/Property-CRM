/**
 * Clean start: ERASES ALL DATA and creates only the six demo logins (password Password@123).
 * Every section (properties, units, tenants, leases, rent, maintenance, expenses, reports) starts empty.
 *
 * owner.a and customer.a each need a profile to sign in, so exactly one Owner ("Owner A")
 * and one Tenant ("Customer A", no lease yet) are created and linked to those logins.
 *
 * Run: npm run db:clean -w apps/api      (uses DATABASE_URL from apps/api/.env)
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();
const PASSWORD = 'Password@123';

async function wipe() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.maintenanceComment.deleteMany(),
    prisma.maintenanceRequest.deleteMany(),
    prisma.rentEntry.deleteMany(),
    prisma.lease.updateMany({ data: { previousLeaseId: null } }),
    prisma.lease.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.userPropertyAccess.deleteMany(),
    prisma.user.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.property.deleteMany(),
    prisma.tenant.deleteMany(),
    prisma.owner.deleteMany(),
    prisma.document.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "MaintenanceRequest_ticketNo_seq" RESTART WITH 1`);
}

async function main() {
  const host = (process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? 'database';
  console.log(`Erasing all data on ${host} and creating the demo logins…`);
  await wipe();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const company = await prisma.company.create({ data: { name: 'BlueNova Properties' } });
  const ownerA = await prisma.owner.create({ data: { companyId: company.id, name: 'Owner A', phone: '9876500001', email: 'owner.a@demo.test' } });
  const customerA = await prisma.tenant.create({ data: { companyId: company.id, fullName: 'Customer A', phone: '9876500101', email: 'customer.a@demo.test', status: 'INACTIVE' } });

  const users: { email: string; name: string; role: Role; ownerId?: string; tenantId?: string }[] = [
    { email: 'admin@demo.test', name: 'Super Admin', role: 'SUPER_ADMIN' },
    { email: 'manager@demo.test', name: 'Property Manager', role: 'MANAGER' },
    { email: 'finance@demo.test', name: 'Finance User', role: 'FINANCE' },
    { email: 'staff1@demo.test', name: 'Staff 1', role: 'STAFF' },
    { email: 'owner.a@demo.test', name: 'Owner A', role: 'OWNER', ownerId: ownerA.id },
    { email: 'customer.a@demo.test', name: 'Customer A', role: 'TENANT', tenantId: customerA.id },
  ];
  for (const u of users) {
    await prisma.user.create({ data: { ...u, companyId: company.id, passwordHash: hash, status: 'ACTIVE' } });
  }

  console.log(`Done. Company "${company.name}", ${users.length} logins, everything else empty.`);
  console.log(`Password for all: ${PASSWORD}`);
  console.log(users.map((u) => `  ${u.email.padEnd(24)} ${u.role}`).join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
