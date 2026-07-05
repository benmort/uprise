-- QA-review flag resolution. Additive. Hand-written (migrate deploy) so the raw partial
-- unique indexes elsewhere are untouched.

-- Records an organiser actioning a computed QA flag (no-GPS / too-fast cadence). Keyed by
-- (doorKnockId, kind) because one knock can raise both kinds. No FKs (id-only cross-domain).
CREATE TABLE "canvass"."QaFlagResolution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "doorKnockId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESOLVED',
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaFlagResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaFlagResolution_doorKnockId_kind_key" ON "canvass"."QaFlagResolution"("doorKnockId", "kind");
CREATE INDEX "QaFlagResolution_tenantId_campaignId_idx" ON "canvass"."QaFlagResolution"("tenantId", "campaignId");
