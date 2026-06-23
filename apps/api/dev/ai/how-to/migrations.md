---
name: migrations
description: How to change the schema in yarns – additive hand-written SQL applied with migrate deploy, never migrate dev.
layer: api
topic: db
use_when: Adding or altering any Prisma model, enum, or index.
last_reviewed: 2026-06-23
---

# Migrations

yarns ships hand-written, additive migration SQL applied with `prisma migrate deploy`. `migrate dev` is banned because it regenerates from the schema and drops the raw partial-unique indexes we maintain by hand.

Canonical: `packages/db/prisma/migrations/` (timestamped dirs each holding a hand-written `migration.sql` – see `20260623110000_telephony_parity/migration.sql`: `ALTER TYPE "messaging"."BlastRecipientStatus" ADD VALUE IF NOT EXISTS 'UNDELIVERED'` then `ALTER TABLE "messaging"."MessageTemplate" ADD COLUMN ...`), `packages/db/package.json` (`prisma:generate` → `prisma generate`, `prisma:deploy` → `prisma migrate deploy`; `prisma:migrate` runs `migrate dev` – do NOT use it).

## Must have
- Create a new timestamped dir under `packages/db/prisma/migrations/` (e.g. `YYYYMMDDHHMMSS_short_name/migration.sql`) and write the SQL by hand. Mirror the schema change in `schema.prisma`.
- Changes are ADDITIVE: `ADD COLUMN` (nullable or with a default), `ADD VALUE IF NOT EXISTS` for enums, `CREATE INDEX`. Use schema-qualified names (`"messaging"."MessageTemplate"`) – yarns is multi-schema.
- Apply with `prisma migrate deploy` (`pnpm --filter @yarns/db prisma:deploy`). NEVER `prisma migrate dev` – it drops the raw partial-unique indexes.
- After applying: regenerate the client (`pnpm --filter @yarns/db prisma:generate`) and rebuild `@yarns/db` so consumers see the new types.
- An enum `ADD VALUE` is safe in the same transaction only if that value is NOT used (e.g. in a column default or data backfill) within the same migration; if you need to use it, split it into a later migration.

## Anti-patterns
- `prisma migrate dev` – regenerates migrations and drops the hand-maintained partial-unique indexes.
- Destructive/rewriting changes (drop column, narrow a type, rename in place) on a live table without a backfill plan – keep migrations forward-only and additive.
- Editing `schema.prisma` and skipping the migration, or editing an already-applied migration's SQL.
- Adding an enum value and immediately defaulting a column to it in the same migration.

## Checklist
- [ ] New timestamped dir + hand-written `migration.sql`; schema-qualified, additive SQL; `schema.prisma` updated to match.
- [ ] Applied with `prisma migrate deploy` (never `migrate dev`).
- [ ] Client regenerated (`prisma:generate`) and `@yarns/db` rebuilt.
- [ ] Enum `ADD VALUE` not consumed in the same migration.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/bullmq-jobs.md` – payloads/consumers that read the new columns.
- `apps/api/dev/ai/how-to/permissions.md` – new resources granted alongside new tables.
