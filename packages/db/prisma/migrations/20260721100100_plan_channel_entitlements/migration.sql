-- Plan entitlements for own-channel provisioning: every plan except grassroots gets
-- per-tenant telephony + email identities. Each update is guarded on the key being
-- ABSENT so any manual per-environment override made in the plans editor survives.
UPDATE "payment"."Plan"
  SET "featureFlags" = "featureFlags" || '{"FEATURE_TENANT_TELEPHONY_ENABLED": true}'::jsonb
  WHERE "key" IN ('starter', 'growth', 'scale')
    AND NOT ("featureFlags" ? 'FEATURE_TENANT_TELEPHONY_ENABLED');

UPDATE "payment"."Plan"
  SET "featureFlags" = "featureFlags" || '{"FEATURE_TENANT_EMAIL_ENABLED": true}'::jsonb
  WHERE "key" IN ('starter', 'growth', 'scale')
    AND NOT ("featureFlags" ? 'FEATURE_TENANT_EMAIL_ENABLED');

-- Explicit false for grassroots: redundant against the default-false floor today, but
-- self-documenting and it guards a future default flip (matches the seed's style).
UPDATE "payment"."Plan"
  SET "featureFlags" = "featureFlags" || '{"FEATURE_TENANT_TELEPHONY_ENABLED": false}'::jsonb
  WHERE "key" = 'grassroots'
    AND NOT ("featureFlags" ? 'FEATURE_TENANT_TELEPHONY_ENABLED');

UPDATE "payment"."Plan"
  SET "featureFlags" = "featureFlags" || '{"FEATURE_TENANT_EMAIL_ENABLED": false}'::jsonb
  WHERE "key" = 'grassroots'
    AND NOT ("featureFlags" ? 'FEATURE_TENANT_EMAIL_ENABLED');
