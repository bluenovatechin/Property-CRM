import { Role } from '@prisma/client';

const ADMIN_MANAGER: Role[] = ['SUPER_ADMIN', 'MANAGER'];
/** People who run properties day to day: the company (admin, manager) and the owner themself. */
const RUNS_PROPERTIES: Role[] = ['SUPER_ADMIN', 'MANAGER', 'OWNER'];
const MONEY: Role[] = ['SUPER_ADMIN', 'MANAGER', 'OWNER', 'FINANCE'];

/**
 * Who may do what (each endpoint declares one with @Can).
 * Which records they see is decided by ScopeService:
 *   Super Admin / Manager → the whole company
 *   Owner                 → their own properties
 *   Owner's finance/staff → that owner's properties (staff: only tickets assigned to them)
 *   Tenant                → only their own lease, rent and requests (portal)
 */
export const PERMS = {
  /** Invite and manage people. Admin: everyone · Manager: owners, staff, finance · Owner: their own staff & finance. */
  'team:manage': RUNS_PROPERTIES,
  'admin:all': ['SUPER_ADMIN'],
  'properties:read': ['SUPER_ADMIN', 'MANAGER', 'OWNER', 'FINANCE', 'STAFF'],
  'properties:write': RUNS_PROPERTIES,
  'units:write': RUNS_PROPERTIES,
  'owners:read': MONEY,
  'owners:write': ADMIN_MANAGER,
  'tenants:read': MONEY,
  'tenants:write': RUNS_PROPERTIES,
  'leases:read': MONEY,
  'leases:write': RUNS_PROPERTIES,
  'rent:read': MONEY,
  'rent:write': MONEY,
  'maintenance:read': ['SUPER_ADMIN', 'MANAGER', 'OWNER', 'FINANCE', 'STAFF'],
  'maintenance:write': ['SUPER_ADMIN', 'MANAGER', 'OWNER', 'STAFF'],
  'maintenance:assign': RUNS_PROPERTIES,
  'expenses:read': MONEY,
  'expenses:write': MONEY,
  'dashboard:read': MONEY,
  'reports:read': MONEY,
  'activity:read': ADMIN_MANAGER,
  'search:use': MONEY,
  'jobs:run': ['SUPER_ADMIN'],
  portal: ['TENANT'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMS;

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMS) as Permission[]).filter((p) => (PERMS[p] as Role[]).includes(role));
}
