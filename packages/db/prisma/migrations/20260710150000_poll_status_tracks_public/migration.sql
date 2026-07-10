-- Poll.status was defined but never transitioned, so a poll an organiser had made public still
-- read "Draft". status now tracks visibility (public ⇒ PUBLISHED), enforced in
-- InsightsService.setPollPublic. Bring existing rows in line so the badge is truthful.
-- Idempotent; applied with `prisma migrate deploy`.
UPDATE "insights"."Poll"
   SET "status" = 'PUBLISHED',
       "publishedAt" = COALESCE("publishedAt", now())
 WHERE "isPublic" = true
   AND "status" <> 'PUBLISHED';
