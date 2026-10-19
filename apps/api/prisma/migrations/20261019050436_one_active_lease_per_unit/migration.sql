-- A unit can have at most one ACTIVE lease (SRS business rule 1).
CREATE UNIQUE INDEX "Lease_one_active_per_unit" ON "Lease" ("unitId") WHERE "status" = 'ACTIVE';

-- Fast case-insensitive search on tenant names (global search).
CREATE INDEX "Tenant_fullName_lower_idx" ON "Tenant" (lower("fullName"));
