# Local dev under the prog ngrok subdomains

Run the yarns apps locally but reach them over prog's stable HTTPS subdomains, so cross-app
SSO and provider webhooks (Twilio/SendGrid/Stripe) behave like a deployed environment
instead of bare `localhost:PORT`.

## Domain → app mapping

| ngrok domain | local | yarns app |
|---|---|---|
| `dev.prog.network` | `localhost:3003` | marketing |
| `auth.dev.prog.network` | `localhost:3002` | auth (SSO) |
| `app.dev.prog.network` | `localhost:3000` | web (organiser) |
| `api.dev.prog.network` | `localhost:3001` | api (frontend calls + webhooks) |

`app.*` and `api.*` sit under prog's reserved `*.dev.prog.network` wildcard. Tenancy is
still chosen in-session (`/select-tenant`) — subdomains map apps, not tenants. (Per-tenant
subdomain routing is a deferred item in `docs/TODO.md`.)

## Prerequisites

- The **prog ngrok account**, which reserves `dev.prog.network`, `auth.dev.prog.network`
  and the `*.dev.prog.network` wildcard, with DNS CNAMEs already pointing at ngrok. The
  free tier cannot use reserved domains.
- A **`ngrok.local.yml`** in the repo root holding just your authtoken (gitignored — the
  secret never enters git). `dev:tunnel` merges it with the committed `ngrok.yml`:
  ```yaml
  version: "2"
  authtoken: <token-from-the-prog-ngrok-account>
  ```
  (`--config ngrok.yml` alone does NOT pick up the agent's global authtoken, hence the
  explicit local file. The token lives in prog's `core-orchestration/ngrok.yml`.)

## Run it

`dev:all` runs the four apps **and** the ngrok tunnels together (via `concurrently`,
labelled `apps`/`tunnel`):

```
pnpm dev:all       # apps + ngrok tunnels
```

Apps-only (no tunnel, e.g. if you haven't set up `ngrok.local.yml`):

```
pnpm dev:apps      # the four apps on localhost
pnpm dev:tunnel    # the ngrok tunnels on their own (optional, second terminal)
```

`dev:all` won't kill the apps if the tunnel fails (e.g. missing token) — you'll just
see ngrok errors under the `tunnel` label while the apps keep running.

Then copy the **"ngrok / prog-subdomain dev"** block from each app's `.env.example` into its
`.env` (api, web, auth, marketing) and restart `dev:all`. The key overrides:

- **api**: `SESSION_COOKIE_DOMAIN=.dev.prog.network`, `AUTH_APP_URL=https://auth.dev.prog.network`,
  `API_BASE_URL=https://api.dev.prog.network`,
  `CORS_ALLOWED_ORIGINS=https://app.dev.prog.network,https://auth.dev.prog.network,https://dev.prog.network`
- **web / marketing**: `NEXT_PUBLIC_API_URL=https://api.dev.prog.network/api/v1`,
  `NEXT_PUBLIC_AUTH_APP_URL=https://auth.dev.prog.network`
- **auth**: `NEXT_PUBLIC_API_URL=https://api.dev.prog.network/api/v1`,
  `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS=https://app.dev.prog.network`

The `.dev.prog.network` cookie domain lets the `auth_token` session cookie issued by the API
be shared across all four subdomains (SSO). Webhook callback URLs derive from `API_BASE_URL`,
so providers POST to `https://api.dev.prog.network/api/v1/...`.

## Smoke check

```
curl -sI https://dev.prog.network                       # marketing 200
curl -sI https://auth.dev.prog.network/sign-in          # auth 200
curl -s  https://api.dev.prog.network/api/v1/health     # api ok
```

Open `https://app.dev.prog.network/dashboard` unauthenticated → it should bounce to
`https://auth.dev.prog.network/sign-in?return_to=…`; signing in lands back on
`app.dev.prog.network`.

Plain `pnpm dev:all` on `localhost` (the default `.env` block) keeps working without ngrok.
