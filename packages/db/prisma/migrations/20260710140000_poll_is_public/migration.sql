-- Cross-tenant visibility for polls: a first-class, reversible `isPublic` flag. A tenant-owned
-- poll stays private to its tenant until an OWNER/ORGANISER of that tenant (or a super-admin)
-- makes it public, at which point every tenant can read it. Kept separate from tenantId so
-- ownership survives publishing. Additive; applied with `prisma migrate deploy`.
ALTER TABLE "insights"."Poll" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
