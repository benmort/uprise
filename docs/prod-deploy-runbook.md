# Uprise production deploy runbook

Exact steps to take the `feat/canvassing-domain` work to production (Neon + Vercel + Twilio/Meta). Run top to bottom; each step is idempotent unless noted. Commands assume repo root `/…/common-threads/yarns`.

Architecture: **API** (NestJS) and **web** (Next.js) deploy as two Vercel projects. API is serverless (`apps/api/vercel.json` → `api/index.ts`, 30s max). Crons are declared in `apps/api/vercel.json` and need `CRON_SECRET`.

---

## 1. Neon database

1. Create the Neon Postgres database; copy the pooled connection string (with `?sslmode=require`).
2. Enable PostGIS (the geo migration also runs `CREATE EXTENSION IF NOT EXISTS postgis`, but enabling it first avoids a role-permission surprise):
   ```sql
   -- Neon SQL console
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Apply all 12 migrations (includes `20260618010000_geo_postgis`):
   ```
   cd apps/api && DATABASE_URL="<neon>?sslmode=require" npx prisma migrate deploy
   ```
4. Backfill the contact spine + seed disposition defaults (idempotent):
   ```
   cd apps/api && DATABASE_URL="<neon>?sslmode=require" npm run backfill:contacts
   ```

**Verify:** `npx prisma migrate status` reports up to date; `SELECT postgis_version();` works.

---

## 2. Geo address universe on prod (optional, heavy)

Only if you want the national address↔division universe in prod. The local run is the proven recipe (16.9M addresses, federal + state; LGA intentionally excluded).

1. Boundaries — needs the ABS shapefiles present locally under `data/geo/{ced,sed}/` (already downloaded):
   ```
   cd apps/api && DATABASE_URL="<neon>" npm run geo:load-boundaries
   ```
2. Addresses — run the per-state `\copy` recipe from `apps/api/src/scripts/geo/README.md` against the Neon URL (strip `?schema=...`/`?sslmode=...` for `psql`, pass `sslmode=require` via `PGSSLMODE=require`). ~16.9M rows.
3. Mapping — federal + state spatial join (CED ~20 min, SED ~15 min at national scale):
   ```
   cd apps/api && DATABASE_URL="<neon>" npm run geo:map
   ```
   Run it **detached** (`nohup … &`) so a disconnect can't orphan a long UPDATE.

**Verify:** `/geo/status` row counts; spot-check a known division (ACT: Canberra ≈ 107k, Bean ≈ 90k, Fenner ≈ 85k).

> Skip this section entirely if you don't need prod division-mapping yet — the app runs fine without it; the geo pages just show empty universes.

---

## 3. API environment variables (Vercel → API project)

**Required**
| Var | Value / note |
|---|---|
| `DATABASE_URL` | Neon pooled string `?sslmode=require` |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | super-admin login |
| `DEFAULT_ORGANIZATION_SLUG` | e.g. `default` |
| `CORS_ALLOWED_ORIGINS` | the web app's prod URL(s), comma-separated |
| `API_BASE_URL` | the API's own prod URL |
| `CRON_SECRET` | random secret; Vercel cron calls authenticate with it |
| `STREAM_TOKEN_SECRET` | random secret (SSE auth) |
| `INTEGRATION_CREDENTIAL_SECRET` | random 32-byte secret (encrypts integration creds) |
| `REDIS_URL` / `BULLMQ_REDIS_URL` | managed Redis (Upstash) for queues |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS |
| `TWILIO_STATUS_CALLBACK_URL` | `<api>/api/v1/webhooks/twilio-status-callback` |

**WhatsApp (Stage: WhatsApp channel)**
| Var | Value / note |
|---|---|
| `FEATURE_WHATSAPP_ENABLED` | `true` to turn the channel on |
| `TWILIO_CONTENT_API_ENABLED` | `true` to enable template sync |
| `TWILIO_WHATSAPP_FROM` | approved WhatsApp sender (`whatsapp:+…`) |
| `TWILIO_WHATSAPP_MESSAGING_SERVICE_SID` | if using a Messaging Service |
| `WHATSAPP_SESSION_WINDOW_HOURS` | default 24 |

**Push to field (Stage G14)**
| Var | Value / note |
|---|---|
| `FEATURE_PUSH_ENABLED` | `true` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated locally already (`apps/api/.env`); copy them in |
| `VAPID_SUBJECT` | `mailto:…` |

**Door photos (Stage G3)**
| Var | Value / note |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (read via `process.env`, not validated — photos 500 cleanly without it) |

**Feature flags / tuning (optional, sensible defaults exist):** `FEATURE_REALTIME_ENABLED`, `FEATURE_AI_ASSIST_ENABLED`, `FEATURE_BLAST_SCHEDULER_ENABLED`, `FEATURE_BULLMQ_BLAST_ENABLED`, `FEATURE_BULLMQ_UPLOAD_ENABLED`, `BLAST_DRY_RUN`, `REQUIRE_OPTOUT_LANGUAGE`, `QUIET_HOURS_START/END`, rate-limit + batch-size knobs.

---

## 4. Web environment variables (Vercel → web project)

| Var | Value / note |
|---|---|
| `NEXT_PUBLIC_API_URL` | `<api>/api/v1` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox token — **required** for maps + offline tile pre-cache; list mode works without it |
| `NEXT_PUBLIC_ACTION_NETWORK_BASE_URL` | Action Network base (silences the config warning) |

The web fetches the VAPID **public** key from the API's `/push/config`, so no web-side VAPID env is needed.

---

## 5. Twilio + Meta (WhatsApp)

1. Point the Twilio **inbound** webhook at `<api>/api/v1/webhooks/inbound-text-message-hook` (SMS + WhatsApp share it; channel is detected from the `whatsapp:` address prefix).
2. Point the **status callback** at `<api>/api/v1/webhooks/twilio-status-callback`.
3. WhatsApp production sender + approved templates require **Meta Business verification** — external, longest lead. Until then, dev uses the Twilio WhatsApp sandbox. With `TWILIO_CONTENT_API_ENABLED=true`, sync templates from the WhatsApp settings page once the sender is live.

---

## 6. Smoke test (prod)

- `GET <api>/api/v1/system/feature-flags` → flags reflect your env.
- `GET <api>/api/v1/geo/status` → dataset counts (if §2 run).
- Web: log in, open `/analytics`, toggle the channel filter (WhatsApp option appears only with `FEATURE_WHATSAPP_ENABLED`).
- Web: `/field/<turf>` → "Download maps for offline" runs (needs `NEXT_PUBLIC_MAPBOX_TOKEN`); a door knock with a survey persists.
- Inbox: send/receive on each enabled channel; confirm a status callback updates a recipient.
- Push: enable on `/field/me`; "Notify field" from the live war-room delivers.

---

## 7. Rollback notes

- Migrations are additive this branch; no destructive down-migrations are needed. To disable a feature, flip its flag off rather than reverting code.
- The geo layer is isolated in the `geo` schema; dropping it (`DROP SCHEMA geo CASCADE`) removes the address universe without touching the app schema (only `Contact.gnafPid` remains, nullable).
