-- Transactional messaging (meld doc 06). Additive: MessageKind/TxSmsStatus enums,
-- OutboundMessage kind/txStatus/purpose columns, and the MessageTemplate table.
CREATE TYPE "messaging"."MessageKind" AS ENUM ('MARKETING', 'TRANSACTIONAL');
CREATE TYPE "messaging"."TxSmsStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'UNDELIVERED', 'FAILED');

ALTER TABLE "messaging"."OutboundMessage" ADD COLUMN "kind" "messaging"."MessageKind" NOT NULL DEFAULT 'MARKETING';
ALTER TABLE "messaging"."OutboundMessage" ADD COLUMN "txStatus" "messaging"."TxSmsStatus";
ALTER TABLE "messaging"."OutboundMessage" ADD COLUMN "purpose" TEXT;
CREATE INDEX "OutboundMessage_tenantId_kind_sentAt_idx" ON "messaging"."OutboundMessage" ("tenantId", "kind", "sentAt");

CREATE TABLE "messaging"."MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "messaging"."MessageChannel" NOT NULL DEFAULT 'SMS',
    "kind" "messaging"."MessageKind" NOT NULL DEFAULT 'TRANSACTIONAL',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_tenantId_key_key" ON "messaging"."MessageTemplate" ("tenantId", "key");
