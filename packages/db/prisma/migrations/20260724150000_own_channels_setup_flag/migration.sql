-- Own-channels setup visibility: growth/scale plans ON, grassroots/starter OFF.
-- Guarded merges so a manual per-env edit survives re-running.
UPDATE "payment"."Plan" SET "featureFlags" = "featureFlags" || '{"FEATURE_OWN_CHANNELS_SETUP": true}'::jsonb
WHERE "key" IN ('growth', 'scale') AND NOT ("featureFlags" ? 'FEATURE_OWN_CHANNELS_SETUP');
UPDATE "payment"."Plan" SET "featureFlags" = "featureFlags" || '{"FEATURE_OWN_CHANNELS_SETUP": false}'::jsonb
WHERE "key" IN ('grassroots', 'starter') AND NOT ("featureFlags" ? 'FEATURE_OWN_CHANNELS_SETUP');
