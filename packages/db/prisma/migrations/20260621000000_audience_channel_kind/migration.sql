-- Audience channel + kind: lets audiences be tagged per messaging channel and lets a
-- "smart" WhatsApp opt-in audience resolve dynamically. Additive + defaulted (no backfill).

-- CreateEnum
CREATE TYPE "AudienceChannel" AS ENUM ('SMS', 'WHATSAPP', 'ALL');
CREATE TYPE "AudienceKind" AS ENUM ('STATIC', 'WHATSAPP_OPTED_IN');

-- AlterTable
ALTER TABLE "Audience" ADD COLUMN "channel" "AudienceChannel" NOT NULL DEFAULT 'ALL';
ALTER TABLE "Audience" ADD COLUMN "kind" "AudienceKind" NOT NULL DEFAULT 'STATIC';
