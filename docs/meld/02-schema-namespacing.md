# 02 – Per-Domain Schema Namespacing

Foundation step 3. Enable Prisma `multiSchema`, map every domain to a Postgres schema, and adopt the id-only cross-schema reference rule. Big migration #1.

## Why

prog and slingshot both isolate domains into their own Postgres schemas. Mirroring that in yarns makes each domain independently ownable and migratable, and is the single biggest lever for a low-friction slingshot merge later (doc 13).

## Enable multiSchema

`packages/db/prisma/schema.prisma`:

```prisma
generator client { provider = "prisma-client-js" }   // multiSchema GA in Prisma 6 (doc 01)

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public","iam","tenant","audience","messaging","canvass",
              "journey","integration","geo","analytics","email","payment",
              "telephony","ops","events"]
}
```

## Schema map

| Schema | Models |
|---|---|
| `public` | `Contact`, `PushSubscription` (cross-cutting, referenced everywhere) |
| `iam` | `User`, `Session`, `MagicLink`, `PasswordReset`, `MobileVerification`, `UserProfile`, `UserAvatar` (docs 03, 11) |
| `tenant` | `Network`, `Tenant`, `TenantMember`, `TenantInvitation`, `OrgProfile`, `OrgContact`, `OrgAddress`, `OrgCredential` (docs 03, 11) |
| `audience` | `Audience`, `AudienceContact`, `AudienceImport`, `AudienceSegment`, `AudienceSegmentMember`, `ContactSourceRecord` |
| `messaging` | `Blast`, `BlastTemplate`, `BlastRecipient`, `InboundMessage`, `OutboundMessage`, `ContactConsent`, `WhatsappTemplate`, `ConversationState`, `Suppression`, `MessageTemplate` |
| `canvass` | `CanvassCampaign`, `Turf`, `TurfAssignment`, `WalkList`, `WalkListItem`, `DoorKnock`, `Shift`, `Script`, `ScriptStep`, `Survey`, `Question`, `QuestionOption`, `QuestionResponse`, `DispositionDef`, `Disposition`, `CannedResponse` |
| `journey` | `Journey`, `JourneyRung`, `JourneyEnrolment` |
| `integration` | `IntegrationConnection`, `IntegrationSyncJob` |
| `geo` | geo boundary/division/address models (currently raw-SQL/PostGIS migrations) |
| `analytics` | `AnalyticsSnapshot` |
| `email` | `Email`, `EmailTemplate` (doc 07) |
| `payment` | `Payment`, `Refund`, `Customer`, `Subscription`, `Invoice`, `PaymentMethod` (doc 08) |
| `telephony` | `Call` (doc 09) |
| `ops` | `WebhookEvent` (doc 12) |
| `events` | `OutboxEvent`, `ReactionDedup` (doc 05) |

Every model gets `@@schema("...")`.

## Cross-schema reference rule

- **Within a schema:** real Prisma relations + FK constraints (e.g. `Blast → BlastRecipient`).
- **Across schemas:** **id reference only, no `@relation`, no FK.** E.g. `Audience.tenantId` is a plain `String`; `BlastRecipient.contactId → public.Contact` is an id string, not a relation.

Prisma *can* do cross-schema relations, but the no-FK discipline is what lets each schema become an independently-ownable unit, exactly like slingshot's 18 domain schemas. The cost – loss of DB-level referential integrity across domains – is paid back as app-level checks in the owning services.

## Migration runbook

Data loss is acceptable (doc 00 Mandate), so this is a clean recreate, not delicate table surgery. Define every model with its `@@schema` and let Prisma generate the migration; `prisma migrate reset` rebuilds the DB with all schemas, then re-seed via the shared demo seed. `geo`'s raw-SQL/PostGIS setup folds into the same migration.

1. Prisma emits `CREATE SCHEMA IF NOT EXISTS <each>;` from the `schemas` list.
2. No `SET SCHEMA` / FK-preservation gymnastics – tables are created directly in their target schema.
3. Apply the doc 02 + doc 03 changes as **one coherent migration** (namespacing + the Organization→Tenant / AppUser→User replacement land together).
4. Grant the `DATABASE_URL` role `CREATE`/`USAGE` on all schemas (document in the env runbook).
5. The worker's raw-SQL outbox claim (doc 05) must use schema-qualified names (`"events"."OutboxEvent"`).

## Verification

```bash
pnpm --filter @yarns/db prisma:migrate reset
pnpm --filter @yarns/db run seed
pnpm --filter api test
```

Gate: DB rebuilds clean with all schemas (`\dn`); the full api suite passes; all existing endpoints (audiences, blasts, canvass, inbox) smoke-pass with no regression; no unexpected cross-schema FK remains.

## Files

- `packages/db/prisma/schema.prisma` – `schemas` list + `@@schema` on every model.
- `packages/db/prisma/migrations/<ts>_schema_namespacing/` – the table-move + FK-drop migration.
- env runbook / `docs/migration-runbook.md` – schema grants.
