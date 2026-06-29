#!/usr/bin/env bash
set -euo pipefail

# Vercel build for the api. On PRODUCTION deploys we apply pending Prisma migrations
# so the schema can never drift behind the deployed code (the cause of the /plans 500
# and the phone-first 500). Migrations run against the DIRECT (unpooled) Neon URL —
# the pooled DATABASE_URL can't run them. House rule: migrate deploy, never migrate dev.
# A failed migration fails the build (set -e), so a broken deploy is never promoted.

if [ "${VERCEL_ENV:-}" = "production" ]; then
  export DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"
  echo "→ prisma migrate deploy (production)"
  pnpm --filter @uprise/db exec prisma migrate deploy
fi

# Always (re)generate the client so the function build picks up the current schema.
pnpm --filter @uprise/db run prisma:generate

# One-off: sync canonical plan data (prices/limits/feature rows/entitlements) onto the
# existing plans — they were created by an older seed before the pricing columns existed,
# so they had null prices and no multi-brand row. Removed after this deploy; deploys
# normally apply migrations only.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "→ sync plans (one-off)"
  pnpm --filter api exec ts-node src/scripts/sync-plans-standalone.ts
fi
