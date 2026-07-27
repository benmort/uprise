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

# Build every workspace package the api imports: the tsc `dist/`s (@uprise/events,
# @uprise/permissions, @uprise/contracts …) and @uprise/db's generated client. Those are
# normally produced by each package's `prepare`/`postinstall` during install — but a
# cache-warm Vercel install skips straight past them ("Done in 794ms", no prepare lines),
# leaving the build to compile against dist directories that do not exist. Building here
# makes the deploy independent of whether install ran them.
pnpm -w run build:packages

# Deploys apply migrations only. The plan seeders remain for manual runs:
#   pnpm --filter api exec ts-node src/scripts/seed-plans-standalone.ts   (non-clobbering)
#   pnpm --filter api exec ts-node src/scripts/sync-plans-standalone.ts   (upsert canonical data)
