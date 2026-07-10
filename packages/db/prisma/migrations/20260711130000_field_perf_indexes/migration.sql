-- Field canvasser hot-path indexes. Additive; applied with `prisma migrate deploy`.

-- listAssignments resolves turf.walkLists by filtering WalkList.turfId — previously
-- unindexed (only [tenantId, campaignId]) so every assigned turf did a seq scan.
CREATE INDEX IF NOT EXISTS "WalkList_turfId_idx" ON canvass."WalkList" ("turfId");

-- getVolunteerMetrics groups QuestionResponse by contact filtered on recordedById +
-- channel + createdAt — previously unindexed on recordedById (two scans per header load).
CREATE INDEX IF NOT EXISTS "QuestionResponse_recordedBy_idx"
  ON canvass."QuestionResponse" ("tenantId", "recordedById", "channel", "createdAt");

-- Contact door-search uses ILIKE '%q%' on name/address (leading wildcard → no btree).
-- Trigram GIN indexes make those index-served. pg_trgm is already installed (geo).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Contact_firstName_trgm_idx" ON public."Contact" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_lastName_trgm_idx"  ON public."Contact" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_address_trgm_idx"   ON public."Contact" USING gin ("address" gin_trgm_ops);
