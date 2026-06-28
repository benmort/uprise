-- Plan: marketing/pricing + visibility + enforced limits (additive).
ALTER TABLE "payment"."Plan"
  ADD COLUMN IF NOT EXISTS "publiclyVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "popular" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "priceMonthly" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceMonthlyOriginal" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceAnnually" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceAnnuallyOriginal" INTEGER,
  ADD COLUMN IF NOT EXISTS "limits" JSONB,
  ADD COLUMN IF NOT EXISTS "features" JSONB;
