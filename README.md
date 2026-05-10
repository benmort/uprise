# Yarns SMS Blast Platform

Yarns is a Twilio-powered SMS blast platform with five primary surfaces:

- Dashboard
- Audience Management
- Composer
- Analytics
- Inbox

This repository is now configured for **Vercel-only deployment**:

- `apps/web` (Next.js) -> Vercel project #1
- `apps/api` (NestJS serverless function) -> Vercel project #2

## Architecture

- **Web (`apps/web`)**
  - Next.js App Router UI
  - Yarns design system
  - Routes: `/dashboard`, `/audience`, `/analytics`, `/inbox`, `/blasts/:id`, `/blasts/:id/composer`

- **API (`apps/api`)**
  - NestJS with Prisma + Postgres
  - Runs on Vercel via `api/index.ts` serverless handler
  - Global prefix `/api/v1`
  - Endpoints for audiences, blasts, analytics, inbox, integrations, webhooks

## Local Development

1. Install dependencies:

```bash
pnpm install
```

2. Copy env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

3. Ensure `DATABASE_URL` points to a reachable Postgres instance.

4. Run Prisma generate + migrate:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
```

5. Start both apps:

```bash
pnpm dev:all
```

- API local URL: `http://localhost:3001/api/v1`
- Web local URL: `http://localhost:3000`

## Vercel Deployment

### 1) Deploy API (`apps/api`)

Create a Vercel project with root directory `apps/api`.

- `vercel.json` routes all requests to `api/index.ts`
- Nest app is bootstrapped in serverless mode and serves `/api/v1/*`

Set required API env vars in Vercel:

- `DATABASE_URL`
- `BASIC_AUTH_USERNAME`
- `BASIC_AUTH_PASSWORD`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `ACTION_NETWORK_API_KEY`
- `INTERNAL_SOURCE_API_BASE_URL`
- `INTERNAL_SOURCE_API_KEY`
- `INTEGRATION_CREDENTIAL_SECRET`
- `CRON_SECRET` (used for scheduled blast dispatch endpoint)

Optional:

- `ACTION_NETWORK_API_BASE_URL`
- `STREAM_TOKEN_SECRET` (falls back to `INTEGRATION_CREDENTIAL_SECRET`)
- `STREAM_TOKEN_TTL_SECONDS` (default: `43200`)
- `BLAST_SEND_BATCH_SIZE` (default: `50`)
- `CORS_ALLOWED_ORIGINS` (comma-separated allowlist, recommended in production)
  - example: `https://yarns.org.au,https://www.yarns.org.au`
- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default: `300`)
- `FEATURE_REALTIME_ENABLED`
- `FEATURE_AI_ASSIST_ENABLED`
- `FEATURE_BLAST_SCHEDULER_ENABLED`
- Firebase admin vars (`GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON(_B64)`)

Scheduled dispatch runs via Vercel Cron (`/api/v1/blasts/dispatch-due`) every minute and expects `Authorization: Bearer <CRON_SECRET>`.

### 2) Deploy Web (`apps/web`)

Create a Vercel project with root directory `apps/web`.

Set web env vars:

- `NEXT_PUBLIC_API_URL` -> your API deployment URL + `/api/v1`
  - example: `https://yarns-api.vercel.app/api/v1`
- `NEXT_PUBLIC_ACTION_NETWORK_BASE_URL` (optional override)
- `NEXT_PUBLIC_INTERNAL_SOURCE_BASE_URL` (optional UI default)
- optional Firebase web vars

### 3) Database migration workflow

Before promoting API builds, run:

```bash
pnpm --filter api prisma:deploy
```

Use CI or release automation to apply migrations against production Postgres.

## Testing

### API

```bash
pnpm --filter api test
pnpm --filter api build
```

### Web

```bash
pnpm --filter web test
pnpm --filter web build
```

## Operational Docs

- Migration and rollback: `docs/migration-runbook.md`
- Observability and alerting: `docs/observability.md`
- Launch gates: `docs/launch-checklist.md`
