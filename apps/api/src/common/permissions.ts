import { Role } from '@prisma/client';

const ADMIN_MANAGER: Role[] = ['SUPER_ADMIN', 'MANAGER'];
const OFFICE: Role[] = ['SUPER_ADMIN', 'MANAGER', 'FINANCE'];

/**
 * Role-based permissions (SRS 2.2). Each endpoint declares one of these with @Can(...).
 * Which records a user may see is decided separately by ScopeService (property scope).
 */
export const PERMS = {
  'users:manage': ['SUPER_ADMIN'],
  'properties:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER', 'STAFF'],
  'properties:write': ADMIN_MANAGER,
  'units:write': ADMIN_MANAGER,
  'owners:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'owners:write': ADMIN_MANAGER,
  'tenants:read': OFFICE,
  'tenants:write': ADMIN_MANAGER,
  'leases:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'leases:write': ADMIN_MANAGER,
  'rent:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'rent:write': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'maintenance:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'STAFF', 'OWNER'],
  'maintenance:write': ['SUPER_ADMIN', 'MANAGER', 'STAFF'],
  'maintenance:assign': ADMIN_MANAGER,
  'expenses:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'expenses:write': OFFICE,
  'dashboard:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'reports:read': ['SUPER_ADMIN', 'MANAGER', 'FINANCE', 'OWNER'],
  'activity:read': ADMIN_MANAGER,
  'search:use': OFFICE,
  'jobs:run': ['SUPER_ADMIN'],
  portal: ['TENANT'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMS;

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMS) as Permission[]).filter((p) => (PERMS[p] as Role[]).includes(role));
}
