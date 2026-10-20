/**
 * Demo data: the brief's "Sunrise Residency" example plus two more properties (240 units).
 * Dates are relative to today, so dues, overdue rent and expiring leases always look current.
 * Run with: npm run db:seed   (this ERASES existing data — development only)
 */
import { PaymentMode, PrismaClient, Priority, TicketStatus, UnitStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const PASSWORD = 'Password@123';

const DAY = 86_400_000;
const pad = (n: number, l = 2) => String(n).padStart(l, '0');
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const T = new Date(`${todayIso}T00:00:00.000Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const firstOfMonth = (d: Date, shift = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 1));
const addYearMinusDay = (d: Date) => addDays(new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())), -1);
const period = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const dueDate = (p: string, day: number) => new Date(`${p}-${pad(day)}T00:00:00.000Z`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const MODES: PaymentMode[] = ['UPI', 'UPI', 'BANK', 'UPI', 'CASH', 'CHEQUE'];

let phoneCounter = 0;
const nextPhone = () => String(9_100_000_000 + ++phoneCounter * 7919);

interface UnitPlan {
  id: string;
  unitNo: string;
  floor: number;
  unitType: string;
  areaSqft: number;
  rent: number;
  status: UnitStatus;
}

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
  // Safety: this fills the database with ~200 sample tenants. Never run it on the live database by accident.
  const host = (process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '';
  if (!/^(localhost|127\.0\.0\.1)/.test(host) && process.env.ALLOW_SAMPLE_DATA !== 'yes') {
    console.error(`Refusing to load sample data into ${host}. This is not a local database.`);
    console.error('For a clean live database use: npm run db:clean -w apps/api');
    console.error('If you really want sample data there, run again with ALLOW_SAMPLE_DATA=yes');
    process.exit(1);
  }
  console.log(`Seeding demo data relative to ${todayIso}…`);
  await wipe();
  const hash = await bcrypt.hash(PASSWORD, 10);

  const company = await prisma.company.create({ data: { name: 'BlueNova Demo Properties' } });
  const ownerA = await prisma.owner.create({ data: { companyId: company.id, name: 'Owner A', phone: '9876500001', email: 'owner.a@demo.test', address: 'Prahlad Nagar, Ahmedabad', pan: 'ABCDE1234F', bankAccount: '50100012345678', ifsc: 'HDFC0001234' } });
  const ownerB = await prisma.owner.create({ data: { companyId: company.id, name: 'Owner B', phone: '9876500002', email: 'owner.b@demo.test', address: 'Alkapuri, Vadodara', pan: 'PQRSX5678K' } });

  const props = {
    sun: await prisma.property.create({ data: { companyId: company.id, code: 'SUN-RES', name: 'Sunrise Residency', type: 'RESIDENTIAL', addressLine1: 'Near Iscon Cross Road', area: 'Satellite', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', ownerId: ownerA.id, notes: '10 floors · Block A · 2 lifts' } }),
    grn: await prisma.property.create({ data: { companyId: company.id, code: 'GRN-PRK', name: 'Green Park', type: 'RESIDENTIAL', addressLine1: 'VIP Road', area: 'Vesu', city: 'Surat', state: 'Gujarat', pincode: '395007', ownerId: ownerA.id } }),
    cty: await prisma.property.create({ data: { companyId: company.id, code: 'CTY-MAL', name: 'City Mall', type: 'COMMERCIAL', addressLine1: 'Race Course Road', area: 'Alkapuri', city: 'Vadodara', state: 'Gujarat', pincode: '390007', ownerId: ownerB.id } }),
  };
  const allPropertyIds = Object.values(props).map((p) => p.id);

  // ── Users (all share the demo password) ────────────────────────────────────
  const user = (email: string, name: string, role: 'SUPER_ADMIN' | 'MANAGER' | 'FINANCE' | 'STAFF' | 'OWNER' | 'TENANT', extra: object = {}) =>
    prisma.user.create({ data: { companyId: company.id, email, name, role, passwordHash: hash, status: 'ACTIVE', lastLoginAt: hoursAgo(20), ...extra } });
  const admin = await user('admin@demo.test', 'Super Admin', 'SUPER_ADMIN');
  const manager = await user('manager@demo.test', 'Property Manager', 'MANAGER', { phone: '9876500010', propertyAccess: { create: allPropertyIds.map((propertyId) => ({ propertyId })) } });
  await user('finance@demo.test', 'Finance User', 'FINANCE', { propertyAccess: { create: allPropertyIds.map((propertyId) => ({ propertyId })) } });
  const staff1 = await user('staff1@demo.test', 'Staff 1', 'STAFF', { propertyAccess: { create: allPropertyIds.map((propertyId) => ({ propertyId })) } });
  const staff2 = await user('staff2@demo.test', 'Staff 2', 'STAFF', { propertyAccess: { create: allPropertyIds.map((propertyId) => ({ propertyId })) } });
  const ownerAUser = await user('owner.a@demo.test', 'Owner A', 'OWNER', { ownerId: ownerA.id });
  const ownerBUser = await user('owner.b@demo.test', 'Owner B', 'OWNER', { ownerId: ownerB.id });
  const enteredBy = { [props.sun.id]: ownerAUser.id, [props.grn.id]: ownerAUser.id, [props.cty.id]: ownerBUser.id };

  // ── Units ───────────────────────────────────────────────────────────────────
  const sunRents = [20000, 18000, 19000, 22000, 19500, 21000, 18500, 20000, 21500, 19000];
  const sunVacant = new Set(['103', '203', '208', '302', '404', '409', '507', '602', '706', '803', '905', '1008']);
  const sunReserved = new Set(['106', '210', '307', '508', '711', '904']);
  const plans: Record<string, UnitPlan[]> = { sun: [], grn: [], cty: [] };
  for (let f = 1; f <= 10; f++) {
    for (let n = 1; n <= 10; n++) {
      const unitNo = `${f}${pad(n)}`;
      plans.sun.push({ id: randomUUID(), unitNo, floor: f, unitType: '2BHK', areaSqft: 1050, rent: sunRents[n - 1] + (f > 5 ? 500 : 0), status: sunVacant.has(unitNo) ? 'VACANT' : sunReserved.has(unitNo) ? 'RESERVED' : 'OCCUPIED' });
    }
  }
  const grnVacant = new Set(['105', '304', '410', '602', '708', '806']);
  const grnReserved = new Set(['209', '505']);
  const grnMaint = new Set(['310', '701']);
  for (let f = 1; f <= 8; f++) {
    for (let n = 1; n <= 10; n++) {
      const unitNo = `${f}${pad(n)}`;
      const three = n % 3 === 0;
      plans.grn.push({ id: randomUUID(), unitNo, floor: f, unitType: three ? '3BHK' : '2BHK', areaSqft: three ? 1450 : 1100, rent: three ? 24000 : 17000 + (n % 4) * 1000, status: grnVacant.has(unitNo) ? 'VACANT' : grnReserved.has(unitNo) ? 'RESERVED' : grnMaint.has(unitNo) ? 'MAINTENANCE' : 'OCCUPIED' });
    }
  }
  const ctyVacant = new Set(['G-11', 'G-17', 'F-03', 'F-08', 'F-15', 'F-19', 'S-02', 'S-06', 'S-09', 'S-13', 'S-16', 'S-20']);
  const ctyReserved = new Set(['F-05', 'S-11']);
  const ctyMaint = new Set(['G-14', 'S-18']);
  ['G', 'F', 'S'].forEach((level, li) => {
    for (let n = 1; n <= 20; n++) {
      const unitNo = `${level}-${pad(n)}`;
      plans.cty.push({ id: randomUUID(), unitNo, floor: li, unitType: n % 5 === 0 ? 'Anchor shop' : 'Shop', areaSqft: n % 5 === 0 ? 900 : 450, rent: (n % 5 === 0 ? 45000 : 30000 + (n % 4) * 3000) - li * 2000, status: ctyVacant.has(unitNo) ? 'VACANT' : ctyReserved.has(unitNo) ? 'RESERVED' : ctyMaint.has(unitNo) ? 'MAINTENANCE' : 'OCCUPIED' });
    }
  });
  const vacantFor = (key: string, unitNo: string) => {
    const special: Record<string, number> = { 'sun:103': 64, 'cty:G-11': 166, 'grn:602': 117 };
    return addDays(T, -(special[`${key}:${unitNo}`] ?? 20 + ((unitNo.charCodeAt(unitNo.length - 1) * 7) % 70)));
  };
  for (const [key, list] of Object.entries(plans)) {
    const property = props[key as keyof typeof props];
    await prisma.unit.createMany({
      data: list.map((u) => ({
        id: u.id,
        propertyId: property.id,
        unitNo: u.unitNo,
        floor: u.floor,
        block: key === 'cty' ? null : 'A',
        unitType: u.unitType,
        areaSqft: u.areaSqft,
        expectedRent: u.rent,
        securityDeposit: u.rent * 3,
        status: u.status,
        vacantSince: u.status === 'VACANT' ? vacantFor(key, u.unitNo) : null,
        notes: key === 'sun' && u.unitNo === '101' ? 'Parking slot P-14. Pets allowed with deposit.' : null,
        createdAt: addDays(T, -400),
      })),
    });
  }

  // ── Tenants + active leases for occupied units ─────────────────────────────
  const named: Record<string, { name: string; email?: string; type?: 'COMPANY' }> = {
    'sun:101': { name: 'Customer A', email: 'customer.a@demo.test' },
    'sun:102': { name: 'Customer B', email: 'customer.b@demo.test' },
    'sun:104': { name: 'Customer C', email: 'customer.c@demo.test' },
    'sun:105': { name: 'Customer D' },
    'cty:G-04': { name: 'Customer F Traders', email: 'customer.f@demo.test', type: 'COMPANY' },
  };
  // Leases ending soon (days from today) — they drive the expiry alerts and report.
  const expiring: Record<string, number> = { 'sun:104': 26, 'sun:402': 14, 'sun:608': 22, 'grn:207': 9, 'grn:503': 28, 'cty:G-07': 19, 'cty:F-12': 29, 'sun:1001': 45, 'grn:301': 52 };
  const dueDayOf = { sun: 5, grn: 10, cty: 25 } as const;
  const tenantRows: { id: string; companyId: string; fullName: string; phone: string; email: string | null; type: 'INDIVIDUAL' | 'COMPANY'; status: 'ACTIVE'; idType: string; idNumber: string; address: string; createdAt: Date }[] = [];
  const leaseRows: { id: string; unitId: string; tenantId: string; startDate: Date; endDate: Date; monthlyRent: number; securityDeposit: number; dueDay: number; escalationPct: number; status: 'ACTIVE'; renewalTerms: string; createdAt: Date }[] = [];
  const leaseInfo: { leaseId: string; tenantId: string; unitId: string; key: string; unitNo: string; rent: number; dueDay: number; start: Date }[] = [];

  let k = 0;
  for (const [key, list] of Object.entries(plans)) {
    for (const u of list.filter((x) => x.status === 'OCCUPIED')) {
      k++;
      const id = `${key}:${u.unitNo}`;
      const spec = named[id];
      const tenantId = randomUUID();
      const prefix = key === 'sun' ? '' : key === 'grn' ? 'GP-' : 'CM-';
      tenantRows.push({
        id: tenantId,
        companyId: company.id,
        fullName: spec?.name ?? `Customer ${prefix}${u.unitNo}`,
        phone: nextPhone(),
        email: spec?.email ?? null,
        type: spec?.type ?? (key === 'cty' ? 'COMPANY' : 'INDIVIDUAL'),
        status: 'ACTIVE',
        idType: key === 'cty' ? 'GSTIN' : 'AADHAAR',
        idNumber: key === 'cty' ? `24ABCDE${pad(k, 4)}F1Z5` : `${4000 + k} ${5000 + k} ${pad(k * 37 % 10000, 4)}`,
        address: '[Permanent address on file]',
        createdAt: addDays(T, -500),
      });
      let start: Date;
      let end: Date;
      if (expiring[id] !== undefined) {
        end = addDays(T, expiring[id]);
        start = addDays(new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate())), 1);
      } else if (id === 'sun:101') {
        start = firstOfMonth(T, -6);
        end = addYearMinusDay(start);
      } else {
        start = firstOfMonth(T, -(2 + (k % 8)));
        end = addYearMinusDay(start);
      }
      const leaseId = randomUUID();
      leaseRows.push({ id: leaseId, unitId: u.id, tenantId, startDate: start, endDate: end, monthlyRent: u.rent, securityDeposit: u.rent * 3, dueDay: dueDayOf[key as keyof typeof dueDayOf], escalationPct: 5, status: 'ACTIVE', renewalTerms: 'Renewal for 11–12 months by mutual consent; rent increases by the agreed percentage.', createdAt: start });
      leaseInfo.push({ leaseId, tenantId, unitId: u.id, key, unitNo: u.unitNo, rent: u.rent, dueDay: dueDayOf[key as keyof typeof dueDayOf], start });
    }
  }
  await prisma.tenant.createMany({ data: tenantRows });
  await prisma.lease.createMany({ data: leaseRows });

  // Customer A renewed last year at a lower rent (shows lease history).
  const a = leaseInfo.find((l) => l.key === 'sun' && l.unitNo === '101')!;
  const prevStart = new Date(Date.UTC(a.start.getUTCFullYear() - 1, a.start.getUTCMonth(), 1));
  const prevLease = await prisma.lease.create({ data: { unitId: a.unitId, tenantId: a.tenantId, startDate: prevStart, endDate: addDays(a.start, -1), monthlyRent: 19000, securityDeposit: 60000, dueDay: 5, escalationPct: 5, status: 'RENEWED', createdAt: prevStart } });
  await prisma.lease.update({ where: { id: a.leaseId }, data: { previousLeaseId: prevLease.id } });
  await prisma.tenant.update({ where: { id: a.tenantId }, data: { altPhone: '9712345845', emergencyName: 'Relative', emergencyPhone: '9998887120', createdAt: prevStart } });

  // A previous tenant whose lease ended (Previous status).
  const prevTenant = await prisma.tenant.create({ data: { companyId: company.id, fullName: 'Customer E', phone: nextPhone(), status: 'PREVIOUS', createdAt: addDays(T, -700) } });
  const unit103 = plans.sun.find((u) => u.unitNo === '103')!;
  await prisma.lease.create({ data: { unitId: unit103.id, tenantId: prevTenant.id, startDate: addDays(T, -430), endDate: addDays(T, -65), monthlyRent: 18500, securityDeposit: 55500, dueDay: 5, status: 'EXPIRED' } });

  // ── Rent entries: last 3 months paid; this month a realistic mix ───────────
  const thisPeriod = period(T);
  const overdueThisMonth = new Set(['sun:102', 'sun:309', 'sun:506', 'sun:810', 'grn:204', 'grn:407', 'grn:610']);
  const notEntered = new Set(['sun:201', 'sun:205', 'sun:209', 'sun:301', 'grn:108', 'grn:402']);
  const pendingCty = new Set(['cty:G-02', 'cty:G-05', 'cty:G-09', 'cty:F-01', 'cty:F-06', 'cty:F-10', 'cty:S-03', 'cty:S-07', 'cty:S-12', 'cty:S-15']);
  const rentRows: object[] = [];
  let m = 0;
  for (const l of leaseInfo) {
    const id = `${l.key}:${l.unitNo}`;
    const entered = l.key === 'cty' ? ownerBUser.id : ownerAUser.id;
    for (let back = 3; back >= 0; back--) {
      const pDate = firstOfMonth(T, -back);
      if (pDate < firstOfMonth(l.start)) continue;
      const p = period(pDate);
      const due = dueDate(p, l.dueDay);
      const isCurrent = back === 0;
      if (isCurrent && notEntered.has(id)) continue;
      m++;
      let status: 'PAID' | 'PENDING' | 'OVERDUE' = 'PAID';
      if (isCurrent && overdueThisMonth.has(id)) status = 'OVERDUE';
      if (isCurrent && l.key === 'cty') status = pendingCty.has(id) ? 'PENDING' : due < T ? 'PAID' : 'PAID';
      // Customer F missed last month's rent (overdue for weeks).
      if (id === 'cty:G-04' && back === 1) status = 'OVERDUE';
      if (id === 'cty:G-04' && isCurrent) status = 'PENDING';
      const paidOn = status === 'PAID' ? addDays(due, -((m * 3) % 4)) : null;
      rentRows.push({
        leaseId: l.leaseId,
        unitId: l.unitId,
        tenantId: l.tenantId,
        period: p,
        amount: l.rent,
        dueDate: due,
        status,
        paidOn: paidOn && paidOn > T ? T : paidOn,
        mode: status === 'PAID' ? MODES[m % MODES.length] : null,
        reference: status === 'PAID' ? `${MODES[m % MODES.length] === 'CHEQUE' ? 'CHQ' : 'TXN'}${pad((m * 7331) % 100000, 5)}` : null,
        enteredById: entered,
        createdAt: firstOfMonth(pDate),
        updatedAt: paidOn ?? firstOfMonth(pDate),
      });
    }
  }
  await prisma.rentEntry.createMany({ data: rentRows as never });

  // ── Maintenance tickets (Sunrise matches the design; others add volume) ─────
  const unitId = (key: string, unitNo: string) => plans[key].find((u) => u.unitNo === unitNo)!.id;
  const tenantOf = (key: string, unitNo: string) => leaseInfo.find((l) => l.key === key && l.unitNo === unitNo)?.tenantId ?? null;
  const SLA: Record<Priority, number> = { URGENT: 24, HIGH: 48, MEDIUM: 120, LOW: 240 };
  type TicketSeed = { key: string; unitNo: string | null; category: string; title: string; description: string; priority: Priority; status: TicketStatus; ageHours: number; assignee?: string; vendor?: string; est?: number; cost?: number; raisedBy?: string };
  const tickets: TicketSeed[] = [
    { key: 'sun', unitNo: '101', category: 'Electrical', title: 'Fan not working', description: 'Bedroom ceiling fan does not start.', priority: 'MEDIUM', status: 'CLOSED', ageHours: 24 * 123, assignee: staff1.id, est: 800, cost: 800 },
    { key: 'sun', unitNo: '101', category: 'Plumbing', title: 'Bathroom pipe leak', description: 'Water leaking from the joint under the wash basin.', priority: 'HIGH', status: 'CLOSED', ageHours: 24 * 39, assignee: staff2.id, est: 1000, cost: 1200 },
    { key: 'sun', unitNo: '104', category: 'Painting', title: 'Balcony paint peeling', description: 'Paint peeling on the balcony wall after the monsoon.', priority: 'LOW', status: 'RESOLVED', ageHours: 24 * 11, assignee: staff2.id, est: 3000, cost: 2600 },
    { key: 'sun', unitNo: '109', category: 'Carpentry', title: 'Wardrobe door broken', description: 'Hinge broken on the left wardrobe door.', priority: 'MEDIUM', status: 'IN_PROGRESS', ageHours: 72, vendor: 'Local carpenter (vendor)', est: 2000 },
    { key: 'sun', unitNo: '207', category: 'Electrical', title: 'Power trip in bedroom', description: 'MCB trips whenever the AC is switched on.', priority: 'URGENT', status: 'IN_PROGRESS', ageHours: 20, assignee: staff1.id, est: 1500 },
    { key: 'sun', unitNo: null, category: 'Lift', title: 'Lift stuck at floor 3', description: 'Residents report the lift stops between floors 2 and 3.', priority: 'URGENT', status: 'OPEN', ageHours: 26, est: 8000 },
    { key: 'sun', unitNo: '102', category: 'Plumbing', title: 'Leaking kitchen tap', description: 'Tap leaks continuously; water collects under the sink.', priority: 'HIGH', status: 'OPEN', ageHours: 28, est: 600 },
    { key: 'sun', unitNo: '203', category: 'Painting', title: 'Repaint before move-in', description: 'Vacant unit; repaint walls before the next lease.', priority: 'LOW', status: 'OPEN', ageHours: 3, est: 12000 },
    { key: 'grn', unitNo: '310', category: 'Plumbing', title: 'Bathroom renovation', description: 'Replacing old pipes; unit kept under maintenance.', priority: 'MEDIUM', status: 'IN_PROGRESS', ageHours: 24 * 4, assignee: staff2.id, est: 18000 },
    { key: 'grn', unitNo: '701', category: 'Electrical', title: 'Rewiring after short circuit', description: 'Full rewiring of the kitchen circuit.', priority: 'HIGH', status: 'IN_PROGRESS', ageHours: 30, assignee: staff1.id, est: 9500 },
    { key: 'grn', unitNo: '204', category: 'Appliance', title: 'Water heater not heating', description: 'Geyser switches on but water stays cold.', priority: 'MEDIUM', status: 'OPEN', ageHours: 50 },
    { key: 'grn', unitNo: '509', category: 'Carpentry', title: 'Main door lock jammed', description: 'Key turns with difficulty.', priority: 'HIGH', status: 'OPEN', ageHours: 10 },
    { key: 'grn', unitNo: null, category: 'Cleaning', title: 'Overhead tank cleaning', description: 'Quarterly tank cleaning for block A.', priority: 'LOW', status: 'OPEN', ageHours: 70 },
    { key: 'grn', unitNo: '608', category: 'Plumbing', title: 'Low water pressure', description: 'Low pressure in the master bathroom.', priority: 'MEDIUM', status: 'OPEN', ageHours: 6 },
    { key: 'grn', unitNo: '402', category: 'Electrical', title: 'Switchboard sparking', description: 'Living room switchboard sparks when used.', priority: 'URGENT', status: 'CLOSED', ageHours: 24 * 9, assignee: staff1.id, est: 1200, cost: 1400 },
    { key: 'cty', unitNo: 'G-14', category: 'Electrical', title: 'Shop signage lighting', description: 'Frontage lights flicker; replacing driver unit.', priority: 'MEDIUM', status: 'IN_PROGRESS', ageHours: 40, assignee: staff2.id, est: 4500 },
    { key: 'cty', unitNo: null, category: 'Security', title: 'CCTV camera offline (parking)', description: 'Camera 4 in the basement parking shows no feed.', priority: 'HIGH', status: 'OPEN', ageHours: 16 },
    { key: 'cty', unitNo: 'F-01', category: 'Plumbing', title: 'Washroom flush not working', description: 'Common washroom on first floor.', priority: 'MEDIUM', status: 'OPEN', ageHours: 22 },
    { key: 'cty', unitNo: 'S-04', category: 'Appliance', title: 'AC not cooling', description: 'Split AC blows warm air.', priority: 'HIGH', status: 'CLOSED', ageHours: 24 * 15, assignee: staff2.id, est: 2500, cost: 3200 },
  ];
  for (const t of tickets) {
    const property = props[t.key as keyof typeof props];
    const created = hoursAgo(t.ageHours);
    const uId = t.unitNo ? unitId(t.key, t.unitNo) : null;
    const resolvedAt = ['RESOLVED', 'CLOSED'].includes(t.status) ? new Date(created.getTime() + Math.min(t.ageHours - 1, 40) * 3_600_000) : null;
    const closedAt = t.status === 'CLOSED' ? new Date(resolvedAt!.getTime() + 20 * 3_600_000) : null;
    const req = await prisma.maintenanceRequest.create({
      data: {
        propertyId: property.id,
        unitId: uId,
        tenantId: t.unitNo ? tenantOf(t.key, t.unitNo) : null,
        category: t.category,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedToId: t.assignee ?? null,
        vendorName: t.vendor ?? null,
        estimatedCost: t.est ?? null,
        actualCost: t.cost ?? null,
        slaDueAt: new Date(created.getTime() + SLA[t.priority] * 3_600_000),
        resolvedAt,
        closedAt,
        raisedById: manager.id,
        createdAt: created,
        updatedAt: closedAt ?? resolvedAt ?? created,
      },
    });
    await prisma.maintenanceComment.create({ data: { requestId: req.id, userId: manager.id, comment: t.description, createdAt: created } });
    if (t.assignee) await prisma.maintenanceComment.create({ data: { requestId: req.id, userId: manager.id, comment: `Assigned to ${t.assignee === staff1.id ? 'Staff 1' : 'Staff 2'}`, createdAt: new Date(created.getTime() + 3_600_000) } });
    if (resolvedAt) await prisma.maintenanceComment.create({ data: { requestId: req.id, userId: t.assignee ?? manager.id, comment: 'Work completed.', oldStatus: 'IN_PROGRESS', newStatus: 'RESOLVED', createdAt: resolvedAt } });
    if (closedAt && t.cost) {
      await prisma.maintenanceComment.create({ data: { requestId: req.id, userId: manager.id, comment: 'Checked with the tenant. Closing.', oldStatus: 'RESOLVED', newStatus: 'CLOSED', createdAt: closedAt } });
      await prisma.expense.create({ data: { propertyId: property.id, unitId: uId, maintenanceRequestId: req.id, category: 'MAINTENANCE', amount: t.cost, expenseDate: new Date(`${closedAt.toISOString().slice(0, 10)}T00:00:00.000Z`), paidTo: t.assignee === staff1.id ? 'Staff 1' : 'Staff 2', notes: `Ticket #${req.ticketNo}: ${t.title}`, createdById: manager.id } });
    }
  }

  // ── Monthly running expenses ────────────────────────────────────────────────
  const monthly: { key: string; category: 'UTILITY' | 'SALARY' | 'VENDOR' | 'ADMIN' | 'INSURANCE'; amount: number; paidTo: string; day: number }[] = [
    { key: 'sun', category: 'UTILITY', amount: 64000, paidTo: 'Electricity board (common areas)', day: 6 },
    { key: 'sun', category: 'SALARY', amount: 108000, paidTo: 'Security + housekeeping staff', day: 1 },
    { key: 'sun', category: 'VENDOR', amount: 42000, paidTo: 'Lift AMC vendor', day: 8 },
    { key: 'sun', category: 'ADMIN', amount: 18000, paidTo: 'Society office', day: 3 },
    { key: 'grn', category: 'UTILITY', amount: 52000, paidTo: 'Electricity board (common areas)', day: 6 },
    { key: 'grn', category: 'SALARY', amount: 96000, paidTo: 'Security + housekeeping staff', day: 1 },
    { key: 'grn', category: 'VENDOR', amount: 26000, paidTo: 'Garden maintenance', day: 9 },
    { key: 'cty', category: 'UTILITY', amount: 71000, paidTo: 'Electricity board (common areas)', day: 6 },
    { key: 'cty', category: 'SALARY', amount: 84000, paidTo: 'Security staff', day: 1 },
    { key: 'cty', category: 'INSURANCE', amount: 12500, paidTo: 'Property insurance (monthly)', day: 4 },
  ];
  const expenseRows: object[] = [];
  for (let back = 3; back >= 0; back--) {
    const p = period(firstOfMonth(T, -back));
    for (const e of monthly) {
      const d = dueDate(p, e.day);
      if (d > T) continue;
      expenseRows.push({ propertyId: props[e.key as keyof typeof props].id, category: e.category, amount: e.amount + back * 750, expenseDate: d, paidTo: e.paidTo, mode: 'BANK', createdById: manager.id });
    }
  }
  await prisma.expense.createMany({ data: expenseRows as never });

  // ── Customer A's portal login + activity history for Unit 101 ──────────────
  await user('customer.a@demo.test', 'Customer A', 'TENANT', { tenantId: a.tenantId });
  const u101 = unitId('sun', '101');
  const logs = [
    { entityType: 'UNIT', entityId: u101, action: 'create', summary: 'Unit created in bulk (101–1010)', createdAt: addDays(T, -400), userId: manager.id },
    { entityType: 'LEASE', entityId: prevLease.id, action: 'activate', summary: 'Lease activated · unit 101 is now Occupied by Customer A', createdAt: prevStart, userId: manager.id },
    { entityType: 'LEASE', entityId: a.leaseId, action: 'renew', summary: 'Lease renewed at ₹20,000/month (+5.3%)', createdAt: a.start, userId: manager.id },
  ];
  await prisma.activityLog.createMany({ data: logs.map((l) => ({ ...l, companyId: company.id })) });
  const entries101 = await prisma.rentEntry.findMany({ where: { unitId: u101 }, orderBy: { period: 'asc' } });
  for (const e of entries101) {
    await prisma.activityLog.create({ data: { companyId: company.id, userId: ownerAUser.id, entityType: 'RENT', entityId: e.id, action: 'mark_paid', summary: `${e.period} rent ₹20,000 marked Paid (${e.mode})`, createdAt: e.updatedAt } });
  }

  // ── A few notifications for the manager's bell ──────────────────────────────
  await prisma.notification.createMany({
    data: [
      { userId: manager.id, type: 'RENT_OVERDUE', title: 'Rent overdue · Unit 102', message: 'Customer B has not paid ₹18,000 for this month.', link: `/rent?period=${thisPeriod}&status=OVERDUE`, createdAt: hoursAgo(30) },
      { userId: manager.id, type: 'LEASE_EXPIRING', title: 'Lease ends in 26 days · Unit 104', message: 'Customer C’s lease at Sunrise Residency ends soon. Start the renewal.', link: '/leases', createdAt: hoursAgo(20) },
      { userId: manager.id, type: 'TICKET_SLA', title: 'SLA breached · Lift stuck at floor 3', message: 'Sunrise Residency · common area · unassigned', link: '/maintenance', createdAt: hoursAgo(2) },
    ],
  });

  const counts = await Promise.all([prisma.unit.count(), prisma.tenant.count(), prisma.lease.count(), prisma.rentEntry.count(), prisma.maintenanceRequest.count()]);
  console.log(`Done: ${counts[0]} units, ${counts[1]} tenants, ${counts[2]} leases, ${counts[3]} rent entries, ${counts[4]} tickets.`);
  console.log(`\nSign in with any of these (password ${PASSWORD}):`);
  console.log('  admin@demo.test · manager@demo.test · finance@demo.test · staff1@demo.test · owner.a@demo.test · customer.a@demo.test (tenant portal)');
  void admin;
  void enteredBy;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
