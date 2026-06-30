# uprise — cross-cutting TODO

Running backlog of deferred, repo-wide items that don't belong to a single PR. Keep this
updated as work lands.

## Deferred

### Production environment variables — uprise.org.au cutover
**Deferred from:** the Uprise → Uprise rebrand + the live `www.uprise.org.au` launch. Symptom that
surfaced it: the marketing sign-in/up buttons link to `http://localhost:3002` because
`NEXT_PUBLIC_AUTH_APP_URL` is unset on the Vercel project and the localhost default
(`apps/marketing/src/lib/links.ts`, `apps/marketing/src/app/layout.tsx`) gets baked in at build.

`NEXT_PUBLIC_*` is **inlined at build time**, so every change below needs a **redeploy** of that
project, not just a save. This section is the authoritative env matrix; it supersedes the
"Auth domain + wiring" / "CORS" bullets in the consolidation item below for the uprise domain.

**Assumed hostnames** (swap if different): marketing `www.uprise.org.au` (+ apex `uprise.org.au`),
admin `admin.uprise.org.au`, auth `auth.uprise.org.au`, API `api.uprise.org.au`, action
`action.uprise.org.au`, cookie parent `.uprise.org.au`. Note `NEXT_PUBLIC_API_URL` includes the
`/api/v1` suffix.

**uprise-marketing (Vercel)**

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.uprise.org.au/api/v1` |
| `NEXT_PUBLIC_AUTH_APP_URL` | `https://auth.uprise.org.au` |
| `NEXT_PUBLIC_APP_URL` | `https://admin.uprise.org.au` |

**uprise-action (Vercel)**

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.uprise.org.au/api/v1` |
| `NEXT_PUBLIC_AUTH_APP_URL` | `https://auth.uprise.org.au` |

**uprise-auth (Vercel)**

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.uprise.org.au/api/v1` |
| `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS` | `https://admin.uprise.org.au,https://www.uprise.org.au,https://action.uprise.org.au` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://www.uprise.org.au` |

**uprise-admin (Vercel)**

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.uprise.org.au/api/v1` |
| `NEXT_PUBLIC_AUTH_APP_URL` | `https://auth.uprise.org.au` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.uprise.org.au` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | _optional_ – `pk.*` token; only the canvass map needs it (list mode works without) |
| `NEXT_PUBLIC_ACTION_NETWORK_BASE_URL` | _optional_ – defaults to `https://actionnetwork.org/api/v2` |

**uprise-api (Vercel) — required**

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon connection string — **must be identical to the worker's** |
| `BULLMQ_REDIS_URL` | Redis URL — **same Redis as the worker** |
| `SESSION_COOKIE_DOMAIN` | `.uprise.org.au` |
| `AUTH_APP_URL` | `https://auth.uprise.org.au` |
| `API_BASE_URL` | `https://api.uprise.org.au` |
| `CORS_ALLOWED_ORIGINS` | `https://uprise.org.au,https://www.uprise.org.au,https://admin.uprise.org.au,https://auth.uprise.org.au,https://action.uprise.org.au` |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | credentials for the global guard |
| `STREAM_TOKEN_SECRET` | a long random secret |
| `CRON_SECRET` | a long random secret (gates the cron dispatch endpoints) |

(`NODE_ENV=production` is set by Vercel automatically.)

**uprise-api — feature secrets (set per feature you turn on)**

