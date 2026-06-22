-- Org records & user profiles (meld doc 11). Additive: org-record aggregate
-- (tenant schema) + user profile/avatars (iam schema).

CREATE TABLE "tenant"."OrgProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrgProfile_tenantId_idx" ON "tenant"."OrgProfile" ("tenantId");

CREATE TABLE "tenant"."OrgContact" (
    "id" TEXT NOT NULL,
    "orgProfileId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobilePhone" TEXT,
    "title" TEXT,
    "role" TEXT,
    "contactType" TEXT,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "isAuthorisedSignatory" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OrgContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrgContact_orgProfileId_idx" ON "tenant"."OrgContact" ("orgProfileId");
ALTER TABLE "tenant"."OrgContact" ADD CONSTRAINT "OrgContact_orgProfileId_fkey" FOREIGN KEY ("orgProfileId") REFERENCES "tenant"."OrgProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tenant"."OrgAddress" (
    "id" TEXT NOT NULL,
    "orgProfileId" TEXT NOT NULL,
    "addressType" TEXT,
    "line1" TEXT,
    "line2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postcode" TEXT,
    CONSTRAINT "OrgAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrgAddress_orgProfileId_idx" ON "tenant"."OrgAddress" ("orgProfileId");
ALTER TABLE "tenant"."OrgAddress" ADD CONSTRAINT "OrgAddress_orgProfileId_fkey" FOREIGN KEY ("orgProfileId") REFERENCES "tenant"."OrgProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tenant"."OrgCredential" (
    "id" TEXT NOT NULL,
    "orgProfileId" TEXT NOT NULL,
    "legalTradingName" TEXT,
    "australianBusinessNumber" TEXT,
    "australianCompanyNumber" TEXT,
    "taxFileNumber" TEXT,
    "industry" TEXT,
    "entityType" TEXT,
    "registrationNumber" TEXT,
    "isRegisteredEntity" BOOLEAN NOT NULL DEFAULT false,
    "acncRegistrationNumber" TEXT,
    "acncStatus" TEXT,
    "charitySubtype" TEXT,
    "deductibleGiftRecipient" BOOLEAN NOT NULL DEFAULT false,
    "dgrStatus" TEXT,
    "financialYearEnd" TEXT,
    CONSTRAINT "OrgCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgCredential_orgProfileId_key" ON "tenant"."OrgCredential" ("orgProfileId");
ALTER TABLE "tenant"."OrgCredential" ADD CONSTRAINT "OrgCredential_orgProfileId_fkey" FOREIGN KEY ("orgProfileId") REFERENCES "tenant"."OrgProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "iam"."UserProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "givenName" TEXT,
    "familyName" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "iam"."UserAvatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserAvatar_userId_idx" ON "iam"."UserAvatar" ("userId");
