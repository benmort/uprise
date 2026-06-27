# 03 – Tenancy & IAM Data Model

Foundation step 4. Add prog's Network→Tenant→Membership + full IAM as Prisma CRUD tables, replacing uprise' `Organization`/`AppUser`.

> **Data loss is acceptable** (product-owner decision). So this is a **clean drop-and-recreate to the best end-state models** – not a delicate in-place rename. Design for clarity, not migration safety. Re-seed afterwards via the shared demo seed. This makes what was the riskiest step a routine one.

Source models (prog, re-expressed from Drizzle `*_view` projections): `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/tenant/*` and `services/identity/*`.

## New Prisma models

```prisma
// --- schema "tenant" ---
model Network {                                  // billing boundary, above Tenant
  id                 String   @id @default(cuid())
  name               String
  ownerId            String?
  planName           String?
  subscriptionStatus String?
  createdAt          DateTime @default(now())
  tenants            Tenant[]
  @@schema("tenant")
}

model Tenant {                                   // replaces uprise Organization
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  networkId   String?
  settings    Json?
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  network     Network? @relation(fields: [networkId], references: [id])
  members     TenantMember[]
  invitations TenantInvitation[]
  @@schema("tenant")
}

model TenantMember {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String                               // id-only ref to iam.User (no FK)
  role      String                               // unified role taxonomy (doc 04)
  addedBy   String?
  createdAt DateTime @default(now())
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, userId])
  @@index([tenantId, role])
  @@schema("tenant")
}

model TenantInvitation {
  id        String    @id @default(cuid())
  tenantId  String
  email     String
  role      String
  status    String                               // pending | accepted | declined
  token     String?   @unique
  expiresAt DateTime?
  invitedBy String?
  @@schema("tenant")
}

// --- schema "iam" ---
model User {                                     // replaces uprise AppUser identity
  id             String    @id @default(cuid())
  email          String    @unique
  displayName    String
  passwordHash   String?
  twofaEnabled   Boolean   @default(false)
  twofaSecret    String?
  mobile         String?
  mobileVerified Boolean   @default(false)
  registeredAt   DateTime  @default(now())
  sessions       Session[]
  magicLinks     MagicLink[]
  passwordResets PasswordReset[]
  @@schema("iam")
}

model Session       { id String @id @default(cuid()) userId String token String @unique expiresAt DateTime createdAt DateTime @default(now()) user User @relation(fields:[userId],references:[id],onDelete:Cascade) @@index([userId]) @@schema("iam") }
model MagicLink     { id String @id @default(cuid()) userId String token String @unique expiresAt DateTime consumedAt DateTime? user User @relation(fields:[userId],references:[id],onDelete:Cascade) @@schema("iam") }
model PasswordReset { id String @id @default(cuid()) userId String token String @unique expiresAt DateTime consumedAt DateTime? user User @relation(fields:[userId],references:[id],onDelete:Cascade) @@schema("iam") }
model MobileVerification { id String @id @default(cuid()) userId String code String expiresAt DateTime verifiedAt DateTime? @@index([userId]) @@schema("iam") }
```

`TenantMember.userId → iam.User` and `TenantInvitation` carry **id-only** references across schema boundaries (doc 02 rule). `Tenant→Network` and `Tenant→TenantMember` are real FKs (same/adjacent schema, kept).

## Migration strategy (clean drop-and-recreate)

Data loss is acceptable, so there is no rename/backfill/dual-write dance. The work is a straight schema change plus a code sweep:

1. **Replace the models.** Drop `Organization` and `AppUser`; add `Tenant`, `Network`, `TenantMember`, `TenantInvitation`, `User`, `Session`, `MagicLink`, `PasswordReset`, `MobileVerification` in their target schemas (`tenant`/`iam`). One Prisma migration, generated normally – no `SET SCHEMA` surgery, no FK preservation.
2. **Rename the scoping column everywhere.** Sweep the codebase: every model's `organizationId` FK becomes `tenantId` (id-only ref to `tenant.Tenant`, per doc 02). This is the one large but mechanical code change – ~98 references across the Prisma schema and services. Do it as a single coherent rename so nothing half-migrates.
3. **Re-seed.** Recreate demo/dev data via the shared demo seed (the same seed used by tests/tour/demo). Production re-onboards through the new tenancy/IAM flows.

`mapRole` (for any seed/import that carries old roles): `ORGANISER → organiser`, `VOLUNTEER → volunteer` (doc 04 taxonomy).

## Verification

```bash
pnpm --filter @uprise/db prisma:migrate reset   # clean DB, fresh schema
pnpm --filter @uprise/db run seed               # shared demo seed
pnpm --filter api test
pnpm --filter admin build
```

Gate: api boots on the fresh schema; the full api suite passes; every existing endpoint (audiences, blasts, canvass, inbox, journeys, geo, integrations) works under `tenantId` scoping with **no functional regression** – the `organizationId`→`tenantId` rename is the only behavioural change.

## Files

- `packages/db/prisma/schema.prisma` – drop `Organization`/`AppUser`; add tenancy/IAM models; rename `organizationId`→`tenantId` on every model.
- `packages/db/prisma/migrations/<ts>_tenancy_iam/` – the drop-and-recreate migration (merged with doc 02's namespacing migration).
- `apps/api/src/**` – codebase-wide `organizationId`→`tenantId` sweep; `AuthScopeService`/`ConfigService` org-resolution updated to tenant resolution.
- the shared demo seed – updated to the new tenancy/IAM models.
