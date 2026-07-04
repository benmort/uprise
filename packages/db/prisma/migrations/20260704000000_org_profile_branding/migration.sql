-- Branding + public-profile fields on OrgProfile (one per tenant). Additive + idempotent;
-- applied with `prisma migrate deploy`. Logos come in two shapes (block ≈square, landscape)
-- plus favicon + hero; colours are hex strings; customCss for white-label styling.
ALTER TABLE tenant."OrgProfile"
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "logoBlockUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "logoLandscapeUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "faviconUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryColour" TEXT,
  ADD COLUMN IF NOT EXISTS "secondaryColour" TEXT,
  ADD COLUMN IF NOT EXISTS "customCss" TEXT;
