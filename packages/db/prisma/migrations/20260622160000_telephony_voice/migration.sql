-- Telephony: voice calls (meld doc 09). Additive: telephony schema + Call model.
CREATE SCHEMA IF NOT EXISTS "telephony";

CREATE TYPE "telephony"."CallStatus" AS ENUM ('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED');

CREATE TABLE "telephony"."Call" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "status" "telephony"."CallStatus" NOT NULL DEFAULT 'INITIATED',
    "providerCallId" TEXT,
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Call_providerCallId_key" ON "telephony"."Call" ("providerCallId");
CREATE INDEX "Call_tenantId_status_idx" ON "telephony"."Call" ("tenantId", "status");
