-- Area address-count lookups (geo.areaDetail) join geo.address_region on the ASGS
-- level's code column. mb_code + sa1_code are already indexed in the init migration;
-- sa2_code + sa3_code were not, so the detail count would seq-scan the ~17M-row table.
-- Additive + idempotent — safe to run via `prisma migrate deploy` on the raw geo schema.
CREATE INDEX IF NOT EXISTS address_region_sa2_idx ON geo.address_region (sa2_code);
CREATE INDEX IF NOT EXISTS address_region_sa3_idx ON geo.address_region (sa3_code);
