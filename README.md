# Property Management CRM

One platform for **properties, units, tenants, leases, monthly rent, maintenance, expenses and reports** — built from the BlueNova project brief and the SRS in [`docs/`](docs/).

| Part | Stack |
| --- | --- |
| API | NestJS 10 · TypeScript · Prisma 5 · PostgreSQL 17 · JWT in httpOnly cookies · Zod validation |
| Web | React 18 · Vite · TypeScript · TanStack Query · React Router · design tokens from the Figma library |
| Jobs | `@nestjs/schedule` daily at 00:30 IST (overdue rent, reminders, lease expiry, SLA alerts) |
| Email | SMTP (Resend recommended). In development emails are printed to the API console. |

---

## 1. Run it locally

You need **Node.js 20+** only. PostgreSQL runs from npm (no installer, no Docker).

```bash
npm install                 # installs both apps (also generates the Prisma client)
cp apps/api/.env.example apps/api/.env

# Terminal 1 — local PostgreSQL on port 5433 (keep it running)
npm run db:start

# Terminal 2 — create tables + demo data (first time, or to reset the demo)
npm run db:setup

# Terminal 2 — API on http://localhost:3000/api/v1
npm run dev:api

# Terminal 3 — web app on http://localhost:5174
npm run dev:web
```

Open **http://localhost:5174**. The web dev server forwards `/api` to the API, so cookies work without CORS setup.

### Demo accounts (password `Password@123`)

| Email | Role | What to try |
| --- | --- | --- |
| admin@demo.test | Super Admin | Users & roles, activity log, everything |
| manager@demo.test | Property Manager | Dashboard, unit grid, leases, rent, maintenance |
| finance@demo.test | Finance | Rent, expenses, reports (no maintenance writes) |
| staff1@demo.test | Maintenance Staff | Only tickets assigned to them |
| owner.a@demo.test | Owner | Own 2 properties; can enter monthly rent |
| customer.a@demo.test | Tenant | Mobile tenant portal (lease, rent, requests) |

