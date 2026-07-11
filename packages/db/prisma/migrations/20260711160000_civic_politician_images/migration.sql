-- Politician headshots, mirrored from Wikimedia Commons into our own Blob store.
-- Additive + guarded; applied with `prisma migrate deploy` (never `migrate dev`).
--
-- The photo itself is re-hosted (imageUrl), but Commons licences require the credit to
-- travel with it: imageSourceUrl (the file page), imageCredit (author) and imageLicence.
-- imageSourceRef is the source filename — the idempotency key a re-sync compares against
-- so an unchanged photo is never re-fetched or re-uploaded.

ALTER TABLE "civic"."Politician"
  ADD COLUMN IF NOT EXISTS "imageUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "imageSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "imageCredit"    TEXT,
  ADD COLUMN IF NOT EXISTS "imageLicence"   TEXT,
  ADD COLUMN IF NOT EXISTS "imageSourceRef" TEXT;
