-- Backfill: the original creator (earliest member) of each existing tenant becomes OWNER.
-- The creation flows add the creator as the first TenantMember, so the earliest row per
-- tenant is the workspace owner. Idempotent: only promotes rows not already OWNER.
UPDATE "tenant"."TenantMember" tm
SET "role" = 'OWNER'
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "userId"
  FROM "tenant"."TenantMember"
  ORDER BY "tenantId", "createdAt" ASC, "userId" ASC
) first
WHERE tm."tenantId" = first."tenantId"
  AND tm."userId" = first."userId"
  AND tm."role" <> 'OWNER';
