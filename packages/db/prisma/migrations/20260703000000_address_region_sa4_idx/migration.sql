-- The Areas explorer added an SA4 tab, so areaDetail(sa4, …) counts addresses via
-- geo.address_region.sa4_code. Every other region column (ced/sed/lga/mb/sa1/sa2/sa3)
-- is indexed; sa4_code was not, so its count would seq-scan the ~17M-row table.
-- Additive + idempotent — safe under `prisma migrate deploy`.
CREATE INDEX IF NOT EXISTS address_region_sa4_idx ON geo.address_region (sa4_code);