| Feature | Vars |
|---|---|
| Email | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (verified sender), `SENDGRID_WEBHOOK_VERIFICATION_KEY` (opt) |
| SMS / Voice / WhatsApp | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (+ `TWILIO_TRANSACTIONAL_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_VOICE_FROM`/`TWILIO_VOICE_TWIML_URL` as used) |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (required for the signed `/payment-webhook`) |
| File/avatar uploads | `BLOB_READ_WRITE_TOKEN` (Vercel Blob store) |
| Push notifications | `FEATURE_PUSH_ENABLED=true`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`) |
| Integrations | `ACTION_NETWORK_API_KEY`, `INTEGRATION_CREDENTIAL_SECRET`, `INTERNAL_SOURCE_API_*` |
| Marketing form | `MARKETING_NOTIFY_EMAIL` (where contact-form submissions are emailed) |
| Flag floor / kill-switches | `FEATURE_REALTIME_ENABLED`, `FEATURE_AI_ASSIST_ENABLED`, `FEATURE_BLAST_SCHEDULER_ENABLED`, `FEATURE_WHATSAPP_ENABLED`, `FEATURE_BULLMQ_UPLOAD_ENABLED`, `FEATURE_BULLMQ_BLAST_ENABLED` |

Everything else in `apps/api/.env.example` (`RATE_LIMIT_*`, `BLAST_*`, `AUDIENCE_IMPORT_*`,
`BULLMQ_*_CONCURRENCY`, `TWILIO_SEND_*`, `ACTION_NETWORK_SYNC_*`, `QUIET_HOURS_*`,
`STREAM_TOKEN_TTL_SECONDS`) is **tuning with sane defaults** — only set to override.

**uprise-worker (Railway, not Vercel)** — also the cause of the current
`relation "events.OutboxEvent" does not exist` (`42P01`) crash spam:

| Var | Value |
|---|---|
| `DATABASE_URL` | **the same Neon string as the API** — a mismatch here is why the relay can't find `events.OutboxEvent` |
| `BULLMQ_REDIS_URL` | same Redis as the API |
| `BULLMQ_PREFIX` | `uprise` |
| `OUTBOX_RELAY_INTERVAL_MS` | `750` |
| `FEATURE_BULLMQ_UPLOAD_ENABLED` / `FEATURE_BULLMQ_BLAST_ENABLED` | `true` |

On Railway there is **no `apps/api/.env` fallback**, so the worker needs its own copy of every
secret its reactions/jobs touch — `SENDGRID_*` (notification emails), `TWILIO_*` (blast/voice
sends), `STRIPE_*`, and `AUTH_APP_URL` + `API_BASE_URL` so email links resolve. Use the same
values as the API.

Two invariants or nothing works: (1) `DATABASE_URL` and `BULLMQ_REDIS_URL` **identical** across
API + worker; (2) `SESSION_COOKIE_DOMAIN=.uprise.org.au` on the API **and** the auth app served
from an `*.uprise.org.au` subdomain — otherwise sign-in runs but the session cookie won't stick.

Decision: operator/dashboard + secrets steps. Generate `STREAM_TOKEN_SECRET`/`CRON_SECRET`/VAPID
keys, set per-project in Vercel + Railway, then redeploy each project (build-time inlining).

### Configure SendGrid so transactional email actually sends
**Deferred from:** self-signup → admin approval (`feat/signup-approval`). The flow ships and
works without it — email-verification codes + join-request/invite notifications just don't
deliver (the dispatcher/reactions degrade: logged, never thrown).

`SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` are **unset everywhere** — blank in uprise' env and
blank across every prog `.env*` too (prog's real key lives only in its hosting secrets, not the
repo). To enable delivery:
- Pull the real key from prog's hosting dashboard (Railway/Vercel env) or SendGrid directly.
- Set `SENDGRID_API_KEY` + a **verified-sender** `SENDGRID_FROM_EMAIL` in uprise' deploy env /
  secrets manager (never commit it). For local testing, add them to the gitignored `apps/api/.env`.
- Keys are already declared/documented in `apps/api/.env.example` + `.env.prod.example`.

Decision: operator/secrets step — do it when wiring the prod environment for the signup-approval
launch (alongside `prisma migrate deploy` for the `TenantJoinRequest` table and adding the
`apps/action` origin to prod `CORS_ALLOWED_ORIGINS`).

### Adopt per-tenant subdomain routing
**Deferred from:** PART 3 (prog ngrok + subdomain dev tooling). We kept uprise' in-session
tenant model for now.

Prog routes tenants by subdomain (`<tenant>.dev.uprise.org.au` → organiser app), parsing the
host to the tenant and redirecting to the tenant subdomain after login. uprise currently picks
the tenant in-session via `/select-tenant` and serves the organiser app on one host
(`admin.dev.uprise.org.au`).

Switching would mean:
- Host→tenant parsing in `apps/admin/src/middleware.ts` (a `buildTenantUrl` / `extractTenantFromHost`
  helper, cf. prog `clients/auth-client/lib/utils/tenancy.ts`).
- Redirect-to-subdomain after login in `apps/auth/src/lib/session.ts` (`completeAuth`), reworking
  the `/select-tenant` step.
- The `*.dev.uprise.org.au` ngrok wildcard must be reserved on the uprise ngrok account (+ DNS
  CNAMEs in the `uprise.org.au` zone) before the tunnel works — see `docs/development/ngrok-dev.md`.

Decision: revisit once the in-session flow is settled; it reworks the SSO/select-tenant flow
shipped in the auth port.

### Finish the Vercel → prog-network consolidation
**Deferred from:** moving all uprise apps to the `prog-network` Vercel team. Done so far:
`uprise-admin` (transferred from common-threads `uprise-web`, same project id, Root Directory now
`apps/admin`) and `uprise-api` (holds `api.uprise.org.au`) live in prog-network and serve their
domains; `uprise-marketing` (`apps/marketing`) and `uprise-action` (`apps/action`) created with
Root Directory + `NEXT_PUBLIC_API_URL` (+ `NEXT_PUBLIC_APP_URL` for marketing) set; `uprise-auth`
(`apps/auth`) scaffolded. common-threads is now uprise-free.

Remaining:
- **Auth domain + wiring.** `uprise-auth` has no custom domain (`uprise-auth-prog-network.vercel.app`).
  Give it one, then set `NEXT_PUBLIC_AUTH_APP_URL` on **both** `uprise-marketing` and `uprise-action`
  (currently unset → their sign-in/up links don't resolve in prod).
- **Custom domains for marketing + action.** Both still on `*.vercel.app`; assign the intended
  production hostnames.
- **CORS.** Add the marketing/action (and auth) production origins to `apps/api`'s
  `CORS_ALLOWED_ORIGINS` (`apps/api/src/bootstrap.ts:25`) once their domains exist, or their
  `checkSession()`/form calls fail cross-origin.
- **Move the `uprise.org.au` domain registration to prog-network.** It serves from prog-network/
  `uprise-admin` but the apex registration still sits under common-threads (`vercel domains ls`) —
  a cross-team attachment. Functionally fine; move it for clean ownership.
- **Re-link local `.vercel`.** `apps/admin/.vercel` and `apps/api/.vercel` still carry the old
  common-threads `orgId` (and admin's old name `uprise-web`). Re-link if using CLI deploys:
  `vercel link --yes --scope prog-network --project uprise-admin` (and `… --project uprise-api`).
- **Confirm Git auto-deploy** is connected for the new projects (`github.com/benmort/uprise`).

Decision: operator/dashboard steps — finish alongside the signup-approval prod wiring (the
`apps/action` CORS origin overlaps with the SendGrid item above).

### Admin account page: captcha-gated "send code" buttons send no Turnstile token
**Reported:** in the admin account page (Account → email verification), clicking to send a
verification code returns the toast **"Couldn't send code" / "Captcha verification failed"**
(observed where Turnstile is configured, i.e. prod).

Root cause: `apps/admin/src/app/(main)/account/page.tsx:101` calls
`auth.sendEmailVerification(email)` with **no captcha token**, but `/iam/verify-email/send` is
`@RequireCaptcha("soft")` (`apps/api/src/auth/auth-flows.controller.ts:80-81`). When Turnstile is
configured, `TurnstileGuard` treats the empty token as a failed challenge and throws
`"Captcha verification failed"` (`apps/api/src/common/captcha/turnstile.guard.ts`); the client
surfaces it as the `"Couldn't send code"` toast (`account/page.tsx:106`). The admin account page
renders **no `<TurnstileWidget>`** and threads no token — unlike the working auth-app pattern in
`apps/auth/src/app/(sso)/account-recovery/page.tsx` (`captchaRef.current?.execute()` → token passed
to the api-client call). In dev the guard is a no-op (`!turnstile.isConfigured()`), which is why it
only bites once Turnstile is wired.

Fix: render `TurnstileWidget` on the admin account page and pass `captchaToken` into
`auth.sendEmailVerification` (the api-client already accepts it —
`packages/api-client/src/index.ts:120`), mirroring `account-recovery`. The mobile-code button
(`account/page.tsx:269` → `profile.sendMobileCode()` → `/iam/profile/mobile/send`) is **not**
captcha-gated server-side today, so it isn't the current cause — but thread the same token through
it if that route is later decorated, to avoid the identical failure.

Decision: small self-contained frontend fix (admin only) — safe to do any time; not blocked on an
external dependency.
