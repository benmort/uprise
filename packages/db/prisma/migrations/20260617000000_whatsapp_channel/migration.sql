-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ConsentState" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- AlterEnum
ALTER TYPE "BlastRecipientStatus" ADD VALUE 'READ';

-- DropIndex
DROP INDEX "ConversationState_contactId_key";

-- DropIndex
DROP INDEX "ConversationState_organizationId_contactPhone_key";

-- AlterTable
ALTER TABLE "Blast" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
ADD COLUMN     "contentSid" TEXT,
ADD COLUMN     "contentVariableMap" JSONB;

-- AlterTable
ALTER TABLE "BlastRecipient" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS';

-- AlterTable
ALTER TABLE "ConversationState" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS';

-- AlterTable
ALTER TABLE "InboundMessage" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
ADD COLUMN     "mediaContentType" TEXT,
ADD COLUMN     "mediaUrl" TEXT;

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
ADD COLUMN     "mediaContentType" TEXT,
ADD COLUMN     "mediaUrl" TEXT;

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "state" "ConsentState" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentSid" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "variables" JSONB,
    "bodyPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactConsent_organizationId_channel_state_idx" ON "ContactConsent"("organizationId", "channel", "state");

-- CreateIndex
CREATE INDEX "ContactConsent_contactId_idx" ON "ContactConsent"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_organizationId_phoneE164_channel_key" ON "ContactConsent"("organizationId", "phoneE164", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappTemplate_contentSid_key" ON "WhatsappTemplate"("contentSid");

-- CreateIndex
CREATE INDEX "WhatsappTemplate_organizationId_status_idx" ON "WhatsappTemplate"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ConversationState_contactId_idx" ON "ConversationState"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_organizationId_contactPhone_channel_key" ON "ConversationState"("organizationId", "contactPhone", "channel");

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
