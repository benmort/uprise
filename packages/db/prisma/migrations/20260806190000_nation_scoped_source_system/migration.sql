-- Nation-scope NationBuilder identity mappings. NB person ids are per-nation sequential
-- integers, but ContactSourceRecord's unique is (tenantId, sourceSystem, externalId) with
-- sourceSystem the constant 'nation_builder' — so person 123 in two nations connected by
-- one tenant collapsed onto one mapping row. Harmless-ish for pull; catastrophic for the
-- coming push (activity written to the WRONG nation's person). New records are written as
-- 'nation_builder:<slug>'; this backfill scopes the legacy rows wherever it can do so
-- unambiguously: tenants holding exactly ONE NationBuilder connection.
--
-- Tenants with several nations keep their legacy 'nation_builder' rows as-is — ambiguous
-- by construction. The push identity ladder treats unscoped rows as unverified (it
-- re-matches via the nation's people/match before trusting them), and the next pull
-- through each connection rewrites its people's mappings in scoped form.
UPDATE audience."ContactSourceRecord" csr
SET "sourceSystem" = 'nation_builder:' || single."externalGroup"
FROM (
  SELECT "tenantId", MIN("externalGroup") AS "externalGroup"
  FROM integration."IntegrationConnection"
  WHERE "type" = 'NATION_BUILDER' AND "externalGroup" <> ''
  GROUP BY "tenantId"
  HAVING COUNT(*) = 1
) single
WHERE csr."sourceSystem" = 'nation_builder'
  AND csr."tenantId" = single."tenantId";
