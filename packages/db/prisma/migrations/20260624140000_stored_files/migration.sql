-- File manager domain (tenant-scoped). Additive.

CREATE TABLE "tenant"."StoredFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "folder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoredFile_tenantId_folder_idx" ON "tenant"."StoredFile" ("tenantId", "folder");

ALTER TABLE "tenant"."StoredFile"
    ADD CONSTRAINT "StoredFile_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
