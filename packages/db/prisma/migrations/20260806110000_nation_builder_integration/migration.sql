-- NationBuilder joins the integration providers. A nation (slug) is the group analogue:
-- each nation has its own API token + endpoint, mirroring Action Network's key-per-group.
-- ADD VALUE only — a new enum value cannot be USED in the transaction that adds it.
ALTER TYPE integration."IntegrationType" ADD VALUE IF NOT EXISTS 'NATION_BUILDER';
ALTER TYPE audience."AudienceSource" ADD VALUE IF NOT EXISTS 'NATION_BUILDER';
