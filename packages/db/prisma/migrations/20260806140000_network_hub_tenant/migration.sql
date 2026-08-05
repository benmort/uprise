-- Which tenant is the network organisation's own hub (vs its client campaigns).
-- Surfaced as a "Network" chip on the hub's row in the switcher / select-organisation.
ALTER TABLE tenant."Network" ADD COLUMN IF NOT EXISTS "hubTenantId" TEXT;
