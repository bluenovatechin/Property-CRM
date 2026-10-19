/**
 * Creates the first Super Admin login (and the company, if none exists) WITHOUT touching other data.
 * Use it on a fresh production database such as Neon.
 *
 *   npm run create-admin -w apps/api -- --email you@company.com --name "Your Name" --company "BlueNova Properties"
 *   (add --password "YourPass@123" to choose the password; otherwise a strong one is generated and printed)
 *
 * It uses DATABASE_URL from apps/api/.env — point that at Neon first.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import 'dotenv/config';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const companyName = arg('company')?.trim();
  const password = arg('password') ?? `${randomBytes(6).toString('base64url')}@9Aa`;

  if (!email || !name) {
    console.error('Usage: npm run create-admin -w apps/api -- --email you@company.com --name "Your Name" [--company "Company"] [--password "..."]');
    process.exit(1);
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) throw new Error(`A user with ${email} already exists.`);

    let company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!company) company = await prisma.company.create({ data: { name: companyName || 'My Property Company' } });
    else if (companyName && company.name !== companyName) company = await prisma.company.update({ where: { id: company.id }, data: { name: companyName } });

    await prisma.user.create({
      data: { companyId: company.id, email, name, role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash: await bcrypt.hash(password, 12) },
    });
    const host = (process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? 'database';
    console.log(`\n✔ Super Admin created in "${company.name}" on ${host}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}${arg('password') ? '' : '   (generated — change it after signing in)'}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`✖ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
