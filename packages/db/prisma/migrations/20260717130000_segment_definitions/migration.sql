-- Segment definitions (engine v2) — additive; applied with `prisma migrate deploy`.
--
-- 1) Extends AudienceSegment for the slingshot-ported engine: a version counter,
--    the deterministic-order seed (preview == send), archive + staleness stamps.
--    Legacy segments keep NULL/default values and route to the legacy evaluator.
-- 2) Adds AudienceKind.DYNAMIC_SEGMENT — the container audience behind one v2
--    segment, so blasts target segments with no targeting-model change.
--    (`ALTER TYPE … ADD VALUE` is txn-legal on PG12+ but the value must not be
--    used in this same migration — nothing here INSERTs with it.)
-- 3) Adds the masked view `audience.contacts_safe` + the restricted Postgres
--    role `uprise_segment_query_ro` for the AI custom-query lane: the executor
--    SETs LOCAL ROLE so an AI-authored predicate can only ever SELECT non-PII
--    columns of this view (defence layer 2 of 3 — see custom-query.service).
-- 4) A partial index for the fatigue mechanic's rolling-window scan.

-- ── AudienceSegment: engine-v2 columns ─────────────────────────────────────
ALTER TABLE "audience"."AudienceSegment"
  ADD COLUMN IF NOT EXISTS "version"         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "seed"            TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastEvaluatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdById"     TEXT;
CREATE INDEX IF NOT EXISTS "AudienceSegment_tenantId_archivedAt_idx"
  ON "audience"."AudienceSegment"("tenantId", "archivedAt");

-- ── AudienceKind: the v2 container kind ────────────────────────────────────
ALTER TYPE "audience"."AudienceKind" ADD VALUE IF NOT EXISTS 'DYNAMIC_SEGMENT';

-- ── Fatigue window scan (blast sends per contact in a rolling window) ──────
CREATE INDEX IF NOT EXISTS "BlastRecipient_contactId_sentAt_idx"
  ON "messaging"."BlastRecipient"("contactId", "sentAt")
  WHERE "sentAt" IS NOT NULL;

-- ── The masked view for the AI custom-query lane ───────────────────────────
-- Non-PII predicate columns only: reachability FLAGS (never the address/number),
-- provenance, tenure, turf, and the G-NAF location join. No name, no email, no
-- phone. tenant_id is exposed so the EXECUTOR (never the model) can AND the
-- mandatory tenant filter.
CREATE OR REPLACE VIEW "audience"."contacts_safe" AS
SELECT
  c."id"                                AS contact_id,
  c."tenantId"                          AS tenant_id,
  (c."email" IS NOT NULL)               AS has_email,
  (c."phoneE164" IS NOT NULL)           AS has_phone,
  lower(split_part(c."email", '@', 2))  AS email_domain,
  c."createdAt"                         AS created_at,
  c."turfId"                            AS turf_id,
  g."state"                             AS state,
  g."postcode"                          AS postcode,
  g."locality"                          AS locality
FROM "public"."Contact" c
LEFT JOIN "geo"."gnaf_address" g ON g."gnaf_pid" = c."gnafPid";

-- ── The restricted role the custom-query executor assumes ──────────────────
-- SELECT on the masked view ONLY (view-owner privileges cover the underlying
-- tables, so the role itself can touch nothing else). Granted to the migration
-- user so the app connection may SET LOCAL ROLE into it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uprise_segment_query_ro') THEN
    CREATE ROLE "uprise_segment_query_ro" NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA "audience" TO "uprise_segment_query_ro";
GRANT SELECT ON "audience"."contacts_safe" TO "uprise_segment_query_ro";
DO $$
BEGIN
  EXECUTE format('GRANT "uprise_segment_query_ro" TO %I', current_user);
END
$$;