Demo data: Sunrise Residency (100 flats, the brief's §8 example), Green Park (80 flats), City Mall (60 shops), ~200 tenants and leases, 4 months of rent, 19 tickets. All dates are relative to today, so overdue rent and expiring leases always look current. `npm run db:setup` again resets everything.

---

## 2. Project structure

```
apps/
  api/
    prisma/schema.prisma        18 tables (SRS §6) + migrations + seed.ts
    scripts/dev-db.mjs          local embedded PostgreSQL
    src/
      main.ts, app.module.ts    bootstrap, global guard, routes under /api/v1
      common/                   auth guard + permissions, scoping, validation, errors,
                                activity log, mail, notifications, helpers
      modules/                  auth, users, owners, properties (+ bulk units), units,
                                tenants (+ portal invites), leases, rent, maintenance,
                                expenses, reports (+ dashboard), portal, jobs, misc
  web/
    src/
      lib/                      api client (auto refresh), auth, formatting, types
      components/               layout (sidebar, search, notifications), UI kit, icons
      pages/                    one file per screen of the prototype
docs/                           project brief + SRS (Word)
```

## 3. How the important rules are enforced

| Rule (SRS) | Where |
| --- | --- |
| Role permissions (§2.2) | `common/permissions.ts` + `@Can()` on every endpoint, checked in `common/auth.ts` |
| Which data a user sees (Manager → assigned properties, Owner → own, Staff → assigned tickets, Tenant → self) | `common/scope.service.ts` |
| One active lease per unit | service check + partial unique index (`prisma/migrations/*one_active_lease*`) |
| Lease activation sets unit Occupied + tenant Active; ending sets Vacant/Previous | `modules/leases.ts` |
| Rent entered manually by owner; one entry per unit per month; Paid needs date + mode | `modules/rent.ts` |
| Pending past due → Overdue; reminders 3 days before due; expiry alerts 60/30/7 days | `modules/jobs.ts` (daily) |
| Ticket workflow Open → In progress → Resolved → Closed (+ Reopen/Cancel); SLA by priority; closing cost → expense | `modules/maintenance.ts` |
| Login lockout after 5 tries, 15-min access + rotating 7-day refresh token | `modules/auth.ts` |
| Activity log for every important change; soft delete | `common/activity.service.ts`, `deletedAt` columns |

Run the daily jobs on demand (Super Admin): `POST /api/v1/jobs/run`.

## 4. Deploying (free tier)

1. **Database — Neon**: Connect → turn **Connection pooling off** → copy the full `postgresql://…?sslmode=require` string.
2. **API — Render**: New → **Blueprint** → this repo. `render.yaml` sets the build/start commands and generates the JWT secrets; you paste only `DATABASE_URL` (Neon) and `APP_URL` (your Vercel address).
3. **Web — Vercel**: put your Render address in `apps/web/vercel.json`, push, then import the repo with Root Directory `apps/web`. Vercel forwards `/api/*` to Render, so the login cookie stays first-party.
4. **Keeping Render Free Tier Awake**: Render spins down inactive free instances after 15 minutes. The API now includes an automatic keep-alive cron that self-pings `/api/v1/health` every 10 minutes (using Render's `RENDER_EXTERNAL_URL`). For 100% reliability if the instance ever stops or reboots, configure a free monitor like [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) to ping `https://<your-render-api>.onrender.com/api/v1/health` every 10–14 minutes.
5. Optional demo data on Neon: run `npm run db:seed -w apps/api` locally with `DATABASE_URL` set to the Neon string (erases data).

### Reset to an empty system (only the 6 demo logins)

```bash
npm run db:clean -w apps/api
```

Erases ALL data in the database that `DATABASE_URL` points to and creates only the six demo logins (password `Password@123`). Every section starts empty; one owner profile (Owner A) and one tenant profile (Customer A) exist so those two logins work. For the full sample data instead, use `npm run db:seed -w apps/api`.

A step-by-step guide for users is in [docs/Property CRM - User Guide.docx](docs/).

### First login on a new database (no demo data)

Point `DATABASE_URL` in `apps/api/.env` at the database (e.g. Neon), then:

```bash
npx tsx apps/api/scripts/create-admin.ts --email you@company.com --name "Your Name" --company "BlueNova Properties" --password "YourPass@123"
```

It only adds a company + Super Admin and never deletes data. Sign in with that email on the website.

### Giving people access

- **Staff / Finance / Owners:** Users & roles → Invite user → pick role (and properties, or the owner profile).
- **Tenants:** add the tenant (with email) → create their lease and tick "Email a tenant portal invite", or open the tenant → Send portal invite.
- No email service configured (`SMTP_HOST` empty)? The app shows the invite link instead — copy it or share it on WhatsApp. The link works once and expires in 48 hours.

GitHub Pages can host only the web part and breaks login cookies across domains — use Vercel.

## 5. Status

**Done (Phase 1 / MVP):** login + roles, users & invites, properties, owners, units (grid, bulk add), tenants, leases (wizard, renew, terminate, auto-expire), manual monthly rent, maintenance board, expenses, dashboard, 9 reports with CSV, global search, notifications (in-app + email), activity log, tenant portal.

**Reserved for later:**
- Payment processing (partial payments, receipts, online pay) — tables `Payment` and `PaymentAllocation` exist; to be built by the senior developer.
- Document uploads (S3/R2) — `Document` table exists; UI shows a placeholder.
- Owner portal, SMS/WhatsApp, late fees/GST, photos on tickets.

## 6. Useful commands

```bash
npm run typecheck                  # both apps
npm run build                      # production builds
npm run db:studio -w apps/api      # browse the database in the browser
npx prisma migrate dev -w apps/api # after editing schema.prisma
```
