# 11 – Org Records & User Profiles (net-new)

M5, opportunistic. Two net-new sub-domains from prog: the AU-nonprofit **organisation record** (distinct from the `Tenant` boundary) and **user profiles/avatars**.

Source: `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/tenant/*` (`organisation_*_view`) and `services/identity/*` (`user_profile_view`, `user_avatar_view`).

## Org records (`tenant` schema)

The `OrgProfile` is the legal/operational record of the organisation a tenant represents – distinct from `Tenant` (the data-isolation boundary, doc 03). 1:1 translation of prog's `organisation_*_view` tables.

```prisma
model OrgProfile {
  id        String   @id @default(cuid())
  tenantId  String                                  // id-only ref to tenant.Tenant
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  contacts    OrgContact[]
  addresses   OrgAddress[]
  credential  OrgCredential?
  @@schema("tenant")
}

model OrgContact {
  id                   String  @id @default(cuid())
  orgProfileId         String
  firstName            String?
  lastName             String?
  email                String?
  phone                String?
  mobilePhone          String?
  title                String?
  role                 String?
  contactType          String?
  isPrimaryContact     Boolean @default(false)
  isAuthorisedSignatory Boolean @default(false)
  orgProfile           OrgProfile @relation(fields: [orgProfileId], references: [id], onDelete: Cascade)
  @@schema("tenant")
}

model OrgAddress {
  id           String  @id @default(cuid())
  orgProfileId String
  addressType  String?
  line1        String?
  line2        String?
  suburb       String?
  city         String?
  state        String?
  country      String?
  postcode     String?
  orgProfile   OrgProfile @relation(fields: [orgProfileId], references: [id], onDelete: Cascade)
  @@schema("tenant")
}

model OrgCredential {
  id                     String  @id @default(cuid())
  orgProfileId           String  @unique
  legalTradingName       String?
  australianBusinessNumber String?
  australianCompanyNumber  String?
  taxFileNumber          String?                      // ENCRYPTED at rest
  industry               String?
  entityType             String?
  registrationNumber     String?
  isRegisteredEntity     Boolean @default(false)
  acncRegistrationNumber String?
  acncStatus             String?
  charitySubtype         String?
  deductibleGiftRecipient Boolean @default(false)
  dgrStatus              String?
  financialYearEnd       String?
  orgProfile             OrgProfile @relation(fields: [orgProfileId], references: [id], onDelete: Cascade)
  @@schema("tenant")
}
```

Encrypt `taxFileNumber` at rest using the same util behind `IntegrationConnection.encryptedCredential` (`apps/api/src/integrations/credential-crypto.service.ts`).

Module `apps/api/src/org-profile/` – CRUD + outbox events on change (so payment can react to `org.credential.updated` to sync Stripe metadata). No FSM, no provider.

## User profiles/avatars (`iam` schema)

```prisma
model UserProfile {
  userId      String  @id                            // id-only ref to iam.User
  displayName String?
  givenName   String?
  familyName  String?
  phone       String?
  avatarUrl   String?
  bio         String?
  @@schema("iam")
}

model UserAvatar {
  id         String  @id @default(cuid())
  userId     String
  url        String
  isSelected Boolean @default(false)
  @@index([userId])
  @@schema("iam")
}
```

Fold into the IAM users module (doc 04) as `ProfileService` + `AvatarService`. Avatar selection sets one `isSelected = true` and siblings `false` in a `$transaction`.

## Verification

- CRUD unit tests; TFN round-trips through encrypt/decrypt and is never returned in plaintext over the API.
- avatar selection invariant: exactly one selected per user.

## Files

- `packages/db/prisma/schema.prisma` – org-record + profile/avatar models.
- `apps/api/src/org-profile/**` – new module.
- IAM users module (doc 04) – `ProfileService`, `AvatarService`.
